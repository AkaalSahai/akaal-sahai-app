import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/dates'

const AVATARS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6']
const color = (i) => AVATARS[i % AVATARS.length]

const PROGRESS_OPTIONS = [
  { value: '',                    label: 'Select progress level…',  color: '#94a3b8' },
  { value: 'excellent',           label: 'Excellent Progress',       color: '#16a34a' },
  { value: 'good',                label: 'Good Progress',            color: '#2563eb' },
  { value: 'progressing',         label: 'Progressing Well',         color: '#0d9488' },
  { value: 'needs_support',       label: 'Needs Support',            color: '#d97706' },
  { value: 'behaviour_issues',    label: 'Behaviour Issues',         color: '#dc2626' },
  { value: 'low_attendance',      label: 'Low Attendance',           color: '#ea580c' },
  { value: 'awaiting_assessment', label: 'Awaiting Assessment',      color: '#6b7280' },
]

function progressBadge(value) {
  const opt = PROGRESS_OPTIONS.find(o => o.value === value)
  if (!opt || !value) return null
  return (
    <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'white', background: opt.color,
      borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {opt.label}
    </span>
  )
}

export default function TeacherReports() {
  const { profile }              = useAuth()
  const [students, setStudents]  = useState([])
  const [stats, setStats]        = useState({})
  const [notes, setNotes]        = useState({})
  const [history, setHistory]    = useState({})
  const [expanded, setExpanded]  = useState(null)
  const [loading, setLoading]    = useState(true)
  const [saving, setSaving]      = useState({})
  const debounceRef              = useRef({})
  const notesRef                 = useRef({})

  // Keep notesRef in sync so debounced saves always have fresh data
  useEffect(() => { notesRef.current = notes }, [notes])

  useEffect(() => { if (profile?.group_id) load() }, [profile])

  async function load() {
    const [{ data: studentData }, { data: records }, { data: noteData }] = await Promise.all([
      supabase.from('students')
        .select('id, first_name, middle_name, last_name, date_of_birth, medical_notes')
        .eq('group_id', profile.group_id).eq('active', true).order('last_name'),
      supabase.from('attendance_records')
        .select('student_id, status, session_date')
        .eq('group_id', profile.group_id),
      supabase.from('student_notes')
        .select('student_id, progress_level, comments')
        .eq('group_id', profile.group_id),
    ])

    const statMap = {}
    ;(studentData || []).forEach(s => { statMap[s.id] = { present: 0, late: 0, absent: 0, total: 0 } })
    ;(records || []).forEach(r => {
      if (!statMap[r.student_id]) return
      statMap[r.student_id][r.status]++
      statMap[r.student_id].total++
    })

    const noteMap = {}
    ;(noteData || []).forEach(n => { noteMap[n.student_id] = { progress_level: n.progress_level || '', comments: n.comments || '' } })

    setStudents(studentData || [])
    setStats(statMap)
    setNotes(noteMap)
    setLoading(false)
  }

  async function loadHistory(studentId) {
    if (history[studentId]) return
    const { data } = await supabase
      .from('attendance_records')
      .select('session_date, status')
      .eq('student_id', studentId)
      .eq('group_id', profile.group_id)
      .order('session_date', { ascending: false })
    setHistory(h => ({ ...h, [studentId]: data || [] }))
  }

  function toggleExpand(studentId) {
    if (expanded === studentId) { setExpanded(null); return }
    setExpanded(studentId)
    loadHistory(studentId)
  }

  async function saveNote(studentId, field, value) {
    setSaving(s => ({ ...s, [studentId]: true }))
    try {
      await supabase.from('student_notes').upsert({
        student_id: studentId,
        teacher_id: profile.id,
        group_id: profile.group_id,
        ...notesRef.current[studentId],
        [field]: value,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id' })
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(s => ({ ...s, [studentId]: false }))
    }
  }

  function handleProgress(studentId, value) {
    setNotes(n => ({ ...n, [studentId]: { ...n[studentId], progress_level: value } }))
    saveNote(studentId, 'progress_level', value)
  }

  function handleComments(studentId, value) {
    setNotes(n => ({ ...n, [studentId]: { ...n[studentId], comments: value } }))
    clearTimeout(debounceRef.current[studentId])
    debounceRef.current[studentId] = setTimeout(() => saveNote(studentId, 'comments', value), 1000)
  }

  function age(dob) {
    if (!dob) return null
    const d = new Date(dob), now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
    return a
  }

  if (!profile?.group_id) return (
    <div className="card">
      <div className="alert alert-warning">You have not been assigned to a group yet.</div>
    </div>
  )
  if (loading) return <div className="spinner" />

  return (
    <div className="card">
      <div className="card-title">Student Reports ({students.length})</div>

      {students.length === 0 && (
        <div className="empty-state"><div className="icon">📊</div>No students in your group yet</div>
      )}

      <ul className="student-list" style={{ padding: 0 }}>
        {students.map((s, i) => {
          const st     = stats[s.id] || { present: 0, late: 0, absent: 0, total: 0 }
          const pct    = st.total > 0 ? Math.round(((st.present + st.late) / st.total) * 100) : null
          const pctColor = pct === null ? 'var(--muted)' : pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626'
          const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
          const isOpen   = expanded === s.id
          const note     = notes[s.id] || { progress_level: '', comments: '' }
          const hist     = history[s.id] || []

          return (
            <li key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', cursor: 'pointer' }}
                onClick={() => toggleExpand(s.id)}>
                <div className="student-avatar" style={{ background: color(i), flexShrink: 0 }}>
                  {s.first_name?.[0] ?? '?'}{s.last_name?.[0] ?? '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="student-name">{fullName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                    {age(s.date_of_birth) !== null && (
                      <span style={{ fontSize: '.72rem', color: 'var(--muted)' }}>Age {age(s.date_of_birth)}</span>
                    )}
                    {note.progress_level && progressBadge(note.progress_level)}
                    {s.medical_notes && (
                      <span style={{ fontSize: '.7rem', color: 'var(--danger)', fontWeight: 600 }}>⚕ Medical</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  {[['P','present','#16a34a'],['L','late','#d97706'],['A','absent','#dc2626']].map(([lbl, key, clr]) => (
                    <div key={key} style={{ textAlign: 'center', minWidth: 28 }}>
                      <div style={{ fontSize: '.9rem', fontWeight: 700, color: clr }}>{st[key]}</div>
                      <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>{lbl}</div>
                    </div>
                  ))}
                  <div style={{ textAlign: 'center', minWidth: 40 }}>
                    <div style={{ fontSize: '.9rem', fontWeight: 800, color: pctColor }}>
                      {pct !== null ? pct + '%' : '—'}
                    </div>
                    <div style={{ fontSize: '.62rem', color: 'var(--muted)' }}>Att.</div>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '.8rem', paddingLeft: 4 }}>{isOpen ? '▲' : '▼'}</div>
                </div>
              </div>

              {isOpen && (
                <div style={{ paddingBottom: 16, paddingLeft: 4 }}>
                  {s.medical_notes && (
                    <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fef2f2', borderRadius: 8,
                      fontSize: '.8rem', color: '#991b1b', border: '1px solid #fecaca' }}>
                      <strong>Medical note:</strong> {s.medical_notes}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '.78rem' }}>Progress Level</label>
                      <select value={note.progress_level} onChange={e => handleProgress(s.id, e.target.value)}
                        style={{ fontSize: '.85rem', padding: '8px 10px',
                          borderColor: PROGRESS_OPTIONS.find(o => o.value === note.progress_level)?.color || 'var(--border)',
                          color: PROGRESS_OPTIONS.find(o => o.value === note.progress_level)?.color || 'inherit',
                          fontWeight: note.progress_level ? 600 : 400 }}>
                        {PROGRESS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                      {saving[s.id] && <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>⏳ Saving…</span>}
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: '.78rem' }}>Teacher Comments</label>
                    <textarea
                      value={note.comments}
                      onChange={e => handleComments(s.id, e.target.value)}
                      placeholder="Add notes about this student's progress, behaviour, or any concerns…"
                      rows={3}
                      style={{ fontSize: '.85rem', resize: 'vertical' }}
                    />
                    <div style={{ fontSize: '.7rem', color: 'var(--muted)', marginTop: 2 }}>Auto-saves as you type</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)',
                      textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                      Attendance History ({hist.length} sessions)
                    </div>
                    {hist.length === 0 ? (
                      <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>No sessions recorded yet</div>
                    ) : (
                      <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <table style={{ width: '100%', fontSize: '.82rem', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f8fafc' }}>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: '.72rem' }}>Date</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: '.72rem' }}>Day</th>
                              <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--muted)', fontSize: '.72rem' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {hist.map((r, idx) => {
                              const d = new Date(r.session_date + 'T12:00:00')
                              const statusColor = r.status === 'present' ? '#16a34a' : r.status === 'late' ? '#d97706' : '#dc2626'
                              return (
                                <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td style={{ padding: '7px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    {fmtDate(r.session_date)}
                                  </td>
                                  <td style={{ padding: '7px 12px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                                    {d.toLocaleDateString('en-GB', { weekday: 'long' })}
                                  </td>
                                  <td style={{ padding: '7px 12px' }}>
                                    <span style={{ fontWeight: 700, color: statusColor, textTransform: 'capitalize' }}>
                                      {r.status}
                                    </span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
