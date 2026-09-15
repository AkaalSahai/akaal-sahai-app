import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

// Shown instead of the app when mfaEnrollmentRequired is true - admin has
// switched on requiring 2FA for admin/registrar, and this account hasn't
// enrolled a factor yet. Unlike MfaSetup.jsx (opened from the account menu,
// dismissible, opt-in), there's no "not now" here - this is the same
// enroll-and-confirm flow, just full-page and mandatory.
export default function MfaRequiredSetup() {
  const { refreshMfaLevel, logout } = useAuth()
  const [enrolling, setEnrolling] = useState(null) // { factorId, qrCode, secret }
  const [code, setCode]           = useState('')
  const [error, setError]         = useState('')
  const [busy, setBusy]           = useState(false)

  useEffect(() => { startEnroll() }, [])

  async function startEnroll() {
    setError(''); setBusy(true)
    try {
      // Same cleanup as MfaSetup.jsx - Supabase won't allow a second TOTP
      // factor while one is still unverified, and unverified factors only
      // ever show up in listFactors()'s `all` array.
      const { data: existing } = await supabase.auth.mfa.listFactors()
      const stale = (existing?.all || []).find(f => f.factor_type === 'totp' && f.status !== 'verified')
      if (stale) await supabase.auth.mfa.unenroll({ factorId: stale.id })

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) throw error
      setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    } catch (err) {
      setError(err.message || 'Could not start setup. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmEnroll(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId })
      if (challengeErr) throw challengeErr
      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: enrolling.factorId, challengeId: challenge.id, code: code.trim(),
      })
      if (verifyErr) throw verifyErr
      await refreshMfaLevel()
    } catch (err) {
      setError(err.message || "That code didn't match. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="Akaal Sahai" style={{ height: 90, marginBottom: 12 }} />
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>Two-Factor Authentication Required</h1>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {enrolling ? (
          <form onSubmit={confirmEnroll}>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: 14 }}>
              Your account now requires two-factor authentication. Scan this with an authenticator app
              (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.
            </p>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              {/* enroll() already returns qr_code as a complete data: URI. */}
              <img src={enrolling.qrCode} alt="Scan with your authenticator app" style={{ width: 180, height: 180 }} />
            </div>
            <div style={{ fontSize: '.76rem', color: 'var(--muted)', textAlign: 'center', marginBottom: 14 }}>
              Can't scan it? Enter this code manually:<br />
              <code style={{ fontWeight: 700, letterSpacing: '.05em' }}>{enrolling.secret}</code>
            </div>
            <div className="form-group">
              <label>6-digit code</label>
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456" required autoFocus
                style={{ fontSize: '1.2rem', letterSpacing: '.3em', textAlign: 'center' }}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {busy ? 'Confirming…' : 'Confirm'}
            </button>
          </form>
        ) : (
          <div className="spinner" />
        )}

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" onClick={logout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '.82rem' }}>
            ← Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
