import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

// Self-service enrollment/management, opened from the account menu.
// Optional and opt-in - nothing here changes how anyone else logs in.
export default function MfaSetup({ onClose }) {
  const { refreshMfaLevel } = useAuth()
  const [loading, setLoading]     = useState(true)
  const [factor, setFactor]       = useState(null)    // existing verified factor, if any
  const [enrolling, setEnrolling] = useState(null)     // { factorId, qrCode, secret }
  const [code, setCode]           = useState('')
  const [error, setError]         = useState('')
  const [busy, setBusy]           = useState(false)

  useEffect(() => { loadStatus() }, [])

  async function loadStatus() {
    setLoading(true)
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (!error) setFactor((data?.totp || []).find(f => f.status === 'verified') || null)
    setLoading(false)
  }

  async function startEnroll() {
    setError(''); setBusy(true)
    try {
      // Supabase won't let a second TOTP factor be enrolled while one is
      // still unverified - clean up any stale attempt from before (e.g.
      // someone closed this dialog mid-setup last time) first. Unverified
      // factors only ever show up in `all`, never in the per-type arrays -
      // those are pre-filtered to verified-only.
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
      setEnrolling(null); setCode('')
      await loadStatus()
      await refreshMfaLevel()
    } catch (err) {
      setError(err.message || "That code didn't match. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    if (!confirm("Turn off two-factor authentication? You'll only need your password to sign in from now on.")) return
    setBusy(true); setError('')
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id })
      if (error) throw error
      setFactor(null)
      await refreshMfaLevel()
    } catch (err) {
      setError(err.message || 'Could not turn off two-factor authentication.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: 'white', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 16 }}>Two-Factor Authentication</h2>

        {error && <div className="alert alert-danger">{error}</div>}

        {loading ? (
          <div className="spinner" />
        ) : enrolling ? (
          <form onSubmit={confirmEnroll}>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: 14 }}>
              Scan this with an authenticator app (Google Authenticator, Authy, 1Password…), then enter the 6-digit code it shows.
            </p>
            <div style={{ textAlign: 'center', marginBottom: 14 }}>
              {/* enroll() already returns qr_code as a complete data: URI -
                  wrapping it again here would double-encode it and break
                  the image. */}
              <img
                src={enrolling.qrCode}
                alt="Scan with your authenticator app"
                style={{ width: 180, height: 180 }}
              />
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
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-outline" style={{ flex: 1 }}
                onClick={() => { setEnrolling(null); setCode(''); setError('') }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || code.length !== 6}>
                {busy ? 'Confirming…' : 'Confirm'}
              </button>
            </div>
          </form>
        ) : factor ? (
          <>
            <div className="alert alert-success">✓ Two-factor authentication is turned on.</div>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: 18 }}>
              You'll be asked for a 6-digit code from your authenticator app each time you sign in.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Close</button>
              <button className="btn btn-danger" style={{ flex: 1 }} disabled={busy} onClick={turnOff}>
                {busy ? 'Turning off…' : 'Turn off'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: 18 }}>
              Add an extra layer of protection to your account. Once turned on, you'll need a code from an authenticator app on your phone as well as your password to sign in.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={onClose}>Not now</button>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={startEnroll}>
                {busy ? 'Starting…' : 'Set up'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
