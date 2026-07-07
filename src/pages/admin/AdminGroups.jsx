import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminGroups() {
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
    else { setNewGroup(''); load() }
    setBusy(false)
  }

  async function assignTeacher(groupId, teacherId) {
    await supabase.from('groups').update({ teacher_id: teacherId || null }).eq('id', groupId)
    // Also update teacher's group_id
    if (teacherId) await supabase.from('users').update({ group_id: groupId }).eq('id', teacherId)
    load()
  }

  async function deleteGroup(groupId) {
    const g = groups.find(x => x.id === groupId)
    const count = g?.students?.[0]?.count || 0
    if (count > 0) { alert('Cannot delete a group that has students. Move or remove students first.'); return }
    if (!confirm('Delete group "' + g?.name + '"?')) return
    await supabase.from('groups').delete().eq('id', groupId)
    load()
  }

  if (loading) return <div className="spinner" />

  return (
    <div className="card">
      <div className="card-title">Groups ({groups.length})</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="text" placeholder="New group name…" value={newGroup} onChange={e => setNewGroup(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addGroup()}
          style={{ flex: 1 }} />
        <button className="btn btn-primary" disabled={busy || !newGroup.trim()} onClick={addGroup}>Add Group</button>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Group Name</th>
              <th>Teacher</th>
              <th>Students</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.name}</td>
                <td>
                  <select value={g.teacher_id || ''}
                    onChange={e => assignTeacher(g.id, e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '.83rem', width: 180 }}>
                    <option value="">No teacher assigned</option>
                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </td>
                <td>{g.students?.[0]?.count ?? 0}</td>
                <td>
                  <button className="btn btn-danger btn-xs" onClick={() => deleteGroup(g.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No groups yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
