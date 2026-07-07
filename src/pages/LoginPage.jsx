import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { login, requestPasswordReset } = useAuth()
  const navigate = useNavigate()

  const [screen, setScreen] = useState('landing') // 'landing' | 'login' | 'reset' | 'magic'

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg, setResetMsg]     = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Incorrect email or password. Please try again.')
    } finally { setBusy(false) }
  }

  async function handleReset(e) {
    e.preventDefault()
    setBusy(true); setResetMsg('')
    try {
      await requestPasswordReset(resetEmail.trim())
      setResetMsg('Reset link sent! Check your inbox (and spam folder).')
    } catch (err) {
      setResetMsg(err.message || 'Could not send reset email. Try again in a few minutes.')
    } finally { setBusy(false) }
  }

  async function handleMagicLink(e) {
    e.preventDefault()
    setBusy(true); setResetMsg('')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: resetEmail.trim(),
        options: { emailRedirectTo: window.location.origin + '/' },
      })
      if (error) throw error
      setResetMsg('Sign-in link sent! Click the link in your email.')
    } catch (err) {
      setResetMsg(err.message || 'Could not send sign-in link. Try again in a few minutes.')
    } finally { setBusy(false) }
  }

  return (
    <div className="login-screen">
      <div className="login-card">

        {/* Logo + title — always visible */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="Akaal Sahai" style={{ height: 90, marginBottom: 12 }} />
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>Akaal Sahai Southall</h1>
        </div>

        {/* ── LANDING ── */}
        {screen === 'landing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link to="/register/student" className="btn btn-primary btn-block" style={{ fontSize: '1rem', padding: '14px' }}>
              Student Registration
            </Link>
            <Link to="/register/teacher" className="btn btn-outline btn-block" style={{ fontSize: '1rem', padding: '14px' }}>
              Teacher Registration
            </Link>
            <button className="btn btn-block" onClick={() => setScreen('login')}
              style={{ fontSize: '1rem', padding: '14px', background: 'var(--primary)', color: 'white', opacity: 0.85 }}>
              Teacher / Staff Login
            </button>
          </div>
        )}

        {/* ── LOGIN ── */}
        {screen === 'login' && (
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
                <div style={{ position: 'relative' }}>
                  <input type={showPw ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required autoComplete="current-password" style={{ paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem' }}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 12, fontSize: '.83rem', display: 'flex', justifyContent: 'center', gap: 16 }}>
              <button type="button" onClick={() => { setScreen('reset'); setResetEmail(email) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}>
                Forgot password?
              </button>
              <span style={{ color: 'var(--border)' }}>|</span>
              <button type="button" onClick={() => { setScreen('magic'); setResetEmail(email) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600 }}>
                Email me a sign-in link
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button type="button" onClick={() => setScreen('landing')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '.82rem' }}>
                ← Back
              </button>
            </div>
          </>
        )}

        {/* ── FORGOT PASSWORD ── */}
        {screen === 'reset' && (
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
              <button type="button" onClick={() => setScreen('login')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '.82rem' }}>
                ← Back to Sign In
              </button>
            </div>
          </>
        )}

        {/* ── MAGIC LINK ── */}
        {screen === 'magic' && (
          <>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Sign In by Email Link</h2>
            <p style={{ fontSize: '.83rem', color: 'var(--muted)', marginBottom: 14 }}>
              We'll email you a one-click link — no password needed.
            </p>
            <form onSubmit={handleMagicLink}>
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
                {busy ? 'Sending…' : 'Send Sign-In Link'}
              </button>
            </form>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button type="button" onClick={() => setScreen('login')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '.82rem' }}>
                ← Back to Sign In
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
