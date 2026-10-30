import { useEffect, useState, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import MedicalBadge from '../../components/MedicalBadge'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'
import { fmtDate } from '../../lib/dates'
import { notifyTeachersOfGroup } from '../../lib/notifications'
import { loadAttendanceStats } from '../../lib/attendance'
import { CLASS_META, loadClassTypes } from '../../lib/classTypes'
import { loadExtraClassEnrollments } from '../../lib/classRoster'
import { getVerificationStatus, VERIFICATION_REASON_LABEL } from '../../lib/verification'
import { exportCSV } from '../../lib/csv'
import { studentIssues, findDuplicates, ISSUE_TYPES, phoneFormatFix, normalizeUkPhone, validateStudentForm, phoneDigits } from '../../lib/studentChecks'
import PhoneInput from '../../components/PhoneInput'
import MedicalQuestion from '../../components/MedicalQuestion'
import { medicalStatus, MEDICAL_STATUS_LABEL, medicalAnswerFor, medicalPayload, medicalError, hasMedicalNotes } from '../../lib/medical'
import { IssueBadge, IssueList, IssuePill, FieldError, FormWarnings } from '../../components/StudentIssues'

// Admin/registrar filter panel - every field starts "off"
const EMPTY_FILTERS = {
  group: '', extra: '', ageMin: '', ageMax: '', joinedFrom: '', joinedTo: '', area: '',
  medical: '', consent: '', attendance: '', verification: '', progress: '', issues: '',
}
const ATTENDANCE_BANDS = { lt50: 'Below 50%', '50to74': '50–74%', '75plus': '75% and above', none: 'No records yet' }

// Every date matching the group's weekly schedule between start and end
// (inclusive), used to build the full theoretical calendar of class days -
// not just the ones someone happened to take a register for.
function classDatesBetween(startStr, endStr, daysOfWeek) {
  const dates = []
  if (!startStr || !endStr || !daysOfWeek?.length) return dates
  const d = new Date(startStr + 'T12:00:00')
  const end = new Date(endStr + 'T12:00:00')
  while (d <= end) {
    if (daysOfWeek.includes(d.getDay())) dates.push(d.toISOString().split('T')[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

function calcAgeRange(students) {
  if (!students?.length) return null
  const now = new Date()
  const ages = students.map(s => {
    if (!s.date_of_birth) return null
    const d = new Date(s.date_of_birth)
    let a = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
    return a
  }).filter(a => a !== null)
  if (!ages.length) return null
  const min = Math.min(...ages), max = Math.max(...ages)
  return min === max ? `${min}y` : `${min}–${max}y`
}

const AVATARS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6']
const color = (i) => AVATARS[i % AVATARS.length]

const PROGRESS = {
  excellent:           { label: 'Excellent Progress',  color: '#16a34a' },
  good:                { label: 'Good Progress',        color: '#2563eb' },
  progressing:         { label: 'Progressing Well',     color: '#0d9488' },
  needs_support:       { label: 'Needs Support',        color: '#d97706' },
  behaviour_issues:    { label: 'Behaviour Issues',     color: '#dc2626' },
  low_attendance:      { label: 'Low Attendance',       color: '#ea580c' },
  awaiting_assessment: { label: 'Awaiting Assessment',  color: '#6b7280' },
}

const STATUS_COLOR = { present: '#16a34a', late: '#d97706', absent: '#dc2626', holiday: '#0284c7' }

export default function AdminStudents({ readOnly }) {
  const { profile, hasRole } = useAuth()
  // Full filter panel for admins and registrars; CSV download for admins only
  const canFilter = hasRole('admin') || hasRole('registrar')
  const canExport = hasRole('admin')
  const [filters, setFilters]   = useState(EMPTY_FILTERS)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [verifications, setVerifications] = useState({ latest: {}, since: null })
  const [students, setStudents] = useState([])
  const [groups, setGroups]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [attendOpen, setAttendOpen]   = useState({})
  const [attendLoading, setAttendLoading] = useState({})
  const [editBusy, setEditBusy] = useState(null)
  const [sortCol, setSortCol] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [removalRequests, setRemovalRequests] = useState([])
  const [removalBusy, setRemovalBusy] = useState(null)
  const [editingStudentId, setEditingStudentId] = useState(null)
  const [editForm, setEditForm] = useState(null)
  const [savingStudent, setSavingStudent] = useState(false)
  const [editTried, setEditTried] = useState(false)   // show field errors only after a save attempt
  const [phoneFixOpen, setPhoneFixOpen] = useState(false)
  const [phoneFixBusy, setPhoneFixBusy] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [teacherMap, setTeacherMap] = useState({})
  const [attendance, setAttendance] = useState({})  // studentId -> { pct, sessions }
  const [classTypesMeta, setClassTypesMeta] = useState(CLASS_META)
  const [extraClasses, setExtraClasses] = useState({})  // studentId -> [{ class_type, groupName }]

  useEffect(() => { load() }, [])
  useEffect(() => { loadClassTypes().then(extra => setClassTypesMeta({ ...CLASS_META, ...extra })) }, [])
  useEffect(() => { loadExtraClassEnrollments().then(setExtraClasses) }, [])

  async function loadVerifications() {
    const [{ data: v }, { data: st }] = await Promise.all([
      supabase.from('student_verifications').select('student_id, verified_at, verified_by_name, snapshot').order('verified_at', { ascending: false }),
      supabase.from('site_settings').select('value').eq('key', 'verification_required_since').maybeSingle(),
    ])
    const latest = {}
    ;(v || []).forEach(r => { if (!latest[r.student_id]) latest[r.student_id] = r })
    setVerifications({ latest, since: st?.value || null })
  }
  useEffect(() => { if (canFilter) loadVerifications() }, [canFilter])

  async function load() {
    const [{ data: s }, { data: g }, { data: n }, { data: removals }, { data: us }, { data: tg }, attMap] = await Promise.all([
      supabase.from('students').select('*, groups(id, name, class_type)').eq('active', true).order('first_name').order('last_name'),
      supabase.from('groups').select('id, name, teacher_id, students(date_of_birth)').eq('active', true).order('name'),
      supabase.from('student_notes').select('student_id, progress_level, comments, updated_at'),
      supabase.from('transfer_requests').select('*')
        .eq('request_type', 'removal').eq('status', 'pending'),
      supabase.from('users').select('id, name, role, extra_roles'),
      supabase.from('teacher_groups').select('teacher_id, group_id'),
      loadAttendanceStats(),
    ])
    setAttendance(attMap)
    const teacherUsers = (us || []).filter(u => u.role === 'teacher' || (u.extra_roles || []).includes('teacher'))
    const teacherMap = Object.fromEntries(teacherUsers.map(u => [u.id, u.name]))
    setTeacherMap(teacherMap)
    // A group's teacher can be set via the legacy groups.teacher_id field or via
    // the teacher_groups junction (multi-teacher groups) — check both, same as
    // AdminGroups.jsx.
    const tgGroupMap = {}
    ;(tg || []).forEach(r => { if (!tgGroupMap[r.group_id] && teacherMap[r.teacher_id]) tgGroupMap[r.group_id] = teacherMap[r.teacher_id] })
    const noteMap = {}
    ;(n || []).forEach(note => { noteMap[note.student_id] = note })
    setStudents((s || []).map(st => ({ ...st, note: noteMap[st.id] || null })))
    setGroups((g || []).map(grp => ({ ...grp, teacherName: teacherMap[grp.teacher_id] || tgGroupMap[grp.id] || null })))
    setRemovalRequests(removals || [])
    setLoading(false)
  }

  function startEditStudent(s) {
    if (readOnly) return
    setExpanded(s.id)
    setEditForm({
      first_name: s.first_name || '', middle_name: s.middle_name || '', last_name: s.last_name || '',
      date_of_birth: s.date_of_birth || '',
      parent_name: s.parent_name || '', relationship: s.relationship || '',
      phone: phoneDigits(s.phone), secondary_phone: phoneDigits(s.secondary_phone),
      email: s.email || '', house_no: s.house_no || '', street_name: s.street_name || '',
      town: s.town || '', postcode: s.postcode || '',
      has_medical_condition: medicalAnswerFor(s),
      medical_notes: hasMedicalNotes(s.medical_notes) ? s.medical_notes : '',
      photo_consent: s.photo_consent || false,
    })
    setEditTried(false)
    setEditingStudentId(s.id)
  }

  function cancelEditStudent() {
    setEditingStudentId(null)
    setEditForm(null)
  }

  function setEdit(k) { return e => setEditForm(f => ({ ...f, [k]: e.target.value })) }
  function setEditCheck(k) { return e => setEditForm(f => ({ ...f, [k]: e.target.checked })) }

  async function saveEditStudent(studentId) {
    if (readOnly) return
    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      alert('First name and last name are required'); return
    }
    setEditTried(true)
    if (Object.keys(validateStudentForm(editForm, { isNew: false }).errors).length) return
    if (medicalError(editForm, { required: false })) return
    setSavingStudent(true)
    try {
      const payload = {
        first_name: editForm.first_name.trim(),
        middle_name: editForm.middle_name.trim() || null,
        last_name: editForm.last_name.trim(),
        date_of_birth: editForm.date_of_birth || null,
        parent_name: editForm.parent_name.trim() || null,
        relationship: editForm.relationship.trim() || null,
        // Phones stored the way the sign-up form stores them (+44...)
        phone: normalizeUkPhone(editForm.phone) || editForm.phone.trim() || null,
        secondary_phone: normalizeUkPhone(editForm.secondary_phone) || editForm.secondary_phone.trim() || null,
        email: editForm.email.trim() || null,
        house_no: editForm.house_no.trim() || null,
        street_name: editForm.street_name.trim() || null,
        town: editForm.town.trim() || null,
        postcode: editForm.postcode.trim() || null,
        ...medicalPayload(editForm),
        photo_consent: editForm.photo_consent,
      }
      const { error } = await supabase.from('students').update(payload).eq('id', studentId)
      if (error) throw error
      logAction(profile, 'Updated student details', `${payload.first_name} ${payload.last_name}`).catch(() => {})
      setEditingStudentId(null)
      setEditForm(null)
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSavingStudent(false) }
  }

  async function loadAttendHistory(studentId) {
    setAttendLoading(prev => ({ ...prev, [studentId]: true }))
    const s = students.find(x => x.id === studentId)
    const { data: records } = await supabase
      .from('attendance_records')
      .select('session_id, session_date, status, group_id')
      .eq('student_id', studentId)

    // Any group the student already has a record in: show those exact
    // records as-is. We don't know when they actually left a past group
    // (no membership-history table), so we can't safely build a theoretical
    // calendar for one - just show what's really there.
    const merged = new Map()
    ;(records || []).forEach(r => {
      merged.set(r.session_date + '|' + r.group_id, {
        session_id: r.session_id, session_date: r.session_date, group_id: r.group_id, status: r.status,
      })
    })

    // For their CURRENT group: build the full theoretical calendar of class
    // days (based on that group's weekly schedule), not just the ones
    // someone happened to take a register for - so a day the teacher never
    // even opened the register shows up too, not only days with no record
    // for this one student. Clamped to the group's own earliest actual
    // session so an unreliable/placeholder date_joined (common on students
    // from the original import - see the hint below) can't generate years
    // of bogus entries predating the app itself.
    if (s?.group_id) {
      const { data: groupSessions } = await supabase
        .from('attendance_sessions')
        .select('id, session_date')
        .eq('group_id', s.group_id)
        .order('session_date', { ascending: true })
      if (groupSessions?.length) {
        const sessionIdByDate = new Map(groupSessions.map(x => [x.session_date, x.id]))
        const earliestSessionDate = groupSessions[0].session_date
        const startStr = (s.date_joined && s.date_joined > earliestSessionDate) ? s.date_joined : earliestSessionDate
        const todayStr = new Date().toISOString().split('T')[0]
        const classType = s.groups?.class_type || 'punjabi'
        const days = classTypesMeta[classType]?.days || CLASS_META.punjabi.days
        classDatesBetween(startStr, todayStr, days).forEach(dateStr => {
          const key = dateStr + '|' + s.group_id
          if (merged.has(key)) return  // already have a real record for this date
          merged.set(key, {
            session_id: sessionIdByDate.get(dateStr) || null,  // null = no register was even taken that day
            session_date: dateStr, group_id: s.group_id, status: null,
          })
        })
      }
    }

    const result = [...merged.values()].sort((a, b) => b.session_date.localeCompare(a.session_date))
    setAttendOpen(prev => ({ ...prev, [studentId]: result }))
    setAttendLoading(prev => ({ ...prev, [studentId]: false }))
  }

  function toggleAttend(studentId) {
    if (attendOpen[studentId] !== undefined) {
      setAttendOpen(prev => { const n = { ...prev }; delete n[studentId]; return n })
    } else {
      loadAttendHistory(studentId)
      const s = students.find(x => x.id === studentId)
      const name = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : studentId
      logAction(profile, 'Viewed attendance history', name).catch(() => {})
    }
  }

  async function editRecord(studentId, record, newStatus) {
    if (editBusy) return
    if (!record.session_id) return  // no register was taken that day at all - nothing to attach a status to
    const s    = students.find(x => x.id === studentId)
    const name = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : studentId
    const key  = record.session_id + studentId

    if (record.status && record.status === newStatus) {
      // Tap active status → clear it back to not-marked, rather than
      // removing the row entirely - the session still happened, we're just
      // no longer saying what this student's status was for it.
      setEditBusy(key)
      try {
        const { error } = await supabase.from('attendance_records')
          .delete()
          .eq('session_id', record.session_id)
          .eq('student_id', studentId)
        if (error) throw error
        setAttendOpen(prev => ({
          ...prev,
          [studentId]: prev[studentId].map(r =>
            r.session_id === record.session_id ? { ...r, status: null } : r
          ),
        }))
        await logAction(profile, 'Edited attendance record',
          `Cleared ${name} on ${record.session_date}`)
      } catch (err) { alert('Error: ' + err.message) }
      finally { setEditBusy(null) }
      return
    }

    setEditBusy(key)
    try {
      // upsert rather than update - record may not exist yet if this session
      // was never marked for this student at all (a gap, now shown rather
      // than hidden).
      const { error } = await supabase.from('attendance_records')
        .upsert({
          session_id: record.session_id,
          student_id: studentId,
          group_id: record.group_id,
          session_date: record.session_date,
          status: newStatus,
        }, { onConflict: 'session_id,student_id' })
      if (error) throw error
      setAttendOpen(prev => ({
        ...prev,
        [studentId]: prev[studentId].map(r =>
          r.session_id === record.session_id ? { ...r, status: newStatus } : r
        ),
      }))
      await logAction(profile, 'Edited attendance record',
        `Set ${name} to ${newStatus} on ${record.session_date}`)
    } catch (err) { alert('Error: ' + err.message) }
    finally { setEditBusy(null) }
  }

  async function moveGroup(studentId, newGroupId) {
    if (readOnly) return
    await supabase.from('students').update({ group_id: newGroupId }).eq('id', studentId)
    const s = students.find(x => x.id === studentId)
    const g = groups.find(x => x.id === newGroupId)
    const name = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : studentId
    logAction(profile, 'Moved student to group', `${name} → ${g?.name || newGroupId}`).catch(() => {})
    const fromGroup = groups.find(x => x.id === s?.group_id)
    const msg = fromGroup
      ? `${name} has been moved to your group from ${fromGroup.name}`
      : `${name} has been moved to your group`
    notifyTeachersOfGroup(newGroupId, msg).catch(() => {})
    load()
  }

  async function updateDateJoined(studentId, newDate) {
    if (readOnly || !newDate) return
    const { error } = await supabase.from('students').update({ date_joined: newDate }).eq('id', studentId)
    if (error) { alert('Error updating date joined: ' + error.message); return }
    const s = students.find(x => x.id === studentId)
    const name = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : studentId
    logAction(profile, 'Corrected date joined', `${name} → ${fmtDate(newDate)}`).catch(() => {})
    load()
  }

  function deactivate(studentId) {
    if (readOnly) return
    const s = students.find(x => x.id === studentId)
    const name = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : studentId
    setDialog({
      message: `Remove ${name} from the system? They will be moved to the archive.`,
      confirmText: 'Remove Student',
      danger: true,
      needsReason: true,
      reasonLabel: 'Reason for removal (required for GDPR record):',
      onConfirm: async (reason) => {
        setDialog(null)
        const result = await supabase.from('students').update({
          active: false,
          archived_at: new Date().toISOString(),
          archived_by_id: profile.id,
          archived_by_name: profile.name,
          deletion_reason: reason || null,
          deletion_requested_by_name: null,
        }).eq('id', studentId)
        let error = result.error
        if (error?.message?.includes('archived_at')) {
          // Migration not run yet — still remove the student, just without
          // the archive fields the Archive tab needs to show them.
          const fallback = await supabase.from('students').update({ active: false }).eq('id', studentId)
          error = fallback.error
        }
        if (error) { alert('Error archiving student: ' + error.message); return }
        logAction(profile, 'Removed student', name).catch(() => {})
        load()
      },
    })
  }

  async function approveRemoval(req) {
    setRemovalBusy(req.id)
    try {
      const requesterName = teacherMap[req.requested_by] || null
      const result = await supabase.from('students').update({
        active: false,
        archived_at: new Date().toISOString(),
        archived_by_id: profile.id,
        archived_by_name: profile.name,
        deletion_reason: req.reason || null,
        deletion_requested_by_name: requesterName,
      }).eq('id', req.student_id)
      let e1 = result.error
      if (e1?.message?.includes('archived_at')) {
        // Migration not run yet — still remove the student, just without the
        // archive fields the Archive tab needs to show them.
        const fallback = await supabase.from('students').update({ active: false }).eq('id', req.student_id)
        e1 = fallback.error
      }
      if (e1) throw e1
      await supabase.from('transfer_requests').update({ status: 'approved' }).eq('id', req.id)
      logAction(profile, 'Approved student removal', req.student_name).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setRemovalBusy(null) }
  }

  async function rejectRemoval(req) {
    setRemovalBusy(req.id)
    try {
      await supabase.from('transfer_requests').update({ status: 'rejected' }).eq('id', req.id)
      logAction(profile, 'Rejected student removal', req.student_name).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setRemovalBusy(null) }
  }

  function calcAge(dob) {
    if (!dob) return null
    const d = new Date(dob), now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
    return a
  }

  function attColor(p) {
    if (p === null) return '#94a3b8'
    return p >= 80 ? '#16a34a' : p >= 65 ? '#d97706' : '#dc2626'
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function sortIcon(col) {
    if (sortCol !== col) return <span style={{ marginLeft: 3, fontSize: '.6rem', color: '#cbd5e1' }}>⇅</span>
    return <span style={{ marginLeft: 3, fontSize: '.6rem', color: 'var(--primary)' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const verificationOf = s => getVerificationStatus(s, verifications.latest[s.id], verifications.since)
  const attendanceBand = s => {
    const a = attendance[s.id]
    if (!a || a.pct === null || a.pct === undefined) return 'none'
    return a.pct < 50 ? 'lt50' : a.pct < 75 ? '50to74' : '75plus'
  }
  // Data checks - see lib/studentChecks.js
  const duplicates = canFilter ? findDuplicates(students) : {}
  const issueMap = canFilter ? Object.fromEntries(students.map(s => [s.id, studentIssues(s, duplicates)])) : {}
  const issuesOf = s => issueMap[s.id] || []
  const issueCounts = {}
  let seriousCount = 0
  students.forEach(s => {
    const iss = issuesOf(s)
    if (iss.some(i => i.level === 'error')) seriousCount++
    iss.forEach(i => { issueCounts[i.key] = (issueCounts[i.key] || 0) + 1 })
  })
  const phoneFixes = canExport
    ? students.map(s => ({ s, to: phoneFormatFix(s.phone) })).filter(x => x.to)
    : []
  const editCheck = editForm ? validateStudentForm(editForm, { isNew: false }) : null
  const editErr = k => editTried ? editCheck?.errors[k] : null

  const setFilter = k => e => setFilters(f => ({ ...f, [k]: e.target.value }))
  const clearFilter = k => setFilters(f => ({ ...f, [k]: '' }))

  const filtered = students.filter(s => {
    const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ').toLowerCase()
    const q = search.trim().toLowerCase()
    if (canFilter) {
      // Search across name, parent, phones, email, postcode and reference
      if (q) {
        const digits = q.replace(/\D/g, '')
        const hay = [name, s.parent_name, s.email, s.postcode, s.student_ref].filter(Boolean).join(' ').toLowerCase()
        const phones = [s.phone, s.secondary_phone].filter(Boolean).join(' ').replace(/\D/g, '')
        if (!hay.includes(q) && !(digits.length >= 4 && phones.includes(digits))) return false
      }
      const f = filters
      if (f.group === '__none' ? !!s.group_id : (f.group && s.group_id !== f.group)) return false
      const extras = extraClasses[s.id] || []
      if (f.extra === '__none' ? extras.length > 0 : (f.extra && !extras.some(ec => ec.class_type === f.extra))) return false
      const age = calcAge(s.date_of_birth)
      if (f.ageMin !== '' && (age === null || age < Number(f.ageMin))) return false
      if (f.ageMax !== '' && (age === null || age > Number(f.ageMax))) return false
      if (f.joinedFrom && (!s.date_joined || s.date_joined < f.joinedFrom)) return false
      if (f.joinedTo && (!s.date_joined || s.date_joined > f.joinedTo)) return false
      if (f.area) {
        const a = f.area.trim().toLowerCase()
        if (![s.town, s.postcode, s.street_name].filter(Boolean).join(' ').toLowerCase().includes(a)) return false
      }
      if (f.medical && medicalStatus(s) !== f.medical) return false
      if (f.consent === 'yes' && !s.photo_consent) return false
      if (f.consent === 'no' && s.photo_consent) return false
      if (f.attendance && attendanceBand(s) !== f.attendance) return false
      if (f.verification) {
        const v = verificationOf(s)
        if (f.verification === 'verified' ? !v.verified : v.verified || v.reason !== f.verification) return false
      }
      if (f.progress === '__none' ? !!s.note?.progress_level : (f.progress && s.note?.progress_level !== f.progress)) return false
      if (f.issues) {
        const iss = issuesOf(s)
        if (f.issues === 'any' ? !iss.length
          : f.issues === 'serious' ? !iss.some(i => i.level === 'error')
          : !iss.some(i => i.key === f.issues)) return false
      }
      return true
    }
    const matchSearch = !q || name.includes(q)
    const matchGroup  = !groupFilter || s.group_id === groupFilter
    return matchSearch && matchGroup
  })

  // Chips for every active filter
  const groupName = id => groups.find(g => g.id === id)?.name || 'Unknown group'
  const activeChips = canFilter ? [
    filters.group && ['group', `Group: ${filters.group === '__none' ? 'No group' : groupName(filters.group)}`],
    filters.extra && ['extra', `Extra class: ${filters.extra === '__none' ? 'None' : (classTypesMeta[filters.extra]?.label || filters.extra)}`],
    (filters.ageMin !== '' || filters.ageMax !== '') && ['age', `Age ${filters.ageMin || '…'}–${filters.ageMax || '…'}`],
    (filters.joinedFrom || filters.joinedTo) && ['joined', `Joined ${filters.joinedFrom ? fmtDate(filters.joinedFrom) : '…'} to ${filters.joinedTo ? fmtDate(filters.joinedTo) : '…'}`],
    filters.area && ['area', `Area: ${filters.area}`],
    filters.medical && ['medical', `Medical: ${{ yes: 'Yes', no: 'No', unknown: 'Not recorded' }[filters.medical]}`],
    filters.consent && ['consent', `Photo consent: ${filters.consent === 'yes' ? 'Yes' : 'No'}`],
    filters.attendance && ['attendance', `Attendance: ${ATTENDANCE_BANDS[filters.attendance]}`],
    filters.verification && ['verification', filters.verification === 'verified' ? 'Verified' : VERIFICATION_REASON_LABEL[filters.verification]],
    filters.progress && ['progress', `Progress: ${filters.progress === '__none' ? 'Not set' : PROGRESS[filters.progress]?.label}`],
    filters.issues && ['issues', `Details: ${filters.issues === 'any' ? 'Any issue' : filters.issues === 'serious' ? 'Serious issues' : ISSUE_TYPES[filters.issues]?.label}`],
  ].filter(Boolean) : []
  function removeChip(key) {
    if (key === 'age') setFilters(f => ({ ...f, ageMin: '', ageMax: '' }))
    else if (key === 'joined') setFilters(f => ({ ...f, joinedFrom: '', joinedTo: '' }))
    else clearFilter(key)
  }

  // Admin one-click fix: format only (e.g. 7700900123 -> +447700900123), never
  // the number itself. Each update only applies if the phone is still what
  // was previewed, so a change made meanwhile by someone else is left alone.
  async function applyPhoneFixes() {
    setDialog(null)
    setPhoneFixBusy(true)
    let done = 0
    for (const { s, to } of phoneFixes) {
      const { data, error } = await supabase.from('students').update({ phone: to })
        .eq('id', s.id).eq('phone', s.phone).select('id')
      if (!error && data?.length) done++
    }
    logAction(profile, 'Fixed phone number formats',
      `${done} of ${phoneFixes.length} students – format only, e.g. 7700900123 → +447700900123`).catch(() => {})
    setPhoneFixBusy(false)
    setPhoneFixOpen(false)
    await load()
    alert(`${done} phone numbers tidied.${done < phoneFixes.length ? ` ${phoneFixes.length - done} were skipped (changed meanwhile or not saved).` : ''}`)
  }

  function downloadCSV() {
    const v = s => verificationOf(s)
    const cols = [
      { label: 'Ref',             get: s => s.student_ref },
      { label: 'First Name',      get: s => s.first_name },
      { label: 'Middle Name',     get: s => s.middle_name },
      { label: 'Last Name',       get: s => s.last_name },
      { label: 'Date of Birth',   get: s => s.date_of_birth ? fmtDate(s.date_of_birth) : '' },
      { label: 'Age',             get: s => calcAge(s.date_of_birth) ?? '' },
      { label: 'Group',           get: s => s.groups?.name || '' },
      { label: 'Extra Classes',   get: s => (extraClasses[s.id] || []).map(ec => ec.groupName).join(', ') },
      { label: 'Parent/Guardian', get: s => s.parent_name },
      { label: 'Relationship',    get: s => s.relationship },
      { label: 'Phone',           get: s => s.phone },
      { label: 'Secondary Phone', get: s => s.secondary_phone },
      { label: 'Email',           get: s => s.email },
      { label: 'Address',         get: s => [s.house_no, s.street_name, s.town].filter(Boolean).join(', ') },
      { label: 'Postcode',        get: s => s.postcode },
      { label: 'Medical Condition', get: s => ({ yes: 'Yes', no: 'No', unknown: 'Not recorded' })[medicalStatus(s)] },
      { label: 'Medical Notes',   get: s => hasMedicalNotes(s.medical_notes) ? s.medical_notes : '' },
      { label: 'Photo Consent',   get: s => s.photo_consent ? 'Yes' : 'No' },
      { label: 'Date Joined',     get: s => s.date_joined ? fmtDate(s.date_joined) : '' },
      { label: 'Attendance %',    get: s => attendance[s.id]?.pct ?? '' },
      { label: 'Verification',    get: s => v(s).verified ? 'Verified' : VERIFICATION_REASON_LABEL[v(s).reason] },
      { label: 'Progress',        get: s => PROGRESS[s.note?.progress_level]?.label || '' },
    ]
    exportCSV(sorted, cols, `students-${new Date().toISOString().slice(0, 10)}.csv`)
    // Personal data leaving the app - record who and how many
    logAction(profile, 'Downloaded students CSV', `${sorted.length} students${activeChips.length ? ' · ' + activeChips.map(c => c[1]).join('; ') : ''}`).catch(() => {})
  }

  const sorted = [...filtered].sort((a, b) => {
    let va, vb
    if (sortCol === 'name') {
      va = [a.first_name, a.last_name].filter(Boolean).join(' ').toLowerCase()
      vb = [b.first_name, b.last_name].filter(Boolean).join(' ').toLowerCase()
    } else if (sortCol === 'age') {
      va = calcAge(a.date_of_birth) ?? -1
      vb = calcAge(b.date_of_birth) ?? -1
    } else if (sortCol === 'dob') {
      va = a.date_of_birth || ''
      vb = b.date_of_birth || ''
    } else if (sortCol === 'group') {
      va = a.groups?.name?.toLowerCase() || ''
      vb = b.groups?.name?.toLowerCase() || ''
    } else if (sortCol === 'phone') {
      va = a.phone || ''
      vb = b.phone || ''
    } else if (sortCol === 'date_joined') {
      va = a.date_joined || ''
      vb = b.date_joined || ''
    } else if (sortCol === 'attendance') {
      va = attendance[a.id]?.pct ?? -1
      vb = attendance[b.id]?.pct ?? -1
    } else { return 0 }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  if (loading) return <div className="spinner" />

  return (
    <>
    {dialog && <ConfirmDialog {...dialog} onCancel={() => setDialog(null)} />}
    {removalRequests.length > 0 && (
      <div className="card" style={{ borderTop: '3px solid #dc2626' }}>
        <div className="card-title" style={{ color: '#991b1b' }}>
          Pending Removal Requests ({removalRequests.length})
        </div>
        {removalRequests.map(req => (
          <div key={req.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0',
            borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontWeight: 700, fontSize: '.92rem' }}>{req.student_name}</div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>
                Group: {req.from_group_name || 'Unknown'}
              </div>
              {req.reason && (
                <div style={{ fontSize: '.82rem', marginTop: 5, color: '#374151' }}>
                  <strong>Reason:</strong> {req.reason}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'center' }}>
              <button className="btn btn-danger btn-sm"
                disabled={removalBusy === req.id}
                onClick={() => approveRemoval(req)}>
                {removalBusy === req.id ? 'Processing…' : 'Approve'}
              </button>
              <button className="btn btn-outline btn-sm"
                disabled={removalBusy === req.id}
                onClick={() => rejectRemoval(req)}>
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
    {canFilter && (
      <div className="card">
        <div className="card-title">
          Student details check
          <IssuePill level={seriousCount ? 'error' : 'warning'} active={filters.issues === 'serious'}
            onClick={() => setFilters(f => ({ ...f, issues: f.issues === 'serious' ? '' : 'serious' }))}>
            {seriousCount} students with serious issues
          </IssuePill>
        </div>
        <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginBottom: 10 }}>
          Click a count to list those students. Red = must be fixed, amber = please check or complete.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(ISSUE_TYPES).filter(([k]) => issueCounts[k]).map(([k, t]) => (
            <IssuePill key={k} level={t.level} active={filters.issues === k}
              onClick={() => setFilters(f => ({ ...f, issues: f.issues === k ? '' : k }))}>
              {t.label}: <strong>{issueCounts[k]}</strong>
            </IssuePill>
          ))}
          {!Object.keys(issueCounts).length && <span style={{ fontSize: '.84rem', color: '#15803d', fontWeight: 600 }}>✓ All student details look complete</span>}
        </div>
        {canExport && !readOnly && phoneFixes.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={() => setPhoneFixOpen(o => !o)}>
                {phoneFixOpen ? 'Hide' : 'Preview'} phone format fix ({phoneFixes.length}) {phoneFixOpen ? '▴' : '▾'}
              </button>
              <span style={{ fontSize: '.76rem', color: 'var(--muted)' }}>
                Only the format changes (e.g. 7700 900123 → +447700900123) – never the number itself.
              </span>
            </div>
            {phoneFixOpen && (
              <div style={{ marginTop: 10 }}>
                <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  <table>
                    <thead><tr><th>Ref</th><th>Student</th><th>Group</th><th>Phone now</th><th>Will become</th></tr></thead>
                    <tbody>
                      {phoneFixes.map(({ s, to }) => (
                        <tr key={s.id}>
                          <td>{s.student_ref}</td>
                          <td>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</td>
                          <td>{s.groups?.name || '—'}</td>
                          <td style={{ fontFamily: 'monospace' }}>{s.phone}</td>
                          <td style={{ fontFamily: 'monospace', color: '#15803d', fontWeight: 700 }}>{to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={phoneFixBusy}
                  onClick={() => setDialog({
                    message: `Tidy the format of ${phoneFixes.length} phone numbers as listed? The numbers themselves don't change, and this is recorded in the Activity log.`,
                    confirmText: 'Fix formats',
                    onConfirm: applyPhoneFixes,
                  })}>
                  {phoneFixBusy ? 'Fixing…' : `Fix these ${phoneFixes.length} phone numbers`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )}
    <div className="card">
      <div className="card-title">
        Students ({canFilter && filtered.length !== students.length ? `${filtered.length} of ${students.length}` : filtered.length})
        {canFilter ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search name, parent, phone, email, postcode or ref…" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: 320, padding: '7px 10px', fontSize: '.84rem' }} />
            {canExport && (
              <button className="btn btn-outline btn-sm" onClick={downloadCSV} disabled={sorted.length === 0}>⬇ Download CSV</button>
            )}
            <button className={`btn btn-sm ${filtersOpen || activeChips.length ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFiltersOpen(o => !o)}>
              Filters{activeChips.length ? ` (${activeChips.length})` : ''} {filtersOpen ? '▴' : '▾'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="text" placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: 170, padding: '7px 10px', fontSize: '.84rem' }} />
            <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
              style={{ padding: '7px 10px', fontSize: '.84rem' }}>
              <option value="">All groups</option>
              {groups.map(g => {
                const range = calcAgeRange(g.students)
                return <option key={g.id} value={g.id}>{g.name}{g.teacherName ? ` — ${g.teacherName}` : ''}{range ? ` (${range})` : ''}</option>
              })}
            </select>
          </div>
        )}
      </div>

      {canFilter && filtersOpen && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '10px 16px',
          background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
          <FilterField label="Group">
            <select value={filters.group} onChange={setFilter('group')}>
              <option value="">Any group</option>
              <option value="__none">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}{g.teacherName ? ` — ${g.teacherName}` : ''}</option>)}
            </select>
          </FilterField>
          <FilterField label="Extra class">
            <select value={filters.extra} onChange={setFilter('extra')}>
              <option value="">Any</option>
              <option value="__none">None</option>
              {Object.entries(classTypesMeta).filter(([k]) => k !== 'punjabi').map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="Age">
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="text" inputMode="numeric" placeholder="From" value={filters.ageMin}
                onChange={e => setFilters(f => ({ ...f, ageMin: e.target.value.replace(/\D/g, '').slice(0, 2) }))} style={{ minWidth: 0, flex: 1 }} />
              <span style={{ color: 'var(--muted)' }}>to</span>
              <input type="text" inputMode="numeric" placeholder="To" value={filters.ageMax}
                onChange={e => setFilters(f => ({ ...f, ageMax: e.target.value.replace(/\D/g, '').slice(0, 2) }))} style={{ minWidth: 0, flex: 1 }} />
            </div>
          </FilterField>
          <FilterField label="Joined" wide>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={filters.joinedFrom} onChange={setFilter('joinedFrom')} style={{ minWidth: 0, flex: 1 }} />
              <span style={{ color: 'var(--muted)' }}>to</span>
              <input type="date" value={filters.joinedTo} onChange={setFilter('joinedTo')} style={{ minWidth: 0, flex: 1 }} />
            </div>
          </FilterField>
          <FilterField label="Town / postcode">
            <input type="text" placeholder="e.g. UB1 or Southall" value={filters.area} onChange={setFilter('area')} />
          </FilterField>
          <FilterField label="Medical condition / allergy">
            <select value={filters.medical} onChange={setFilter('medical')}>
              <option value="">Any</option><option value="yes">Yes</option><option value="no">No (parent answered No)</option><option value="unknown">Not recorded</option>
            </select>
          </FilterField>
          <FilterField label="Photo consent">
            <select value={filters.consent} onChange={setFilter('consent')}>
              <option value="">Any</option><option value="yes">Yes</option><option value="no">No</option>
            </select>
          </FilterField>
          <FilterField label="Attendance">
            <select value={filters.attendance} onChange={setFilter('attendance')}>
              <option value="">Any</option>
              {Object.entries(ATTENDANCE_BANDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </FilterField>
          <FilterField label="Verification">
            <select value={filters.verification} onChange={setFilter('verification')}>
              <option value="">Any</option>
              <option value="verified">Verified</option>
              {Object.entries(VERIFICATION_REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </FilterField>
          <FilterField label="Progress (teacher report)">
            <select value={filters.progress} onChange={setFilter('progress')}>
              <option value="">Any</option>
              <option value="__none">Not set</option>
              {Object.entries(PROGRESS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
            </select>
          </FilterField>
          <FilterField label="Details check">
            <select value={filters.issues} onChange={setFilter('issues')}>
              <option value="">Any</option>
              <option value="serious">Serious issues (red)</option>
              <option value="any">Any issue (incl. missing email)</option>
              {Object.entries(ISSUE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </FilterField>
        </div>
      )}

      {activeChips.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {activeChips.map(([key, label]) => (
            <button key={key} onClick={() => removeChip(key)} title="Remove this filter"
              style={{ fontSize: '.76rem', fontWeight: 600, padding: '4px 10px', borderRadius: 99, border: '1px solid #c7d2fe',
                background: '#eef2ff', color: '#3730a3', cursor: 'pointer', fontFamily: 'inherit' }}>
              {label} ✕
            </button>
          ))}
          <button onClick={() => setFilters(EMPTY_FILTERS)} className="btn btn-outline btn-xs">Clear all</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')} style={{ cursor: 'pointer', userSelect: 'none' }}>Student{sortIcon('name')}</th>
              <th onClick={() => toggleSort('age')}  style={{ cursor: 'pointer', userSelect: 'none' }}>Age{sortIcon('age')}</th>
              <th onClick={() => toggleSort('dob')}  style={{ cursor: 'pointer', userSelect: 'none' }}>DOB{sortIcon('dob')}</th>
              <th onClick={() => toggleSort('group')} style={{ cursor: 'pointer', userSelect: 'none' }}>Group{sortIcon('group')}</th>
              <th onClick={() => toggleSort('phone')} style={{ cursor: 'pointer', userSelect: 'none' }}>Phone{sortIcon('phone')}</th>
              <th onClick={() => toggleSort('date_joined')} style={{ cursor: 'pointer', userSelect: 'none' }}>Date Joined{sortIcon('date_joined')}</th>
              <th onClick={() => toggleSort('attendance')} style={{ cursor: 'pointer', userSelect: 'none' }}>Attendance{sortIcon('attendance')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
              const records  = attendOpen[s.id]
              return (
                <Fragment key={s.id}>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="student-avatar" style={{ background: color(i) }}>
                          {s.first_name?.[0] ?? '?'}{s.last_name?.[0] ?? '?'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <div className="student-name">{fullName}</div>
                            <MedicalBadge notes={s.medical_notes} studentName={fullName} />
                            {canFilter && <IssueBadge issues={issuesOf(s)} />}
                            {(extraClasses[s.id] || []).map(ec => (
                              <span key={ec.class_type} title={`Also enrolled in ${ec.groupName}`}
                                style={{ fontSize: '.68rem', fontWeight: 700, color: '#7c3aed',
                                  background: '#f3e8ff', border: '1px solid #e9d5ff', borderRadius: 10,
                                  padding: '1px 7px', whiteSpace: 'nowrap' }}>
                                {classTypesMeta[ec.class_type]?.label || ec.groupName}
                              </span>
                            ))}
                          </div>
                          {s.note?.progress_level && PROGRESS[s.note.progress_level] && (
                            <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'white',
                              background: PROGRESS[s.note.progress_level].color,
                              borderRadius: 5, padding: '1px 6px', marginTop: 2, display: 'inline-block' }}>
                              {PROGRESS[s.note.progress_level].label}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600 }}>{calcAge(s.date_of_birth) ?? '—'}</td>
                    <td className="date">{fmtDate(s.date_of_birth)}</td>
                    <td>{s.groups?.name || <span style={{ color: 'var(--muted)' }}>No group</span>}</td>
                    <td>{s.phone || '—'}</td>
                    <td className="date">{fmtDate(s.date_joined)}</td>
                    <td>
                      {attendance[s.id]?.pct !== null && attendance[s.id] !== undefined ? (
                        <span style={{ fontWeight: 700, fontSize: '.82rem', color: attColor(attendance[s.id].pct) }}
                          title={`${attendance[s.id].sessions} session${attendance[s.id].sessions === 1 ? '' : 's'} recorded`}>
                          {attendance[s.id].pct}%
                        </span>
                      ) : (
                        <span style={{ fontSize: '.78rem', color: '#94a3b8' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-outline btn-xs"
                          onClick={() => {
                            if (editingStudentId === s.id) cancelEditStudent()
                            setExpanded(expanded === s.id ? null : s.id)
                          }}>
                          {expanded === s.id ? 'Less' : 'Details'}
                        </button>
                        {!readOnly && (
                          <button className="btn btn-outline btn-xs"
                            style={{ color: records !== undefined ? 'var(--primary)' : undefined,
                              borderColor: records !== undefined ? 'var(--primary)' : undefined }}
                            onClick={() => toggleAttend(s.id)}>
                            {records !== undefined ? 'Hide Att.' : 'Attendance'}
                          </button>
                        )}
                        {!readOnly && (
                          <button className="btn btn-outline btn-xs" onClick={() => startEditStudent(s)}>Edit</button>
                        )}
                        {!readOnly && (
                          <button className="btn btn-danger btn-xs" onClick={() => deactivate(s.id)}>Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expanded === s.id && (
                    <tr key={s.id + '-exp'}>
                      <td colSpan={8} style={{ background: '#f8fafc', padding: '12px 16px' }}>
                        {!readOnly && editingStudentId === s.id && editForm ? (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '.85rem', marginBottom: 12, color: 'var(--primary)' }}>
                              Edit Student Details
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Student Details</div>
                            <div className="form-grid" style={{ marginBottom: 12 }}>
                              <div className="form-group">
                                <label>First Name *</label>
                                <input value={editForm.first_name} onChange={setEdit('first_name')} />
                              </div>
                              <div className="form-group">
                                <label>Middle Name</label>
                                <input value={editForm.middle_name} onChange={setEdit('middle_name')} placeholder="Optional" />
                              </div>
                              <div className="form-group">
                                <label>Last Name *</label>
                                <input value={editForm.last_name} onChange={setEdit('last_name')} />
                              </div>
                              <div className="form-group">
                                <label>Date of Birth</label>
                                <input type="date" value={editForm.date_of_birth} onChange={setEdit('date_of_birth')} />
                                <FieldError msg={editErr('date_of_birth')} />
                              </div>
                            </div>

                            <div style={{ fontWeight: 600, fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Parent / Guardian</div>
                            <div className="form-grid" style={{ marginBottom: 12 }}>
                              <div className="form-group">
                                <label>Parent Name</label>
                                <input value={editForm.parent_name} onChange={setEdit('parent_name')} />
                              </div>
                              <div className="form-group">
                                <label>Relationship</label>
                                <select value={editForm.relationship} onChange={setEdit('relationship')}>
                                  <option value="">Select…</option>
                                  {['Mother','Father','Guardian','Grandparent','Sibling','Other'].map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="form-group">
                                <label>Phone</label>
                                <PhoneInput value={editForm.phone} onChange={v => setEditForm(f => ({ ...f, phone: v }))} />
                                <FieldError msg={editErr('phone')} />
                              </div>
                              <div className="form-group">
                                <label>Secondary Phone</label>
                                <PhoneInput value={editForm.secondary_phone} onChange={v => setEditForm(f => ({ ...f, secondary_phone: v }))} placeholder="Optional" />
                                <FieldError msg={editErr('secondary_phone')} />
                              </div>
                              <div className="form-group">
                                <label>Email</label>
                                <input type="email" value={editForm.email} onChange={setEdit('email')} />
                                <FieldError msg={editErr('email')} />
                              </div>
                            </div>

                            <div style={{ fontWeight: 600, fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Address</div>
                            <div className="form-grid" style={{ marginBottom: 12 }}>
                              <div className="form-group">
                                <label>House No.</label>
                                <input value={editForm.house_no} onChange={setEdit('house_no')} />
                              </div>
                              <div className="form-group">
                                <label>Street</label>
                                <input value={editForm.street_name} onChange={setEdit('street_name')} />
                              </div>
                              <div className="form-group">
                                <label>Town</label>
                                <input value={editForm.town} onChange={setEdit('town')} />
                              </div>
                              <div className="form-group">
                                <label>Postcode</label>
                                <input value={editForm.postcode} onChange={setEdit('postcode')} />
                              </div>
                            </div>

                            <div style={{ fontWeight: 600, fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Medical & Consent</div>
                            <MedicalQuestion value={editForm} required={false}
                              onChange={v => setEditForm(f => ({ ...f, has_medical_condition: v.has_medical_condition, medical_notes: v.medical_notes }))}
                              error={editTried ? medicalError(editForm, { required: false }) : null} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', marginBottom: 16, cursor: 'pointer' }}>
                              <input type="checkbox" checked={editForm.photo_consent} onChange={setEditCheck('photo_consent')} style={{ width: 'auto' }} />
                              Photo consent given
                            </label>

                            <FormWarnings warnings={[...(editCheck?.warnings || []),
                              ...(editForm.has_medical_condition == null ? ['Medical question not answered yet - please ask the parent'] : [])]} />
                            {editTried && (Object.keys(editCheck?.errors || {}).length > 0 || medicalError(editForm, { required: false })) && (
                              <div style={{ color: '#dc2626', fontSize: '.8rem', fontWeight: 600, marginBottom: 10 }}>
                                Please correct the fields marked in red.
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn btn-success" disabled={savingStudent} onClick={() => saveEditStudent(s.id)}>
                                {savingStudent ? 'Saving…' : 'Save Changes'}
                              </button>
                              <button className="btn btn-outline" onClick={cancelEditStudent}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {canFilter && <IssueList issues={issuesOf(s)} />}
                            <div className="app-details">
                              <Detail label="Parent/Guardian" value={s.parent_name} />
                              <Detail label="Relationship" value={s.relationship} />
                              <Detail label="Phone" value={s.phone} />
                              <Detail label="Secondary Phone" value={s.secondary_phone || '—'} />
                              <Detail label="Email" value={s.email || '—'} />
                              <Detail label="Address" value={[s.house_no, s.street_name, s.town, s.postcode].filter(Boolean).join(', ')} />
                              <Detail label="Medical Condition / Allergy" value={medicalStatus(s) === 'yes' && hasMedicalNotes(s.medical_notes) ? s.medical_notes : MEDICAL_STATUS_LABEL[medicalStatus(s)]} />
                              <Detail label="Photo Consent" value={s.photo_consent ? 'Yes' : 'No'} />
                              {s.note?.progress_level && (
                                <Detail label="Teacher Assessment"
                                  value={PROGRESS[s.note.progress_level]?.label || s.note.progress_level} />
                              )}
                              {s.note?.comments && <Detail label="Teacher Comments" value={s.note.comments} />}
                              {s.note?.updated_at && (
                                <Detail label="Notes Last Updated"
                                  value={fmtDate(s.note.updated_at)} />
                              )}
                            </div>
                            {!readOnly && (
                              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                                <label style={{ fontSize: '.8rem', marginBottom: 0 }}>Move to group:</label>
                                <select value={s.group_id || ''} onChange={e => e.target.value && e.target.value !== s.group_id && moveGroup(s.id, e.target.value)}
                                  style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.83rem' }}>
                                  <option value="">— select —</option>
                                  {groups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name} — {g.teacherName || 'No teacher'}</option>
                                  ))}
                                </select>
                              </div>
                            )}
                            {!readOnly && (
                              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                                <label style={{ fontSize: '.8rem', marginBottom: 0 }}>Date joined:</label>
                                <input type="date" defaultValue={s.date_joined || ''}
                                  onBlur={e => e.target.value && e.target.value !== s.date_joined && updateDateJoined(s.id, e.target.value)}
                                  style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.83rem' }} />
                                <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                                  Correct this if it was set automatically on import rather than their real join date
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  )}

                  {records !== undefined && (
                    <tr key={s.id + '-att'}>
                      <td colSpan={8} style={{ background: '#f0f9ff', padding: '12px 16px', borderTop: '2px solid #bae6fd' }}>
                        <div style={{ fontWeight: 700, fontSize: '.82rem', color: '#0369a1', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <span>
                            Attendance History — {fullName}
                            {records.length > 0 && (
                              <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                                {records.length} class day{records.length !== 1 ? 's' : ''} · tap active status to clear, tap another to change
                              </span>
                            )}
                          </span>
                        </div>
                        {attendLoading[s.id] ? (
                          <div className="spinner" style={{ width: 24, height: 24 }} />
                        ) : records.length === 0 ? (
                          <div style={{ fontSize: '.83rem', color: 'var(--muted)' }}>No class days found for this student's group.</div>
                        ) : (
                          <div style={{ maxHeight: 300, overflowY: 'auto', borderRadius: 8, border: '1px solid #bae6fd' }}>
                            <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
                              <thead>
                                <tr style={{ background: '#e0f2fe', position: 'sticky', top: 0 }}>
                                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#0369a1', fontSize: '.72rem' }}>Date</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#0369a1', fontSize: '.72rem' }}>Day</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#0369a1', fontSize: '.72rem' }}>Status</th>
                                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: '#0369a1', fontSize: '.72rem' }}>Edit</th>
                                </tr>
                              </thead>
                              <tbody>
                                {records.map(r => {
                                  const d     = new Date(r.session_date + 'T12:00:00')
                                  const isBusy = editBusy === r.session_id + s.id
                                  return (
                                    <tr key={r.session_date + r.group_id} style={{ borderTop: '1px solid #bae6fd', opacity: isBusy ? 0.5 : 1 }}>
                                      <td style={{ padding: '7px 12px', fontWeight: 600 }}>
                                        {fmtDate(r.session_date)}</td>
                                      <td style={{ padding: '7px 12px', color: 'var(--muted)' }}>
                                        {d.toLocaleDateString('en-GB', { weekday: 'long' })}
                                      </td>
                                      <td style={{ padding: '7px 12px' }}>
                                        {r.status ? (
                                          <span style={{ fontWeight: 700, color: STATUS_COLOR[r.status] || '#475569', textTransform: 'capitalize' }}>
                                            {r.status}
                                          </span>
                                        ) : r.session_id ? (
                                          <span style={{ fontWeight: 600, color: '#94a3b8', fontStyle: 'italic' }}>
                                            Not marked
                                          </span>
                                        ) : (
                                          <span style={{ fontWeight: 600, color: '#cbd5e1', fontStyle: 'italic' }}>
                                            No register taken
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ padding: '7px 12px' }}>
                                        {r.session_id ? (
                                          <div style={{ display: 'flex', gap: 4 }}>
                                            {['present', 'late', 'absent', 'holiday'].map(st => (
                                              <button key={st}
                                                className={`att-btn att-${st}${r.status === st ? ' active' : ''}`}
                                                style={{ fontSize: '.7rem', padding: '3px 8px' }}
                                                disabled={isBusy}
                                                onClick={() => editRecord(s.id, r, st)}>
                                                {st.charAt(0).toUpperCase() + st.slice(1)}
                                              </button>
                                            ))}
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: '.72rem', color: '#cbd5e1' }}>—</span>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>No students found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  )
}

function FilterField({ label, children, wide }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.8rem', gridColumn: wide ? 'span 2' : undefined }}>
      <span style={{ fontWeight: 700, color: 'var(--muted)', fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      {children}
    </label>
  )
}

function Detail({ label, value }) {
  return (
    <div className="app-detail-item">
      <div className="app-detail-label">{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  )
}
