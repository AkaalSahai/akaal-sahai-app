import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'
import { CLASS_META } from '../../lib/classTypes'
import { fmtDate } from '../../lib/dates'

function calcAge(dob) {
  if (!dob) return null
  const d = new Date(dob), now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
  return a
}

export default function AdminClasses({ readOnly }) {
  const { profile } = useAuth()
  const [classTab, setClassTab]   = useState('gatka')
  const [groups, setGroups]       = useState([])
  const [teachers, setTeachers]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [openGroup, setOpenGroup] = useState(null)

  // Per-group enrolled students
  const [enrolled, setEnrolled]           = useState({})
  const [enrolledLoading, setEnrolledLoading] = useState({})

  // Per-group search state
  const [search, setSearch]     = useState({})
  const [results, setResults]   = useState({})
  const [enrolBusy, setEnrolBusy] = useState(null)
  const [groupTeacherMap, setGroupTeacherMap] = useState({})  // ANY group_id → teacher_ids via teacher_groups
  const [dialog, setDialog]     = useState(null)
  const searchTimers            = useRef({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: g }, { data: t }, { data: tg }, { data: sc }] = await Promise.all([
        supabase.from('groups')
          .select('id, name, class_type, teacher_id')
          .in('class_type', ['gatka', 'kirtan'])
          .order('class_type').order('name'),
        supabase.from('users').select('id, name, role, extra_roles').order('name'),
        supabase.from('teacher_groups').select('teacher_id, group_id'),
        supabase.from('student_classes').select('group_id'),
      ])
      const tgMap = {}
      ;(tg || []).forEach(r => {
        if (!tgMap[r.group_id]) tgMap[r.group_id] = []
        tgMap[r.group_id].push(r.teacher_id)
      })
      setGroupTeacherMap(tgMap)
      const countMap = {}
      ;(sc || []).forEach(r => { countMap[r.group_id] = (countMap[r.group_id] || 0) + 1 })
      setGroups((g || []).map(grp => {
        // Combine teacher_groups (multi-teacher) with the legacy groups.teacher_id
        // field — some groups only have the primary field set with no
        // teacher_groups row to match (see AdminGroups.jsx).
        const ids = new Set(tgMap[grp.id] || [])
        if (grp.teacher_id) ids.add(grp.teacher_id)
        return { ...grp, teacherIds: [...ids], studentCount: countMap[grp.id] || 0 }
      }))
      setTeachers((t || []).filter(u => u.role === 'teacher' || (u.extra_roles || []).includes('teacher')))
    } catch (err) {
      console.error('AdminClasses load error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Resolves the teacher for a student's *Punjabi* group (s.groups), checking
  // both the legacy groups.teacher_id field and the teacher_groups junction —
  // a group can be assigned via either.
  function teacherNameForGroup(grp) {
    if (!grp) return null
    const primary = teachers.find(t => t.id === grp.teacher_id)?.name
    if (primary) return primary
    const viaJunction = groupTeacherMap[grp.id] || []
    for (const tid of viaJunction) {
      const name = teachers.find(t => t.id === tid)?.name
      if (name) return name
    }
    return null
  }

  async function loadEnrolled(groupId) {
    setEnrolledLoading(prev => ({ ...prev, [groupId]: true }))
    const { data } = await supabase
      .from('student_classes')
      .select('student_id, students(id, first_name, last_name, date_of_birth, groups(id, name, teacher_id))')
      .eq('group_id', groupId)
    setEnrolled(prev => ({
      ...prev,
      [groupId]: (data || []).map(r => r.students).filter(Boolean),
    }))
    setEnrolledLoading(prev => ({ ...prev, [groupId]: false }))
  }

  function toggleGroup(groupId) {
    if (openGroup === groupId) { setOpenGroup(null); return }
    setOpenGroup(groupId)
    if (!enrolled[groupId]) loadEnrolled(groupId)
  }

  function handleSearch(groupId, value) {
    setSearch(prev => ({ ...prev, [groupId]: value }))
    clearTimeout(searchTimers.current[groupId])
    if (!value.trim()) { setResults(prev => ({ ...prev, [groupId]: [] })); return }
    searchTimers.current[groupId] = setTimeout(() => doSearch(groupId, value), 280)
  }

  async function doSearch(groupId, query) {
    const { data } = await supabase
      .from('students')
      .select('id, first_name, last_name, date_of_birth, groups(id, name, teacher_id)')
      .eq('active', true)
      // Gatka/Kirtan are extra classes only open to students already
      // enrolled in a Punjabi class — group_id is that Punjabi group, so
      // excluding students without one keeps this search to eligible
      // students only.
      .not('group_id', 'is', null)
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .limit(12)
    const enrolledIds = new Set((enrolled[groupId] || []).map(s => s.id))
    setResults(prev => ({
      ...prev,
      [groupId]: (data || []).filter(s => !enrolledIds.has(s.id)),
    }))
  }

  async function enrolStudent(student, groupId) {
    const key = student.id + groupId
    const targetGroup = groups.find(x => x.id === groupId)
    setEnrolBusy(key)
    try {
      // A student may only be in one Gatka group and one Kirtan group at a
      // time - check for an existing enrollment in another group of the
      // SAME class_type (not just this exact group).
      const { data: existingRows, error: checkErr } = await supabase
        .from('student_classes')
        .select('group_id, groups(id, name, class_type)')
        .eq('student_id', student.id)
      if (checkErr) throw checkErr
      const conflict = (existingRows || []).find(r =>
        r.group_id !== groupId && r.groups?.class_type === targetGroup?.class_type
      )

      if (conflict) {
        setEnrolBusy(null)
        setDialog({
          message: `${student.first_name} ${student.last_name} is currently in "${conflict.groups.name}". Move them to "${targetGroup?.name}" instead?`,
          confirmText: 'Move Student',
          onConfirm: () => {
            setDialog(null)
            doEnrol(student, groupId, conflict.group_id)
          },
        })
        return
      }
      await doEnrol(student, groupId, null)
    } catch (err) { alert(err.message); setEnrolBusy(null) }
  }

  async function doEnrol(student, groupId, removeFromGroupId) {
    const key = student.id + groupId
    setEnrolBusy(key)
    try {
      if (removeFromGroupId) {
        const { error: delErr } = await supabase.from('student_classes').delete()
          .eq('student_id', student.id).eq('group_id', removeFromGroupId)
        if (delErr) throw delErr
      }
      const { error } = await supabase.from('student_classes')
        .insert({ student_id: student.id, group_id: groupId })
      if (error) throw error
      const g = groups.find(x => x.id === groupId)
      const fromGroup = removeFromGroupId ? groups.find(x => x.id === removeFromGroupId) : null
      logAction(profile, 'Enrolled student in class',
        fromGroup
          ? `${student.first_name} ${student.last_name}: ${fromGroup.name} → ${g?.name}`
          : `${student.first_name} ${student.last_name} → ${g?.name}`
      ).catch(() => {})
      setEnrolled(prev => {
        const next = { ...prev, [groupId]: [...(prev[groupId] || []), student] }
        if (removeFromGroupId && next[removeFromGroupId]) {
          next[removeFromGroupId] = next[removeFromGroupId].filter(s => s.id !== student.id)
        }
        return next
      })
      setResults(prev => ({
        ...prev,
        [groupId]: (prev[groupId] || []).filter(s => s.id !== student.id),
      }))
      setGroups(prev => prev.map(x => {
        if (x.id === groupId) return { ...x, studentCount: x.studentCount + 1 }
        if (x.id === removeFromGroupId) return { ...x, studentCount: Math.max(0, x.studentCount - 1) }
        return x
      }))
    } catch (err) { alert(err.message) }
    finally { setEnrolBusy(null) }
  }

  async function unenrolStudent(student, groupId) {
    const { error } = await supabase.from('student_classes').delete()
      .eq('student_id', student.id).eq('group_id', groupId)
    if (error) { alert(error.message); return }
    const g = groups.find(x => x.id === groupId)
    logAction(profile, 'Removed student from class',
      `${student.first_name} ${student.last_name} ← ${g?.name}`).catch(() => {})
    setEnrolled(prev => ({
      ...prev,
      [groupId]: (prev[groupId] || []).filter(s => s.id !== student.id),
    }))
    setGroups(prev => prev.map(g => g.id === groupId
      ? { ...g, studentCount: Math.max(0, g.studentCount - 1) } : g))
  }

  async function addTeacher(groupId, teacherId) {
    if (!teacherId || readOnly) return
    const { error } = await supabase.from('teacher_groups')
      .insert({ teacher_id: teacherId, group_id: groupId })
    if (error) { alert(error.message); return }
    const g = groups.find(x => x.id === groupId)
    const t = teachers.find(x => x.id === teacherId)
    logAction(profile, 'Assigned teacher to group', `${t?.name} → ${g?.name}`).catch(() => {})
    load()
  }

  async function removeTeacher(groupId, teacherId) {
    if (readOnly) return
    const { error } = await supabase.from('teacher_groups').delete()
      .eq('teacher_id', teacherId).eq('group_id', groupId)
    if (error) { alert(error.message); return }
    const g = groups.find(x => x.id === groupId)
    const t = teachers.find(x => x.id === teacherId)
    logAction(profile, 'Removed teacher from group', `${t?.name} ← ${g?.name}`).catch(() => {})
    load()
  }

  if (loading) return <div className="spinner" />

  const visibleGroups = groups.filter(g => g.class_type === classTab)
  const meta = CLASS_META[classTab]

  return (
    <div>
      {dialog && <ConfirmDialog {...dialog} onCancel={() => setDialog(null)} />}
      {/* Class type tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {['gatka', 'kirtan'].map(type => {
          const m = CLASS_META[type]
          const active = classTab === type
          return (
            <button key={type} onClick={() => { setClassTab(type); setOpenGroup(null) }}
              style={{ padding: '10px 24px', borderRadius: 10, fontWeight: 700,
                fontSize: '.92rem', cursor: 'pointer', transition: 'all .15s',
                border: `2px solid ${active ? m.color : 'var(--border)'}`,
                background: active ? m.color : 'white',
                color: active ? 'white' : '#64748b' }}>
              {m.label}
              <span style={{ marginLeft: 8, fontSize: '.75rem', fontWeight: 500,
                opacity: active ? 0.85 : 0.5 }}>
                {type === 'gatka' ? 'Sundays' : 'Wednesdays'}
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {visibleGroups.map(g => {
          const isOpen       = openGroup === g.id
          const enrolledList = enrolled[g.id] || []
          const searchVal    = search[g.id] || ''
          const searchRes    = results[g.id] || []

          return (
            <div key={g.id} className="card" style={{ marginBottom: 0,
              borderTop: `3px solid ${isOpen ? meta.color : 'transparent'}`,
              transition: 'border-color .15s' }}>

              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: 5 }}>
                    {g.name}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {(g.teacherIds || []).map(tid => {
                      const t = teachers.find(x => x.id === tid)
                      if (!t) return null
                      return (
                        <span key={tid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: '#e0e7ff', color: '#3730a3', borderRadius: 6,
                          padding: '2px 8px', fontSize: '.78rem', fontWeight: 600 }}>
                          {t.name}
                          {!readOnly && (
                            <button onClick={() => removeTeacher(g.id, tid)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer',
                                color: '#3730a3', padding: 0, lineHeight: 1, fontSize: '1rem' }}>
                              ×
                            </button>
                          )}
                        </span>
                      )
                    })}
                    {!readOnly && (
                      <select value="" onChange={e => addTeacher(g.id, e.target.value)}
                        style={{ padding: '3px 6px', borderRadius: 6,
                          border: '1px solid var(--border)', fontSize: '.76rem',
                          color: 'var(--muted)', background: 'white' }}>
                        <option value="">+ Add teacher</option>
                        {teachers.filter(t => !(g.teacherIds || []).includes(t.id))
                          .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                    {(g.teacherIds || []).length === 0 && (
                      <span style={{ fontSize: '.76rem', color: '#dc2626', fontWeight: 600 }}>
                        No teacher assigned
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: meta.color, lineHeight: 1 }}>
                      {g.studentCount}
                    </div>
                    <div style={{ fontSize: '.62rem', color: 'var(--muted)',
                      textTransform: 'uppercase', letterSpacing: '.05em' }}>
                      students
                    </div>
                  </div>
                  <button onClick={() => toggleGroup(g.id)}
                    style={{ padding: '8px 18px', borderRadius: 8, fontWeight: 600,
                      fontSize: '.84rem', cursor: 'pointer', transition: 'all .15s',
                      border: `1.5px solid ${isOpen ? meta.color : 'var(--border)'}`,
                      background: isOpen ? meta.bg : 'white',
                      color: isOpen ? meta.color : '#475569' }}>
                    {isOpen ? 'Close ▲' : 'Manage ▼'}
                  </button>
                </div>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>

                  {/* Enrolled students */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)',
                      textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                      Enrolled — {enrolledLoading[g.id] ? '…' : enrolledList.length} student{enrolledList.length !== 1 ? 's' : ''}
                    </div>
                    {enrolledLoading[g.id] ? (
                      <div className="spinner" style={{ width: 22, height: 22 }} />
                    ) : enrolledList.length === 0 ? (
                      <div style={{ fontSize: '.84rem', color: 'var(--muted)' }}>
                        No students enrolled yet — search below to add some.
                      </div>
                    ) : (
                      <div style={{ borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: meta.bg }}>
                              <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: meta.color, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Name</th>
                              <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: meta.color, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Punjabi Group</th>
                              <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: meta.color, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Punjabi Teacher</th>
                              <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: meta.color, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>DOB</th>
                              <th style={{ padding: '7px 12px', textAlign: 'left', fontWeight: 700, color: meta.color, fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.04em' }}>Age</th>
                              {!readOnly && <th style={{ padding: '7px 12px' }}></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {enrolledList.map((s, idx) => {
                              const age         = calcAge(s.date_of_birth)
                              const teacherName = teacherNameForGroup(s.groups)
                              return (
                                <tr key={s.id} style={{ borderTop: '1px solid var(--border)',
                                  background: idx % 2 === 0 ? 'white' : '#fafafa' }}>
                                  <td style={{ padding: '9px 12px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                    {s.first_name} {s.last_name}
                                  </td>
                                  <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                    {s.groups?.name || <span style={{ color: 'var(--muted)' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                    {teacherName || <span style={{ color: 'var(--muted)' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '9px 12px', color: '#475569', whiteSpace: 'nowrap' }}>
                                    {fmtDate(s.date_of_birth) || '—'}
                                  </td>
                                  <td style={{ padding: '9px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {age !== null ? `${age}y` : '—'}
                                  </td>
                                  {!readOnly && (
                                    <td style={{ padding: '9px 12px' }}>
                                      <button onClick={() => unenrolStudent(s, g.id)}
                                        className="btn btn-danger btn-xs">
                                        Remove
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Add students */}
                  {!readOnly && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                      <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--muted)',
                        textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
                        Add Students
                      </div>
                      <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8 }}>
                        Only students already enrolled in a Punjabi class can be added to {meta.label}.
                      </div>
                      <input
                        type="text"
                        placeholder={enrolledLoading[g.id] ? 'Loading enrolled list…' : 'Type a name to search Punjabi-class students…'}
                        value={searchVal}
                        disabled={!!enrolledLoading[g.id]}
                        onChange={e => handleSearch(g.id, e.target.value)}
                        style={{ width: '100%', maxWidth: 400, boxSizing: 'border-box', marginBottom: 10 }}
                      />

                      {searchVal.trim() && searchRes.length === 0 && (
                        <div style={{ fontSize: '.83rem', color: 'var(--muted)' }}>
                          No matching Punjabi-class students found, or all are already enrolled.
                        </div>
                      )}

                      {searchRes.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 460 }}>
                          {searchRes.map(s => {
                            const age         = calcAge(s.date_of_birth)
                            const teacherName = teacherNameForGroup(s.groups)
                            const key         = s.id + g.id
                            const busy        = enrolBusy === key
                            return (
                              <button key={s.id} disabled={busy} onClick={() => enrolStudent(s, g.id)}
                                style={{ display: 'flex', alignItems: 'center',
                                  justifyContent: 'space-between', gap: 12,
                                  padding: '10px 14px', borderRadius: 8, textAlign: 'left',
                                  border: `1.5px solid ${meta.color}`,
                                  background: busy ? meta.bg : 'white',
                                  cursor: busy ? 'default' : 'pointer',
                                  opacity: busy ? 0.6 : 1, transition: 'background .1s' }}>
                                <div>
                                  <div style={{ fontWeight: 700, fontSize: '.9rem', color: '#1e293b', marginBottom: 3 }}>
                                    {s.first_name} {s.last_name}
                                    {age !== null && (
                                      <span style={{ fontWeight: 400, fontSize: '.78rem', color: '#64748b', marginLeft: 6 }}>
                                        Age {age}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '.76rem', color: '#64748b' }}>
                                    <span>
                                      <span style={{ fontWeight: 600, color: '#374151' }}>Group: </span>
                                      {s.groups?.name || <em>No group</em>}
                                    </span>
                                    <span>
                                      <span style={{ fontWeight: 600, color: '#374151' }}>Teacher: </span>
                                      {teacherName || <em>—</em>}
                                    </span>
                                    <span>
                                      <span style={{ fontWeight: 600, color: '#374151' }}>DOB: </span>
                                      {fmtDate(s.date_of_birth) || '—'}
                                    </span>
                                  </div>
                                </div>
                                <span style={{ color: meta.color, fontWeight: 700,
                                  fontSize: '.8rem', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {busy ? '…' : '+ Enrol'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {visibleGroups.length === 0 && (
          <div className="card">
            <div className="empty-state">
              <div className="icon">{classTab === 'gatka' ? '🥋' : '🎵'}</div>
              No {CLASS_META[classTab]?.label} groups found. Add them in the Groups page.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
