import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'

export default function AdminGroups({ readOnly }) {
  const { profile } = useAuth()
  const [groups, setGroups]   = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [newGroup, setNewGroup] = useState('')
  const [busy, setBusy]       = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: g }, { data: t }] = await Promise.all([
      supabase.from('groups')
        .select('id, name, teacher_id, students(count)')
        .order('name'),
      supabase.from('users').select('id, name').eq('role', 'teacher').order('name'),
    ])
    setGroups(g || [])
    setTeachers(t || [])
    setLoading(false)
  }

  async function addGroup() {
    if (!newGroup.trim()) return
    setBusy(true)
    const { error } = await supabase.from('groups').insert({ name: newGroup.trim() })
    if (error) alert(error.message)
    else { logAction(profile, 'Created group', newGroup.trim()).catch(() => {}); setNewGroup(''); load() }
    setBusy(false)
  }

  async function assignTeacher(groupId, teacherId) {
    const group = groups.find(g => g.id === groupId)
    // Clear old teacher's group_id before assigning the new one
    if (group?.teacher_id && group.teacher_id !== teacherId) {
      await supabase.from('users').update({ group_id: null }).eq('id', group.teacher_id)
    }
    await supabase.from('groups').update({ teacher_id: teacherId || null }).eq('id', groupId)
    if (teacherId) await supabase.from('users').update({ group_id: groupId }).eq('id', teacherId)
    const teacherName = teachers.find(t => t.id === teacherId)?.name
    if (teacherName) logAction(profile, 'Assigned teacher to group', `${teacherName} → ${group?.name}`).catch(() => {})
    load()
  }

  async function deleteGroup(groupId) {
    const g = groups.find(x => x.id === groupId)
    const count = g?.students?.[0]?.count || 0
    if (count > 0) { alert('Cannot delete a group that has students. Move or remove students first.'); return }
    if (!confirm('Delete group "' + g?.name + '"?')) return
    await supabase.from('groups').delete().eq('id', groupId)
    logAction(profile, 'Deleted group', g?.name).catch(() => {})
    load()
  }

  if (loading) return <div className="spinner" />

  return (
    <div className="card">
      <div className="card-title">Groups ({groups.length})</div>

      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input type="text" placeholder="New group name…" value={newGroup} onChange={e => setNewGroup(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addGroup()}
            style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={busy || !newGroup.trim()} onClick={addGroup}>Add Group</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Group Name</th>
              <th>Teacher</th>
              <th>Students</th>
              {!readOnly && <th></th>}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.name}</td>
                <td>
                  {!readOnly ? (
                    <select value={g.teacher_id || ''}
                      onChange={e => assignTeacher(g.id, e.target.value)}
                      style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '.83rem', width: 180 }}>
                      <option value="">No teacher assigned</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: '.83rem' }}>
                      {teachers.find(t => t.id === g.teacher_id)?.name || <span style={{ color: 'var(--muted)' }}>—</span>}
                    </span>
                  )}
                </td>
                <td>{g.students?.[0]?.count ?? 0}</td>
                {!readOnly && (
                  <td>
                    <button className="btn btn-danger btn-xs" onClick={() => deleteGroup(g.id)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={readOnly ? 3 : 4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No groups yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
