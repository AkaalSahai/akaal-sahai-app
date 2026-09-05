import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'

export default function AdminGroups({ readOnly }) {
  const { profile, hasRole } = useAuth()
  const [groups, setGroups]     = useState([])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading]   = useState(true)
  const [newGroup, setNewGroup]  = useState('')
  const [busy, setBusy]         = useState(false)
  const [showMerge, setShowMerge]     = useState(false)
  const [mergeA, setMergeA]           = useState('')
  const [mergeB, setMergeB]           = useState('')
  const [keepId, setKeepId]           = useState('')
  const [mergeConflicts, setMergeConflicts] = useState(null)
  const [mergeChecking, setMergeChecking]   = useState(false)
  const [mergeBusy, setMergeBusy]     = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: g }, { data: t }, { data: tg }] = await Promise.all([
      supabase.from('groups').select('id, name, teacher_id, class_type, students(date_of_birth)').order('name'),
      supabase.from('users').select('id, name, role, extra_roles').order('name'),
      supabase.from('teacher_groups').select('teacher_id, group_id'),
    ])
    const tgMap = {}
    ;(tg || []).forEach(r => {
      if (!tgMap[r.group_id]) tgMap[r.group_id] = []
      tgMap[r.group_id].push(r.teacher_id)
    })
    setGroups((g || []).map(grp => {
      const ids = tgMap[grp.id] || []
      const teacherIds = grp.teacher_id && !ids.includes(grp.teacher_id) ? [grp.teacher_id, ...ids] : ids
      return { ...grp, teacherIds }
    }))
    setTeachers((t || []).filter(u => u.role === 'teacher' || (u.extra_roles || []).includes('teacher')))
    setLoading(false)
  }

  useEffect(() => {
    if (mergeA && mergeB && mergeA !== mergeB) checkMergeConflicts(mergeA, mergeB)
    else setMergeConflicts(null)
  }, [mergeA, mergeB])

  async function checkMergeConflicts(idA, idB) {
    setMergeChecking(true)
    try {
      const [{ data: da }, { data: db }] = await Promise.all([
        supabase.from('attendance_sessions').select('session_date').eq('group_id', idA),
        supabase.from('attendance_sessions').select('session_date').eq('group_id', idB),
      ])
      const datesB = new Set((db || []).map(r => r.session_date))
      const overlap = (da || []).map(r => r.session_date).filter(d => datesB.has(d))
      setMergeConflicts(overlap)
    } catch {
      setMergeConflicts(['unknown — could not check, please retry'])
    } finally {
      setMergeChecking(false)
    }
  }

  async function submitMerge() {
    if (!mergeA || !mergeB || !keepId) return
    const sourceId = keepId === mergeA ? mergeB : mergeA
    const targetId = keepId
    const sourceGroup = groups.find(g => g.id === sourceId)
    const targetGroup = groups.find(g => g.id === targetId)
    if (!confirm(`Merge "${sourceGroup?.name}" into "${targetGroup?.name}"?\n\nEverything from "${sourceGroup?.name}" (students, attendance history, teachers, class enrollments) will move into "${targetGroup?.name}", then "${sourceGroup?.name}" will be permanently deleted.\n\nThis cannot be undone.`)) return
    setMergeBusy(true)
    try {
      const { data, error } = await supabase.rpc('merge_groups', { source_group_id: sourceId, target_group_id: targetId })
      if (error) throw error
      logAction(profile, 'Merged groups', `${sourceGroup?.name} → ${targetGroup?.name}`).catch(() => {})
      alert(`Merged successfully.\n\n${data?.students_moved ?? 0} student(s), ${data?.sessions_moved ?? 0} attendance session(s), ${data?.teachers_merged ?? 0} co-teacher(s), and ${data?.class_enrollments_moved ?? 0} class enrollment(s) moved into "${targetGroup?.name}".`)
      setShowMerge(false); setMergeA(''); setMergeB(''); setKeepId(''); setMergeConflicts(null)
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setMergeBusy(false) }
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

      {hasRole('admin') && !readOnly && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowMerge(s => !s)}>
            {showMerge ? 'Cancel Merge' : 'Merge Groups'}
          </button>
          {showMerge && (
            <div style={{ marginTop: 10, padding: 14, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
              <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#991b1b', marginBottom: 10 }}>
                Merge two groups — this permanently deletes one of them after moving everything into the other.
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                <select value={mergeA} onChange={e => { setMergeA(e.target.value); setKeepId('') }}
                  style={{ flex: 1, minWidth: 160, padding: '6px 8px' }}>
                  <option value="">Select group A…</option>
                  {groups.filter(g => g.id !== mergeB).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <select value={mergeB} onChange={e => { setMergeB(e.target.value); setKeepId('') }}
                  style={{ flex: 1, minWidth: 160, padding: '6px 8px' }}>
                  <option value="">Select group B…</option>
                  {groups.filter(g => g.id !== mergeA).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>

              {mergeA && mergeB && (() => {
                const groupA = groups.find(g => g.id === mergeA)
                const groupB = groups.find(g => g.id === mergeB)
                const typeA = groupA?.class_type || 'punjabi'
                const typeB = groupB?.class_type || 'punjabi'
                const typeMismatch = typeA !== typeB
                const hasDateConflicts = mergeConflicts && mergeConflicts.length > 0
                return (
                  <>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: '.82rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" name="keepGroup" checked={keepId === mergeA} onChange={() => setKeepId(mergeA)} />
                        Keep "{groupA?.name}"
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="radio" name="keepGroup" checked={keepId === mergeB} onChange={() => setKeepId(mergeB)} />
                        Keep "{groupB?.name}"
                      </label>
                    </div>

                    {typeMismatch && (
                      <div style={{ color: '#991b1b', fontSize: '.8rem', fontWeight: 600, marginBottom: 10 }}>
                        Cannot merge — these groups are different types ({typeA} vs {typeB}).
                      </div>
                    )}
                    {mergeChecking && (
                      <div style={{ color: 'var(--muted)', fontSize: '.8rem', marginBottom: 10 }}>Checking for conflicting attendance dates…</div>
                    )}
                    {!mergeChecking && hasDateConflicts && (
                      <div style={{ color: '#991b1b', fontSize: '.8rem', fontWeight: 600, marginBottom: 10 }}>
                        Cannot merge — both groups have attendance sessions on: {mergeConflicts.join(', ')}
                      </div>
                    )}

                    <button className="btn btn-danger btn-sm"
                      disabled={!keepId || typeMismatch || hasDateConflicts || mergeChecking || mergeBusy}
                      onClick={submitMerge}>
                      {mergeBusy ? 'Merging…' : 'Merge Groups'}
                    </button>
                  </>
                )
              })()}
            </div>
          )}
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
