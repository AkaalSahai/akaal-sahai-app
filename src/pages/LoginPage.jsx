import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { login, requestPasswordReset, profile } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [showReset, setShowReset]   = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg]     = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const { data } = await login(email.trim(), password)
      const role = data.user ? null : null // profile fetched in context
      // navigate after profile loads — RootRedirect handles it
      navigate('/', { replace: true })
    } catch (err) {
      setError('Incorrect email or password. Please try again.')
    } finally { setBusy(false) }
  }

  async function handleReset(e) {
    e.preventDefault()
    setBusy(true); setResetMsg('')
    try {
      await requestPasswordReset(resetEmail.trim())
      setResetMsg('Password reset email sent. Check your inbox.')
    } catch (err) {
      setResetMsg('Could not send reset email. Check the address and try again.')
    } finally { setBusy(false) }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src="/logo.png" alt="Akaal Sahai" style={{ height: 80, marginBottom: 10 }} />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>Akaal Sahai Southall</h1>
          <p style={{ fontSize: '.83rem', color: 'var(--muted)', marginTop: 2 }}>Punjabi Classes Management</p>
        </div>

        {!showReset ? (
          <>
            <form onSubmit={handleLogin}>
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com" required autoComplete="email" />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete="current-password" />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 14, fontSize: '.83rem', color: 'var(--muted)' }}>
              <button type="button" onClick={() => setShowReset(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}>
                Forgot password?
              </button>
            </div>
            <hr style={{ margin: '18px 0', border: 'none', borderTop: '1px solid var(--border)' }} />
            <div style={{ textAlign: 'center', fontSize: '.82rem', color: 'var(--muted)' }}>
              <Link to="/register/student" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                Register your child
              </Link>
              {'  ·  '}
              <Link to="/register/teacher" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
                Teacher Sevadaar Registration
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 14 }}>Reset Password</h2>
            <form onSubmit={handleReset}>
              {resetMsg && (
                <div className={`alert ${resetMsg.includes('sent') ? 'alert-success' : 'alert-danger'}`}>
                  {resetMsg}
                </div>
              )}
              <div className="form-group">
                <label>Email Address</label>
                <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                  placeholder="your@email.com" required />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" onClick={() => setShowReset(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: '.83rem' }}>
                Back to Sign In
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
