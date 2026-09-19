import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

// Shown instead of the app whenever mfaChallengePending is true - the
// person has a verified authenticator enrolled but hasn't cleared the
// code-entry step in this session yet. Password sign-in alone only gets
// them to aal1; this is what gets them to aal2.
export default function MfaChallenge() {
  const { refreshMfaLevel, logout } = useAuth()
  const [code, setCode]   = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)

  async function handleVerify(e) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) throw listErr
      const factor = (factors?.totp || []).find(f => f.status === 'verified')
      if (!factor) throw new Error('No verified authenticator found on this account. Contact your admin.')

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
      if (challengeErr) throw challengeErr

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: factor.id, challengeId: challenge.id, code: code.trim(),
      })
      if (verifyErr) throw verifyErr

      await refreshMfaLevel()
    } catch (err) {
      setError(err.message || 'Invalid code. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo.png" alt="Akaal Sahai" style={{ height: 90, marginBottom: 12 }} />
          <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--primary)' }}>Two-Factor Authentication</h1>
        </div>

        <form onSubmit={handleVerify}>
          {error && <div className="alert alert-danger">{error}</div>}
          <div className="form-group">
            <label>Enter the 6-digit code from your authenticator app</label>
            <input
              type="text" inputMode="numeric" autoComplete="one-time-code"
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456" required autoFocus
              style={{ fontSize: '1.3rem', letterSpacing: '.3em', textAlign: 'center' }}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button type="button" onClick={logout}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '.82rem' }}>
            ← Sign in with a different account
          </button>
        </div>
      </div>
    </div>
  )
}
