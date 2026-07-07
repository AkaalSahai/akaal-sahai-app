import { useState } from 'react'
import { Link } from 'react-router-dom'
import PhoneInput from '../../components/PhoneInput'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export default function TeacherRegistration() {
  const [form, setForm] = useState({
    full_name: '', email: '', preferred_group: '', dbs_number: '', experience: '',
    password: '', confirm_password: '', gdpr_consent: false,
  })
  const [phone, setPhone]       = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [showCpw, setShowCpw]   = useState(false)
  const [errors, setErrors]     = useState({})
  const [busy, setBusy]         = useState(false)
  const [done, setDone]         = useState(false)

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }
  function setCheck(k) { return e => setForm(f => ({ ...f, [k]: e.target.checked })) }

  function validate() {
    const e = {}
    if (!form.full_name) e.full_name = 'Required'
    if (!form.email || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required'
    if (!phone || phone.length !== 10) e.phone = 'Enter a valid 10-digit UK number (after +44)'
    if (!form.password || form.password.length < 8) e.password = 'Minimum 8 characters'
    if (form.password !== form.confirm_password) e.confirm_password = 'Passwords do not match'
    if (!form.gdpr_consent) e.gdpr_consent = 'You must acknowledge this to proceed'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setBusy(true)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/register-teacher`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phone: '+44' + phone,
          preferred_group: form.preferred_group.trim() || null,
          dbs_number: form.dbs_number.trim() || null,
          experience: form.experience.trim() || null,
        }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setDone(true)
    } catch (err) {
      alert('Submission failed: ' + err.message)
    } finally { setBusy(false) }
  }

  if (done) return (
    <div className="public-screen">
      <div className="public-card" style={{ textAlign: 'center' }}>
        <img src="/logo.png" alt="Akaal Sahai" style={{ height: 80, marginBottom: 16 }} />
        <h2 style={{ color: 'var(--success)', fontSize: '1.2rem', fontWeight: 800, marginBottom: 8 }}>Application Submitted!</h2>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: 8 }}>
          Thank you for your application. The admin team will review it shortly.
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: 20 }}>
          You will receive an email once your application has been approved, with details of your assigned group.
        </p>
        <Link to="/login" className="btn btn-primary">Back to Login</Link>
      </div>
    </div>
  )

  return (
    <div className="public-screen">
      <div className="public-card">
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <img src="/logo.png" alt="Akaal Sahai" style={{ height: 80, marginBottom: 10 }} />
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>Teacher Sevadaar Registration</h1>
          <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginTop: 4 }}>
            Enter your details carefully, as they will be required for login and future projects.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label>Full Name *</label>
            <input type="text" value={form.full_name} onChange={set('full_name')} placeholder="e.g. Manveer Singh" />
            {errors.full_name && <div className="field-error">{errors.full_name}</div>}
          </div>

          <div className="form-group">
            <label>Email Address *</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="your@email.com" />
            {errors.email && <div className="field-error">{errors.email}</div>}
          </div>

          <div className="form-group">
            <label>Phone Number *</label>
            <PhoneInput value={phone} onChange={setPhone} />
            {errors.phone && <div className="field-error">{errors.phone}</div>}
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Password *</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')}
                  placeholder="Min. 8 characters" style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem' }}>
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
              {errors.password && <div className="field-error">{errors.password}</div>}
            </div>
            <div className="form-group">
              <label>Confirm Password *</label>
              <div style={{ position: 'relative' }}>
                <input type={showCpw ? 'text' : 'password'} value={form.confirm_password} onChange={set('confirm_password')}
                  placeholder="Repeat password" style={{ paddingRight: 44 }} />
                <button type="button" onClick={() => setShowCpw(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1rem' }}>
                  {showCpw ? '🙈' : '👁'}
                </button>
              </div>
              {errors.confirm_password && <div className="field-error">{errors.confirm_password}</div>}
            </div>
          </div>

          <div className="form-group">
            <label>Punjabi Class Group</label>
            <input type="text" value={form.preferred_group} onChange={set('preferred_group')} placeholder="Name of group you'd like to teach (if known)" />
          </div>

          <div className="form-group">
            <label>DBS Certificate Number</label>
            <input type="text" value={form.dbs_number} onChange={set('dbs_number')} placeholder="e.g. 001234567890" />
          </div>

          <div className="form-group">
            <label>Relevant Experience</label>
            <textarea value={form.experience} onChange={set('experience')} placeholder="Brief description of any teaching or Punjabi language experience…" />
          </div>

          <div className="gdpr-box">
            <label className="gdpr-label">
              <input type="checkbox" checked={form.gdpr_consent} onChange={setCheck('gdpr_consent')} style={{ width: 'auto', marginTop: 2, flexShrink: 0 }} />
              I acknowledge that my name and email address will be stored securely by Akaal Sahai Southall for the purpose of managing Punjabi class sessions and future projects. This data will not be shared with third parties.
            </label>
            {errors.gdpr_consent && <div className="field-error" style={{ marginTop: 6 }}>{errors.gdpr_consent}</div>}
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit Application'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: '.82rem' }}>
            <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Already have an account? Sign In</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
