import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const AVATARS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6']
const color = (i) => AVATARS[i % AVATARS.length]

export default function TeacherReports() {
  const { profile } = useAuth()
  const [students, setStudents] = useState([])
  const [stats, setStats]       = useState({})
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [history, setHistory]   = useState({})

  useEffect(() => { if (profile?.group_id) load() }, [profile])

  async function load() {
    const [{ data: studentData }, { data: records }] = await Promise.all([
      supabase.from('students').select('id, first_name, middle_name, last_name, date_of_birth, medical_notes')
        .eq('group_id', profile.group_id).eq('active', true).order('last_name'),
      supabase.from('attendance_records').select('student_id, status, session_date')
        .eq('group_id', profile.group_id),
    ])

    const statMap = {}
    ;(studentData || []).forEach(s => {
      statMap[s.id] = { present: 0, late: 0, absent: 0, total: 0 }
    })
    ;(records || []).forEach(r => {
      if (!statMap[r.student_id]) return
      statMap[r.student_id][r.status]++
      statMap[r.student_id].total++
    })

    setStudents(studentData || [])
    setStats(statMap)
    setLoading(false)
  }

  async function loadStudentHistory(studentId) {
    if (history[studentId]) { setExpanded(expanded === studentId ? null : studentId); return }
    const { data } = await supabase
      .from('attendance_records')
      .select('session_date, status')
      .eq('student_id', studentId)
      .eq('group_id', profile.group_id)
      .order('session_date', { ascending: false })
      .limit(20)
    setHistory(h => ({ ...h, [studentId]: data || [] }))
    setExpanded(studentId)
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
      <div className="card-title">Student Reports</div>

      {students.length === 0 && (
        <div className="empty-state"><div className="icon">📊</div>No students in your group yet</div>
      )}

      <ul className="student-list">
        {students.map((s, i) => {
          const st = stats[s.id] || { present: 0, late: 0, absent: 0, total: 0 }
          const pct = st.total > 0 ? Math.round(((st.present + st.late) / st.total) * 100) : null
          const pctColor = pct === null ? 'var(--muted)' : pct >= 80 ? '#16a34a' : pct >= 60 ? '#d97706' : '#dc2626'
          const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
          const isOpen = expanded === s.id

          return (
            <li key={s.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                onClick={() => loadStudentHistory(s.id)}>
                <div className="student-avatar" style={{ background: color(i), flexShrink: 0 }}>
                  {s.first_name[0]}{s.last_name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="student-name">{fullName}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                    {age(s.date_of_birth) !== null ? `Age ${age(s.date_of_birth)}` : ''}
                    {s.medical_notes && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>⚕ {s.medical_notes}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ textAlign: 'center', minWidth: 32 }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 700, color: '#16a34a' }}>{st.present}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>P</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 32 }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 700, color: '#d97706' }}>{st.late}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>L</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 32 }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 700, color: '#dc2626' }}>{st.absent}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>A</div>
                  </div>
                  <div style={{ textAlign: 'center', minWidth: 44 }}>
                    <div style={{ fontSize: '.95rem', fontWeight: 800, color: pctColor }}>
                      {pct !== null ? pct + '%' : '—'}
                    </div>
                    <div style={{ fontSize: '.65rem', color: 'var(--muted)' }}>Att.</div>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '.8rem' }}>{isOpen ? '▲' : '▼'}</div>
                </div>
              </div>

              {isOpen && (
                <div style={{ marginTop: 10, paddingLeft: 52 }}>
                  {(history[s.id] || []).length === 0 ? (
                    <div style={{ color: 'var(--muted)', fontSize: '.82rem' }}>No attendance records yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(history[s.id] || []).map(r => {
                        const dotColor = r.status === 'present' ? '#16a34a' : r.status === 'late' ? '#d97706' : '#dc2626'
                        const label = r.status === 'present' ? 'P' : r.status === 'late' ? 'L' : 'A'
                        return (
                          <div key={r.session_date} title={`${r.session_date}: ${r.status}`}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: dotColor,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: 'white', fontSize: '.65rem', fontWeight: 700 }}>{label}</div>
                            <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>
                              {new Date(r.session_date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
