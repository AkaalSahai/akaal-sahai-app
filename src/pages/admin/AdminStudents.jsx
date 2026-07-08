import { useEffect, useState, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import MedicalBadge from '../../components/MedicalBadge'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'
import { fmtDate } from '../../lib/dates'

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

const STATUS_COLOR = { present: '#16a34a', late: '#d97706', absent: '#dc2626' }

export default function AdminStudents({ readOnly }) {
  const { profile } = useAuth()
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

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: g }, { data: n }] = await Promise.all([
      supabase.from('students').select('*, groups(id, name)').eq('active', true).order('last_name'),
      supabase.from('groups').select('id, name').order('name'),
      supabase.from('student_notes').select('student_id, progress_level, comments, updated_at'),
    ])
    const noteMap = {}
    ;(n || []).forEach(note => { noteMap[note.student_id] = note })
    setStudents((s || []).map(st => ({ ...st, note: noteMap[st.id] || null })))
    setGroups(g || [])
    setLoading(false)
  }

  async function loadAttendHistory(studentId) {
    setAttendLoading(prev => ({ ...prev, [studentId]: true }))
    const { data } = await supabase
      .from('attendance_records')
      .select('session_id, session_date, status, group_id')
      .eq('student_id', studentId)
      .order('session_date', { ascending: false })
    setAttendOpen(prev => ({ ...prev, [studentId]: data || [] }))
    setAttendLoading(prev => ({ ...prev, [studentId]: false }))
  }

  function toggleAttend(studentId) {
    if (attendOpen[studentId] !== undefined) {
      setAttendOpen(prev => { const n = { ...prev }; delete n[studentId]; return n })
    } else {
      loadAttendHistory(studentId)
    }
  }

  async function editRecord(studentId, record, newStatus) {
    if (editBusy) return
    const s    = students.find(x => x.id === studentId)
    const name = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : studentId
    const key  = record.session_id + studentId

    if (record.status === newStatus) {
      // Tap active status → clear the record
      setEditBusy(key)
      try {
        const { error } = await supabase.from('attendance_records')
          .delete()
          .eq('session_id', record.session_id)
          .eq('student_id', studentId)
        if (error) throw error
        setAttendOpen(prev => ({
          ...prev,
          [studentId]: prev[studentId].filter(r => r.session_id !== record.session_id),
        }))
        await logAction(profile, 'Edited attendance record',
          `Cleared ${name} on ${record.session_date}`)
      } catch (err) { alert('Error: ' + err.message) }
      finally { setEditBusy(null) }
      return
    }

    setEditBusy(key)
    try {
      const { error } = await supabase.from('attendance_records')
        .update({ status: newStatus })
        .eq('session_id', record.session_id)
        .eq('student_id', studentId)
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
    load()
  }

  async function deactivate(studentId) {
    if (readOnly) return
    if (!confirm('Remove this student from the system? This cannot be undone.')) return
    const s = students.find(x => x.id === studentId)
    const name = s ? [s.first_name, s.last_name].filter(Boolean).join(' ') : studentId
    await supabase.from('students').update({ active: false }).eq('id', studentId)
    logAction(profile, 'Removed student', name).catch(() => {})
    load()
  }

  function calcAge(dob) {
    if (!dob) return null
    const d = new Date(dob), now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
    return a
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function sortIcon(col) {
    if (sortCol !== col) return <span style={{ marginLeft: 3, fontSize: '.6rem', color: '#cbd5e1' }}>⇅</span>
    return <span style={{ marginLeft: 3, fontSize: '.6rem', color: 'var(--primary)' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const filtered = students.filter(s => {
    const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ').toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase())
    const matchGroup  = !groupFilter || s.group_id === groupFilter
    return matchSearch && matchGroup
  })

  const sorted = [...filtered].sort((a, b) => {
    let va, vb
    if (sortCol === 'name') {
      va = [a.last_name, a.first_name].filter(Boolean).join(' ').toLowerCase()
      vb = [b.last_name, b.first_name].filter(Boolean).join(' ').toLowerCase()
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
    } else { return 0 }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  if (loading) return <div className="spinner" />

  return (
    <div className="card">
      <div className="card-title">
        Students ({filtered.length})
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 170, padding: '7px 10px', fontSize: '.84rem' }} />
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
            style={{ padding: '7px 10px', fontSize: '.84rem' }}>
            <option value="">All groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

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
                    <td>{fmtDate(s.date_of_birth)}</td>
                    <td>{s.groups?.name || <span style={{ color: 'var(--muted)' }}>No group</span>}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{fmtDate(s.date_joined)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-outline btn-xs"
                          onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
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
                          <button className="btn btn-danger btn-xs" onClick={() => deactivate(s.id)}>Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expanded === s.id && (
                    <tr key={s.id + '-exp'}>
                      <td colSpan={7} style={{ background: '#f8fafc', padding: '12px 16px' }}>
                        <div className="app-details">
                          <Detail label="Parent/Guardian" value={s.parent_name} />
                          <Detail label="Relationship" value={s.relationship} />
                          <Detail label="Phone" value={s.phone} />
                          <Detail label="Secondary Phone" value={s.secondary_phone || '—'} />
                          <Detail label="Email" value={s.email || '—'} />
                          <Detail label="Address" value={[s.house_no, s.street_name, s.town, s.postcode].filter(Boolean).join(', ')} />
                          {s.medical_notes && <Detail label="Medical Notes" value={s.medical_notes} />}
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
                            <select defaultValue={s.group_id || ''} onChange={e => e.target.value && moveGroup(s.id, e.target.value)}
                              style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.83rem' }}>
                              <option value="">— select —</option>
                              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}

                  {records !== undefined && (
                    <tr key={s.id + '-att'}>
                      <td colSpan={7} style={{ background: '#f0f9ff', padding: '12px 16px', borderTop: '2px solid #bae6fd' }}>
                        <div style={{ fontWeight: 700, fontSize: '.82rem', color: '#0369a1', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <span>
                            Attendance History — {fullName}
                            {records.length > 0 && (
                              <span style={{ fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                                {records.length} session{records.length !== 1 ? 's' : ''} · tap active status to clear, tap another to change
                              </span>
                            )}
                          </span>
                        </div>
                        {attendLoading[s.id] ? (
                          <div className="spinner" style={{ width: 24, height: 24 }} />
                        ) : records.length === 0 ? (
                          <div style={{ fontSize: '.83rem', color: 'var(--muted)' }}>No attendance records found for this student.</div>
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
                                    <tr key={r.session_id} style={{ borderTop: '1px solid #bae6fd', opacity: isBusy ? 0.5 : 1 }}>
                                      <td style={{ padding: '7px 12px', fontWeight: 600 }}>
                                        {fmtDate(r.session_date)}
                                      </td>
                                      <td style={{ padding: '7px 12px', color: 'var(--muted)' }}>
                                        {d.toLocaleDateString('en-GB', { weekday: 'long' })}
                                      </td>
                                      <td style={{ padding: '7px 12px' }}>
                                        <span style={{ fontWeight: 700, color: STATUS_COLOR[r.status] || '#475569', textTransform: 'capitalize' }}>
                                          {r.status}
                                        </span>
                                      </td>
                                      <td style={{ padding: '7px 12px' }}>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                          {['present', 'late', 'absent'].map(st => (
                                            <button key={st}
                                              className={`att-btn att-${st}${r.status === st ? ' active' : ''}`}
                                              style={{ fontSize: '.7rem', padding: '3px 8px' }}
                                              disabled={isBusy}
                                              onClick={() => editRecord(s.id, r, st)}>
                                              {st.charAt(0).toUpperCase() + st.slice(1)}
                                            </button>
                                          ))}
                                        </div>
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
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>No students found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
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
