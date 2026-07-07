import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

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
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy]           = useState(null)
  const [form, setForm]           = useState({ name: '', email: '', role: 'registrar' })
  const [editEmail, setEditEmail] = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: userData }, { data: groupData }] = await Promise.all([
      supabase.from('users').select('id, name, email, role, last_login, group_id').order('role').order('name'),
      supabase.from('groups').select('id, name'),
    ])
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
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function changeRole(userId, newRole) {
    if (!confirm(`Change this user's role to "${newRole}"?`)) return
    setBusy(userId)
    try {
      const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId)
      if (error) throw error
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
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
                    <select value={u.role} disabled={busy === u.id}
                      onChange={e => changeRole(u.id, e.target.value)}
                      style={{ padding: '3px 6px', fontSize: '.78rem', borderRadius: 6, border: '1px solid var(--border)', fontWeight: 600 }}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  ) : (
                    <span className={`tag tag-${u.role}`}>{u.role}</span>
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
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
