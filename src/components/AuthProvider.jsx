import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logAction } from '../lib/audit'
import { AuthContext } from '../context/AuthContext'

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Authenticator Assurance Level - 'aal1' means password-only, 'aal2' means
  // a second factor has also been verified this session. nextLevel is what
  // the account is CAPABLE of (aal2 only if they've enrolled a factor at
  // all) - comparing the two is how we know whether someone who HAS 2FA
  // enrolled still needs to complete that challenge before proceeding.
  const [mfaLevel, setMfaLevel] = useState(null)

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    return data
  }

  async function refreshMfaLevel() {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!error) setMfaLevel(data)
  }

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id).finally(() => setLoading(false))
          refreshMfaLevel()
          supabase.from('users').update({ last_seen: new Date().toISOString() }).eq('id', session.user.id)
            .then(({ error }) => { if (error) console.error('last_seen update failed:', error.message) })
        } else setLoading(false)
      })
      .catch(() => setLoading(false))

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) { fetchProfile(session.user.id); refreshMfaLevel() }
      else { setProfile(null); setMfaLevel(null) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    const now = new Date().toISOString()
    await supabase.from('users').update({ last_login: now }).eq('id', data.user.id)
    supabase.from('users').update({ last_seen: now }).eq('id', data.user.id)
      .then(({ error }) => { if (error) console.error('last_seen update failed:', error.message) })
    const profileData = await fetchProfile(data.user.id)
    logAction(profileData, 'Signed in').catch(() => {})
    return data
  }

  async function logout() {
    if (profile) logAction(profile, 'Signed out').catch(() => {})
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  async function changePassword(currentPassword, newPassword) {
    // Re-authenticate first
    const { error: reAuthError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (reAuthError) {
      logAction(profile, 'Changed password', 'Incorrect current password', false).catch(() => {})
      throw new Error('Current password is incorrect')
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      logAction(profile, 'Changed password', error.message, false).catch(() => {})
      throw error
    }
    await supabase.from('users').update({ pw_changed_at: new Date().toISOString() }).eq('id', user.id)
    logAction(profile, 'Changed password').catch(() => {})
  }

  async function requestPasswordReset(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/reset-password',
    })
    if (error) throw error
  }

  function hasRole(r) {
    if (!profile) return false
    return profile.role === r || (profile.extra_roles || []).includes(r)
  }

  // True once someone has enrolled a second factor but hasn't yet verified
  // it in THIS session - the login form's password check alone leaves them
  // at aal1, and they need to clear the code-entry gate before anything
  // else in the app is safe to show them.
  const mfaChallengePending = !!mfaLevel && mfaLevel.nextLevel === 'aal2' && mfaLevel.currentLevel !== 'aal2'

  return (
    <AuthContext.Provider value={{
      user, profile, loading, login, logout, changePassword, requestPasswordReset, hasRole,
      mfaLevel, refreshMfaLevel, mfaChallengePending,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
