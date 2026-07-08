import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-action`

async function callAdminAction(payload, token) {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

const ROLES = ['admin','registrar','teacher','adminView']

export default function AdminUsers({ readOnly }) {
  const { profile: myProfile } = useAuth()
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy]           = useState(null)
  const [form, setForm]           = useState({ name: '', email: '', role: 'registrar' })
  const [editEmail, setEditEmail] = useState({})
  const [roleDrafts, setRoleDrafts] = useState({})
  const [savedMsg, setSavedMsg]     = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    setLoadError(null)
    const [{ data: userData, error: userErr }, { data: groupData }] = await Promise.all([
      supabase.from('users').select('id, name, email, role, extra_roles, can_edit_students, last_login, group_id').order('role').order('name'),
      supabase.from('groups').select('id, name'),
    ])
    if (userErr) {
      if (userErr.message?.includes('can_edit_students')) {
        const { data: fallback } = await supabase
          .from('users').select('id, name, email, role, extra_roles, last_login, group_id').order('role').order('name')
        const groupMap = {}
        ;(groupData || []).forEach(g => { groupMap[g.id] = g.name })
        setUsers((fallback || []).map(u => ({ ...u, can_edit_students: false, groupName: u.group_id ? groupMap[u.group_id] : null })))
        setLoadError('⚠ Run the teacher-edit-permission.txt SQL to enable the Edit Students toggle.')
      } else {
        setLoadError('Error loading users: ' + userErr.message)
      }
      setLoading(false)
      return
    }
    const groupMap = {}
    ;(groupData || []).forEach(g => { groupMap[g.id] = g.name })
    setUsers((userData || []).map(u => ({ ...u, groupName: u.group_id ? groupMap[u.group_id] : null })))
    setLoading(false)
  }

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session.access_token
  }

  async function createUser() {
    if (!form.name || !form.email) { alert('Name and email are required'); return }
    setBusy('create')
    try {
      const token = await getToken()
      const result = await callAdminAction({ action: 'create', name: form.name, email: form.email, role: form.role }, token)
      alert(`User created!\n\nEmail: ${form.email}\nTemp password: ${result.tempPw}\n\nShare these with the user — they should change their password after first login.`)
      logAction(myProfile, 'Created user', `${form.name} (${form.role})`).catch(() => {})
      setShowCreate(false)
      setForm({ name: '', email: '', role: 'registrar' })
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function updateEmail(userId, newEmail) {
    setBusy(userId)
    try {
      const token = await getToken()
      await callAdminAction({ action: 'update-email', userId, newEmail }, token)
      const u = users.find(x => x.id === userId)
      logAction(myProfile, 'Updated email', `${u?.name} → ${newEmail}`).catch(() => {})
      setEditEmail(prev => { const n = { ...prev }; delete n[userId]; return n })
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function resetUserPassword(userId, email) {
    setBusy(userId)
    try {
      const token = await getToken()
      const result = await callAdminAction({ action: 'reset-password', userId, email }, token)
      alert(`Password reset!\n\nNew temp password: ${result.tempPw}\n\nShare this with ${email}`)
      const u = users.find(x => x.id === userId)
      logAction(myProfile, 'Reset password', u?.name || email).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function deleteUser(userId, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return
    setBusy(userId)
    try {
      const token = await getToken()
      await callAdminAction({ action: 'delete', userId }, token)
      logAction(myProfile, 'Deleted user', name).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function changeRole(userId, newRole) {
    if (!confirm(`Change this user's primary role to "${newRole}"?`)) return
    setBusy(userId)
    try {
      const u = users.find(x => x.id === userId)
      const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)
      if (error) throw error
      logAction(myProfile, 'Changed primary role', `${u?.name}: ${u?.role} → ${newRole}`).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  function getDraft(userId, currentExtras) {
    return roleDrafts[userId] ?? (currentExtras || [])
  }

  function toggleDraftRole(userId, currentExtras, roleToToggle) {
    const current = getDraft(userId, currentExtras)
    const updated = current.includes(roleToToggle)
      ? current.filter(r => r !== roleToToggle)
      : [...current, roleToToggle]
    setRoleDrafts(prev => ({ ...prev, [userId]: updated }))
    setSavedMsg(prev => ({ ...prev, [userId]: false }))
  }

  async function saveExtraRoles(userId, currentExtras) {
    const draft = getDraft(userId, currentExtras)
    setBusy(userId)
    try {
      const { error } = await supabase.from('users').update({ extra_roles: draft }).eq('id', userId)
      if (error) throw error
      const u = users.find(x => x.id === userId)
      logAction(myProfile, 'Updated extra roles', `${u?.name}: [${draft.join(', ') || 'none'}]`).catch(() => {})
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, extra_roles: draft } : u))
      setRoleDrafts(prev => { const n = { ...prev }; delete n[userId]; return n })
      setSavedMsg(prev => ({ ...prev, [userId]: true }))
      setTimeout(() => setSavedMsg(prev => ({ ...prev, [userId]: false })), 2500)
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function toggleEditStudents(userId, current) {
    const updated = !current
    try {
      const { error } = await supabase.from('users').update({ can_edit_students: updated }).eq('id', userId)
      if (error) throw error
      const u = users.find(x => x.id === userId)
      logAction(myProfile, 'Toggled student edit permission', `${u?.name}: ${updated ? 'enabled' : 'disabled'}`).catch(() => {})
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, can_edit_students: updated } : u))
    } catch (err) { alert('Error: ' + err.message) }
  }

  const roleOrder = ['admin', 'adminView', 'registrar', 'teacher']
  const sorted = [...users].sort((a, b) =>
    roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.name.localeCompare(b.name)
  )

  if (loading) return <div className="spinner" />

  return (
    <div className="card">
      <div className="card-title">
        Teachers & Staff ({users.length})
        {!readOnly && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(s => !s)}>
            {showCreate ? 'Cancel' : '+ New User'}
          </button>
        )}
      </div>

      {loadError && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, fontSize: '.84rem', color: '#92400e' }}>
          {loadError}
        </div>
      )}

      {showCreate && !readOnly && (
        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Manveer Singh" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
            </div>
            <div className="form-group">
              <label>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option value="admin">Admin</option>
                <option value="registrar">Registrar</option>
                <option value="teacher">Teacher</option>
                <option value="adminView">Admin View (read-only)</option>
              </select>
            </div>
          </div>
          <button className="btn btn-success" disabled={busy === 'create'} onClick={createUser}>
            {busy === 'create' ? 'Creating…' : 'Create User & Get Temp Password'}
          </button>
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Email</th>
              <th>Group</th>
              <th>Edit Students</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(u => (
              <tr key={u.id}>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td>
                  {!readOnly ? (
                    <div>
                      <select value={u.role} disabled={busy === u.id}
                        onChange={e => changeRole(u.id, e.target.value)}
                        style={{ padding: '3px 6px', fontSize: '.78rem', borderRadius: 6, border: '1px solid var(--border)', fontWeight: 600, marginBottom: 4, display: 'block' }}>
                        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <div style={{ marginTop: 4 }}>
                        <div style={{ fontSize: '10px', color: 'var(--muted)', letterSpacing: '.04em', marginBottom: 4, textTransform: 'uppercase' }}>Extra roles</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                          {ROLES.filter(r => r !== u.role).map(r => {
                            const draft = getDraft(u.id, u.extra_roles)
                            const active = draft.includes(r)
                            return (
                              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '.75rem',
                                cursor: 'pointer', userSelect: 'none',
                                color: active ? 'var(--primary)' : 'var(--muted)',
                                fontWeight: active ? 700 : 400 }}>
                                <input type="checkbox" checked={active} style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                                  onChange={() => toggleDraftRole(u.id, u.extra_roles, r)} />
                                {r}
                              </label>
                            )
                          })}
                        </div>
                        {roleDrafts[u.id] !== undefined && (
                          <button className="btn btn-primary btn-xs" disabled={busy === u.id}
                            onClick={() => saveExtraRoles(u.id, u.extra_roles)}
                            style={{ fontSize: '.72rem', padding: '3px 10px' }}>
                            {busy === u.id ? 'Saving…' : 'Save Roles'}
                          </button>
                        )}
                        {savedMsg[u.id] && (
                          <span style={{ fontSize: '.72rem', color: 'var(--success)', fontWeight: 700, marginLeft: 8 }}>✓ Saved</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className={`tag tag-${u.role}`}>{u.role}</span>
                      {(u.extra_roles || []).map(r => <span key={r} className={`tag tag-${r}`} style={{ marginLeft: 3 }}>{r}</span>)}
                    </div>
                  )}
                </td>
                <td>
                  {!readOnly && editEmail[u.id] !== undefined ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input type="email" value={editEmail[u.id]}
                        onChange={e => setEditEmail(prev => ({ ...prev, [u.id]: e.target.value }))}
                        style={{ width: 180, padding: '4px 8px', fontSize: '.82rem' }} />
                      <button className="btn btn-success btn-xs" disabled={busy === u.id} onClick={() => updateEmail(u.id, editEmail[u.id])}>Save</button>
                      <button className="btn btn-outline btn-xs" onClick={() => setEditEmail(prev => { const n = { ...prev }; delete n[u.id]; return n })}>✕</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '.83rem', cursor: !readOnly ? 'pointer' : 'default' }} title={!readOnly ? 'Click to edit email' : ''}
                      onClick={() => !readOnly && setEditEmail(prev => ({ ...prev, [u.id]: u.email }))}>
                      {u.email} {!readOnly && '✎'}
                    </span>
                  )}
                </td>
                <td>{u.groupName || '—'}</td>
                <td>
                  {(u.role === 'teacher' || (u.extra_roles || []).includes('teacher')) ? (
                    !readOnly ? (
                      <button onClick={() => toggleEditStudents(u.id, u.can_edit_students)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 10px', borderRadius: 20, fontSize: '.75rem', fontWeight: 700,
                          border: 'none', cursor: 'pointer', transition: 'all .15s',
                          background: u.can_edit_students ? '#dcfce7' : '#f1f5f9',
                          color: u.can_edit_students ? '#15803d' : '#94a3b8' }}>
                        <span style={{ width: 28, height: 16, borderRadius: 8, position: 'relative', display: 'inline-block',
                          background: u.can_edit_students ? '#22c55e' : '#cbd5e1', transition: 'background .15s', flexShrink: 0 }}>
                          <span style={{ position: 'absolute', top: 2, left: u.can_edit_students ? 14 : 2,
                            width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                        </span>
                        {u.can_edit_students ? 'Enabled' : 'Disabled'}
                      </button>
                    ) : (
                      <span style={{ fontSize: '.75rem', color: u.can_edit_students ? '#15803d' : '#94a3b8', fontWeight: 600 }}>
                        {u.can_edit_students ? 'Enabled' : 'Disabled'}
                      </span>
                    )
                  ) : (
                    <span style={{ fontSize: '.75rem', color: '#cbd5e1' }}>—</span>
                  )}
                </td>
                <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {u.last_login ? new Date(u.last_login).toLocaleDateString('en-GB') : 'Never'}
                </td>
                <td>
                  {!readOnly && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-warning btn-xs" disabled={busy === u.id} onClick={() => resetUserPassword(u.id, u.email)}>
                        {busy === u.id ? '…' : 'Reset PW'}
                      </button>
                      <button className="btn btn-danger btn-xs" disabled={busy === u.id} onClick={() => deleteUser(u.id, u.name)}>
                        {busy === u.id ? '…' : 'Delete'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
