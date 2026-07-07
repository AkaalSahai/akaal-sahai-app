import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

function todayISO() { return new Date().toISOString().split('T')[0] }

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
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
      { data: groupData },
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('groups').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
      supabase.from('attendance_sessions').select('*', { count: 'exact', head: true }).eq('session_date', today),
      supabase.from('parent_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('teacher_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('groups').select('id, name, users!groups_teacher_id_fkey(name), students(count)').eq('students.active', true),
    ])
    setStats({ totalStudents, totalGroups, totalTeachers, todaySessions })
    setPending({ students: pendingStudents, teachers: pendingTeachers })
    setGroups(groupData || [])
    setLoading(false)
  }

  if (loading) return <div className="spinner" />

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-number">{stats.totalStudents}</div>
          <div className="stat-label">Students</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.totalGroups}</div>
          <div className="stat-label">Groups</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.totalTeachers}</div>
          <div className="stat-label">Teachers</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{stats.todaySessions}</div>
          <div className="stat-label">Today's Registers</div>
        </div>
      </div>

      {(pending.students > 0 || pending.teachers > 0) && (
        <div className="alert alert-warning">
          {pending.students > 0 && <span>{pending.students} student application{pending.students > 1 ? 's' : ''} awaiting approval. </span>}
          {pending.teachers > 0 && <span>{pending.teachers} teacher application{pending.teachers > 1 ? 's' : ''} awaiting approval.</span>}
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
                <tr key={g.id}>
                  <td style={{ fontWeight: 600 }}>{g.name}</td>
                  <td>{g.users?.name || <span style={{ color: 'var(--muted)' }}>No teacher assigned</span>}</td>
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
