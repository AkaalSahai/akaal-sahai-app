import { useState } from 'react'
import { Link } from 'react-router-dom'
import PhoneInput from '../../components/PhoneInput'
import { supabase } from '../../lib/supabase'

const RELATIONSHIPS = ['', 'Mother', 'Father', 'Guardian']

export default function StudentRegistration() {
  const [form, setForm] = useState({
    first_name: '', middle_name: '', last_name: '', date_of_birth: '',
    house_no: '', street_name: '', town: '', postcode: '',
    parent_name: '', relationship: '', email: '',
    medical_notes: '', photo_consent: false, gdpr_consent: false,
  })
  const [phone, setPhone]       = useState('')
  const [secPhone, setSecPhone] = useState('')
  const [errors, setErrors]     = useState({})
  const [busy, setBusy]         = useState(false)
  const [done, setDone]         = useState(false)

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }
  function setCheck(k) { return e => setForm(f => ({ ...f, [k]: e.target.checked })) }

  function validate() {
    const e = {}
    if (!form.first_name)   e.first_name = 'Required'
    if (!form.last_name)    e.last_name = 'Required'
    if (!form.date_of_birth) e.date_of_birth = 'Required'
    else {
      const age = (new Date() - new Date(form.date_of_birth)) / (1000 * 60 * 60 * 24 * 365.25)
      if (age < 5) e.date_of_birth = 'Student must be at least 5 years old'
    }
    if (!form.house_no)    e.house_no = 'Required'
    if (!form.street_name) e.street_name = 'Required'
    if (!form.town)        e.town = 'Required'
    if (!form.postcode)    e.postcode = 'Required'
    if (!form.parent_name)  e.parent_name = 'Required'
    if (!form.relationship) e.relationship = 'Required'
    if (!phone || phone.length !== 10) e.phone = 'Enter a valid 10-digit UK number (after +44)'
    if (secPhone && secPhone.length !== 10) e.sec_phone = 'Enter a valid 10-digit UK number (after +44)'
    if (!form.gdpr_consent) e.gdpr_consent = 'You must acknowledge this to proceed'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setBusy(true)
    try {
      const { error } = await supabase.from('parent_applications').insert({
        ...form,
        phone: '+44' + phone,
        secondary_phone: secPhone ? '+44' + secPhone : null,
        status: 'pending',
      })
      if (error) throw error
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
        <p style={{ color: 'var(--muted)', fontSize: '.9rem', marginBottom: 20 }}>
          Thank you. The registrar will review your application and contact you shortly.
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
          <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>Student Registration</h1>
          <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginTop: 4 }}>
            Complete this form to register your child. Please ensure all details are correct.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="section-label">Student Details</div>
          <div className="form-grid">
            <div className="form-group">
              <label>First Name *</label>
              <input type="text" value={form.first_name} onChange={set('first_name')} />
              {errors.first_name && <div className="field-error">{errors.first_name}</div>}
            </div>
            <div className="form-group">
              <label>Middle Name</label>
              <input type="text" value={form.middle_name} onChange={set('middle_name')} />
            </div>
            <div className="form-group">
              <label>Last Name *</label>
              <input type="text" value={form.last_name} onChange={set('last_name')} />
              {errors.last_name && <div className="field-error">{errors.last_name}</div>}
            </div>
            <div className="form-group">
              <label>Date of Birth *</label>
              <input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
              {errors.date_of_birth && <div className="field-error">{errors.date_of_birth}</div>}
            </div>
          </div>

          <div className="section-label">Address</div>
          <div className="form-grid">
            <div className="form-group">
              <label>House No *</label>
              <input type="text" value={form.house_no} onChange={set('house_no')} />
              {errors.house_no && <div className="field-error">{errors.house_no}</div>}
            </div>
            <div className="form-group">
              <label>Street Name *</label>
              <input type="text" value={form.street_name} onChange={set('street_name')} />
              {errors.street_name && <div className="field-error">{errors.street_name}</div>}
            </div>
            <div className="form-group">
              <label>Town *</label>
              <input type="text" value={form.town} onChange={set('town')} />
              {errors.town && <div className="field-error">{errors.town}</div>}
            </div>
            <div className="form-group">
              <label>Postcode *</label>
              <input type="text" value={form.postcode} onChange={set('postcode')} style={{ textTransform: 'uppercase' }} />
              {errors.postcode && <div className="field-error">{errors.postcode}</div>}
            </div>
          </div>

          <div className="section-label">Parent / Guardian Details</div>
          <div className="form-grid">
            <div className="form-group">
              <label>Parent/Guardian Name *</label>
              <input type="text" value={form.parent_name} onChange={set('parent_name')} />
              {errors.parent_name && <div className="field-error">{errors.parent_name}</div>}
            </div>
            <div className="form-group">
              <label>Relationship *</label>
              <select value={form.relationship} onChange={set('relationship')}>
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {errors.relationship && <div className="field-error">{errors.relationship}</div>}
            </div>
            <div className="form-group">
              <label>Phone Number *</label>
              <PhoneInput value={phone} onChange={setPhone} />
              {errors.phone && <div className="field-error">{errors.phone}</div>}
            </div>
            <div className="form-group">
              <label>Secondary Contact Number <span style={{ fontWeight: 400, fontSize: '.75rem', color: 'var(--muted)' }}>(optional)</span></label>
              <PhoneInput value={secPhone} onChange={setSecPhone} />
              {errors.sec_phone && <div className="field-error">{errors.sec_phone}</div>}
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Email Address</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="optional" />
            </div>
          </div>

          <div className="form-group">
            <label>Medical Notes / Allergies</label>
            <textarea value={form.medical_notes} onChange={set('medical_notes')} placeholder="Leave blank if none" />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 400, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.photo_consent} onChange={setCheck('photo_consent')} style={{ width: 'auto' }} />
              I give consent for photos/videos of my child to be used for Akaal Sahai Southall purposes.
            </label>
          </div>

          <div className="gdpr-box">
            <label className="gdpr-label">
              <input type="checkbox" checked={form.gdpr_consent} onChange={setCheck('gdpr_consent')} style={{ width: 'auto', marginTop: 2, flexShrink: 0 }} />
              I acknowledge that the details I have provided (including my child's name, date of birth, address, and contact information) will be stored securely by Akaal Sahai Southall for the purpose of managing Punjabi class attendance and communication. This data will not be shared with third parties.
            </label>
            {errors.gdpr_consent && <div className="field-error" style={{ marginTop: 6 }}>{errors.gdpr_consent}</div>}
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Submitting…' : 'Submit Application'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 14, fontSize: '.82rem' }}>
            <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Back to Login</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
