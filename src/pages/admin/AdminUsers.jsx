import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminUsers() {
  const [users, setUsers]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy]       = useState(null)
  const [form, setForm]       = useState({ name: '', email: '', role: 'registrar' })
  const [editEmail, setEditEmail] = useState({})
  const [reveal, setReveal]   = useState({})

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('users')
      .select('id, name, email, role, last_login, pw_changed_at, groups(name)')
      .order('role')
      .order('name')
    setUsers(data || [])
    setLoading(false)
  }

  async function createUser() {
    if (!form.name || !form.email) { alert('Name and email are required'); return }
    setBusy('create')
    try {
      const tempPw = Math.random().toString(36).slice(-6) + 'A1!'
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: form.email, password: tempPw, email_confirm: true,
      })
      if (authErr) throw authErr
      const { error: dbErr } = await supabase.from('users').insert({
        id: authData.user.id, name: form.name, email: form.email, role: form.role,
      })
      if (dbErr) throw dbErr
      alert('User created!\n\nEmail: ' + form.email + '\nTemp password: ' + tempPw + '\n\nShare these with the user.')
      setShowCreate(false); setForm({ name: '', email: '', role: 'registrar' }); load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function updateEmail(userId, newEmail) {
    setBusy(userId)
    try {
      const { error } = await supabase.auth.admin.updateUserById(userId, { email: newEmail })
      if (error) throw error
      await supabase.from('users').update({ email: newEmail }).eq('id', userId)
      setEditEmail(prev => ({ ...prev, [userId]: undefined }))
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function resetUserPassword(userId, email) {
    setBusy(userId)
    try {
      const newPw = Math.random().toString(36).slice(-6) + 'A1!'
      const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPw })
      if (error) throw error
      await supabase.from('users').update({ pw_changed_at: null }).eq('id', userId)
      alert('Password reset!\n\nNew temp password: ' + newPw + '\n\nShare this with ' + email)
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function deleteUser(userId, name) {
    if (!confirm('Delete user "' + name + '"? This cannot be undone.')) return
    setBusy(userId)
    try {
      const { error } = await supabase.auth.admin.deleteUser(userId)
      if (error) throw error
      await supabase.from('users').delete().eq('id', userId)
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  const roleOrder = ['admin','registrar','teacher']
  const sorted = [...users].sort((a,b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role) || a.name.localeCompare(b.name))

  if (loading) return <div className="spinner" />

  return (
    <div className="card">
      <div className="card-title">
        Users ({users.length})
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(s => !s)}>
          {showCreate ? 'Cancel' : '+ New User'}
        </button>
      </div>

      {showCreate && (
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
              </select>
            </div>
          </div>
          <button className="btn btn-success" disabled={busy === 'create'} onClick={createUser}>
            {busy === 'create' ? 'Creating…' : 'Create User'}
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
                <td><span className={`tag tag-${u.role}`}>{u.role}</span></td>
                <td>
                  {editEmail[u.id] !== undefined ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input type="email" value={editEmail[u.id]} onChange={e => setEditEmail(prev => ({ ...prev, [u.id]: e.target.value }))}
                        style={{ width: 180, padding: '4px 8px', fontSize: '.82rem' }} />
                      <button className="btn btn-success btn-xs" disabled={busy === u.id} onClick={() => updateEmail(u.id, editEmail[u.id])}>Save</button>
                      <button className="btn btn-outline btn-xs" onClick={() => setEditEmail(prev => { const n = {...prev}; delete n[u.id]; return n })}>✕</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '.83rem', cursor: 'pointer' }} onClick={() => setEditEmail(prev => ({ ...prev, [u.id]: u.email }))}>
                      {u.email} ✎
                    </span>
                  )}
                </td>
                <td>{u.groups?.name || '—'}</td>
                <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                  {u.last_login ? new Date(u.last_login).toLocaleDateString('en-GB') : 'Never'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-warning btn-xs" disabled={busy === u.id} onClick={() => resetUserPassword(u.id, u.email)}>
                      Reset PW
                    </button>
                    <button className="btn btn-danger btn-xs" disabled={busy === u.id} onClick={() => deleteUser(u.id, u.name)}>
                      Delete
                    </button>
                  </div>
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
