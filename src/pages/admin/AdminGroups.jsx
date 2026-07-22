import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'

export default function AdminGroups({ readOnly }) {
  const { profile } = useAuth()
  const [groups, setGroups]     = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading]   = useState(true)
  const [newGroup, setNewGroup]  = useState('')
  const [busy, setBusy]         = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: g }, { data: t }, { data: tg }] = await Promise.all([
      supabase.from('groups').select('id, name, teacher_id, students(date_of_birth)').order('name'),
      supabase.from('users').select('id, name').eq('role', 'teacher').order('name'),
      supabase.from('teacher_groups').select('teacher_id, group_id'),
    ])
    const tgMap = {}
    ;(tg || []).forEach(r => {
      if (!tgMap[r.group_id]) tgMap[r.group_id] = []
      tgMap[r.group_id].push(r.teacher_id)
    })
    setGroups((g || []).map(grp => ({ ...grp, teacherIds: tgMap[grp.id] || [] })))
    setTeachers(t || [])
    setLoading(false)
  }

  function calcAge(dob) {
    if (!dob) return null
    const d = new Date(dob), now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
    return a
  }

  function ageRange(students) {
    const ages = (students || []).map(s => calcAge(s.date_of_birth)).filter(a => a !== null)
    if (ages.length === 0) return null
    const min = Math.min(...ages), max = Math.max(...ages)
    return min === max ? `${min} yrs` : `${min}–${max} yrs`
  }

  async function addGroup() {
    if (!newGroup.trim()) return
    setBusy(true)
    const { error } = await supabase.from('groups').insert({ name: newGroup.trim() })
    if (error) alert(error.message)
    else { logAction(profile, 'Created group', newGroup.trim()).catch(() => {}); setNewGroup(''); load() }
    setBusy(false)
  }

  async function addTeacherToGroup(groupId, teacherId) {
    if (!teacherId) return
    try {
      const { error } = await supabase.from('teacher_groups').insert({ teacher_id: teacherId, group_id: groupId })
      if (error) { alert(error.message); return }
      const g = groups.find(x => x.id === groupId)
      if (!g?.teacher_id) {
        await supabase.from('groups').update({ teacher_id: teacherId }).eq('id', groupId)
      }
      const teacherName = teachers.find(t => t.id === teacherId)?.name
      logAction(profile, 'Assigned teacher to group', `${teacherName} → ${g?.name}`).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
  }

  async function removeTeacherFromGroup(groupId, teacherId) {
    try {
      const { error } = await supabase.from('teacher_groups').delete().eq('teacher_id', teacherId).eq('group_id', groupId)
      if (error) { alert(error.message); return }
      const g = groups.find(x => x.id === groupId)
      if (g?.teacher_id === teacherId) {
        const remaining = (g.teacherIds || []).filter(id => id !== teacherId)
        await supabase.from('groups').update({ teacher_id: remaining[0] || null }).eq('id', groupId)
      }
      const teacherName = teachers.find(t => t.id === teacherId)?.name
      logAction(profile, 'Removed teacher from group', `${teacherName} ← ${g?.name}`).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
  }

  async function deleteGroup(groupId) {
    const g = groups.find(x => x.id === groupId)
    const count = (g?.students || []).length
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
            onKeyDown={e => e.key === 'Enter' && addGroup()} style={{ flex: 1 }} />
          <button className="btn btn-primary" disabled={busy || !newGroup.trim()} onClick={addGroup}>Add Group</button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Group Name</th>
              <th>Teachers</th>
              <th>Students</th>
              <th>Age Range</th>
              {!readOnly && <th></th>}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.name}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {(g.teacherIds || []).map(tid => {
                      const t = teachers.find(x => x.id === tid)
                      if (!t) return null
                      return (
                        <span key={tid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: '#e0e7ff', color: '#3730a3', borderRadius: 6,
                          padding: '2px 8px', fontSize: '.78rem', fontWeight: 600 }}>
                          {t.name}
                          {!readOnly && (
                            <button onClick={() => removeTeacherFromGroup(g.id, tid)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer',
                                color: '#3730a3', padding: '0 0 0 2px', lineHeight: 1, fontSize: '1rem' }}>
                              ×
                            </button>
                          )}
                        </span>
                      )
                    })}
                    {!readOnly && (
                      <select value="" onChange={e => addTeacherToGroup(g.id, e.target.value)}
                        style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)',
                          fontSize: '.78rem', color: 'var(--muted)', background: 'white' }}>
                        <option value="">+ Add teacher</option>
                        {teachers
                          .filter(t => !(g.teacherIds || []).includes(t.id))
                          .map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                    {(g.teacherIds || []).length === 0 && readOnly && (
                      <span style={{ color: 'var(--muted)', fontSize: '.82rem' }}>—</span>
                    )}
                  </div>
                </td>
                <td>{(g.students || []).length}</td>
                <td style={{ whiteSpace: 'nowrap', color: '#475569', fontSize: '.85rem' }}>
                  {ageRange(g.students) ?? <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
                {!readOnly && (
                  <td>
                    <button className="btn btn-danger btn-xs" onClick={() => deleteGroup(g.id)}>Delete</button>
                  </td>
                )}
              </tr>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={readOnly ? 4 : 5} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No groups yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
