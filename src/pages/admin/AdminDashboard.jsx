import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

function todayISO() { return new Date().toISOString().split('T')[0] }

export default function AdminDashboard({ setTab }) {
  const [stats, setStats]   = useState(null)
  const [pending, setPending] = useState({ students: 0, teachers: 0 })
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    const today = todayISO()
    const [
      { count: totalStudents },
      { count: totalGroups },
      { count: totalTeachers },
      { count: todaySessions },
      { count: pendingStudents },
      { count: pendingTeachers },
      { data: groupRows },
      { data: teacherRows },
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('groups').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
      supabase.from('attendance_sessions').select('*', { count: 'exact', head: true }).eq('session_date', today),
      supabase.from('parent_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('teacher_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('groups').select('id, name, teacher_id, students(count)'),
      supabase.from('users').select('id, name').eq('role', 'teacher'),
    ])

    // Build teacher lookup map
    const teacherMap = {}
    ;(teacherRows || []).forEach(t => { teacherMap[t.id] = t.name })

    const enriched = (groupRows || []).map(g => ({
      ...g,
      teacherName: g.teacher_id ? teacherMap[g.teacher_id] || null : null,
    }))

    setStats({ totalStudents, totalGroups, totalTeachers, todaySessions })
    setPending({ students: pendingStudents, teachers: pendingTeachers })
    setGroups(enriched)
    setLoading(false)
  }

  if (loading) return <div className="spinner" />

  const statCards = [
    { label: 'Students',         value: stats.totalStudents, tab: 'students' },
    { label: 'Groups',           value: stats.totalGroups,   tab: 'groups'   },
    { label: 'Teachers',         value: stats.totalTeachers, tab: 'users'    },
    { label: "Today's Registers", value: stats.todaySessions, tab: 'students' },
  ]

  return (
    <>
      <div className="stats-grid">
        {statCards.map(({ label, value, tab }) => (
          <div key={label} className="stat-card" onClick={() => setTab(tab)}
            style={{ cursor: 'pointer', transition: 'box-shadow .15s, transform .15s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(30,26,110,.15)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}>
            <div className="stat-number">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {(pending.students > 0 || pending.teachers > 0) && (
        <div className="alert alert-warning" style={{ cursor: 'pointer' }} onClick={() => setTab('applications')}>
          {pending.students > 0 && <span>{pending.students} student application{pending.students > 1 ? 's' : ''} awaiting approval. </span>}
          {pending.teachers > 0 && <span>{pending.teachers} teacher application{pending.teachers > 1 ? 's' : ''} awaiting approval.</span>}
          <span style={{ fontWeight: 700, marginLeft: 8 }}>Review →</span>
        </div>
      )}

      <div className="card">
        <div className="card-title">Group Overview</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Teacher</th>
                <th>Students</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => setTab('groups')}>
                  <td style={{ fontWeight: 600 }}>{g.name}</td>
                  <td>{g.teacherName || <span style={{ color: 'var(--muted)' }}>No teacher assigned</span>}</td>
                  <td>{g.students?.[0]?.count ?? 0}</td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)' }}>No groups found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
