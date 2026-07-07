import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Topbar({ title }) {
  const { profile, logout, changePassword } = useAuth()
  const [showMenu, setShowMenu] = useState(false)
  const [showPw, setShowPw]     = useState(false)
  const [current, setCurrent]   = useState('')
  const [newPw, setNewPw]       = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError]   = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)
  const [busy, setBusy]         = useState(false)

  async function handleLogout() {
    await logout()
  }

  async function handleChangePw(e) {
    e.preventDefault()
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    if (newPw.length < 8) { setPwError('Minimum 8 characters'); return }
    setBusy(true); setPwError('')
    try {
      await changePassword(current, newPw)
      setPwSuccess(true)
      setTimeout(() => { setShowPw(false); setPwSuccess(false); setCurrent(''); setNewPw(''); setConfirmPw('') }, 2000)
    } catch (err) {
      setPwError(err.message || 'Failed to change password')
    } finally { setBusy(false) }
  }

  const roleLabel = { admin: 'Admin', registrar: 'Registrar', teacher: 'Teacher' }[profile?.role] || ''

  return (
    <>
      <div className="topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Akaal Sahai" style={{ height: 36 }} />
          <span style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--primary)' }}>{title}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setShowMenu(m => !m)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 10px', borderRadius: 10, fontWeight: 600, fontSize: '.85rem' }}>
            <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.78rem', fontWeight: 800 }}>
              {profile?.name?.[0] || '?'}
            </span>
            <span style={{ color: 'var(--text)' }}>{profile?.name}</span>
            <span className={`tag tag-${profile?.role}`}>{roleLabel}</span>
          </button>
          {showMenu && (
            <div style={{ position: 'absolute', right: 0, top: '110%', background: 'white', border: '1px solid var(--border)', borderRadius: 12, minWidth: 170, boxShadow: '0 8px 25px rgba(0,0,0,.12)', zIndex: 200 }}>
              <button onClick={() => { setShowMenu(false); setShowPw(true) }}
                style={{ width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontWeight: 600, fontSize: '.86rem' }}>
                Change Password
              </button>
              <hr style={{ margin: '4px 12px', border: 'none', borderTop: '1px solid var(--border)' }} />
              <button onClick={handleLogout}
                style={{ width: '100%', padding: '12px 16px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', color: 'var(--danger)', fontWeight: 600, fontSize: '.86rem' }}>
                Sign Out
              </button>
            </div>
          )}
          {showMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => setShowMenu(false)} />}
        </div>
      </div>

      {showPw && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>Change Password</h2>
            {pwSuccess ? (
              <div className="alert alert-success">Password updated successfully!</div>
            ) : (
              <form onSubmit={handleChangePw}>
                {pwError && <div className="alert alert-danger">{pwError}</div>}
                <div className="form-group">
                  <label>Current Password</label>
                  <input type="password" value={current} onChange={e => setCurrent(e.target.value)} required placeholder="••••••••" />
                </div>
                <div className="form-group">
                  <label>New Password</label>
                  <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required placeholder="At least 8 characters" />
                </div>
                <div className="form-group">
                  <label>Confirm New Password</label>
                  <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required placeholder="Repeat new password" />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowPw(false)} style={{ flex: 1 }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>
                    {busy ? 'Saving…' : 'Update'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
