import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import PhoneInput from '../../components/PhoneInput'
import { supabase } from '../../lib/supabase'

/* ── inline styles ── */
const S = {
  card:        { background: 'white', borderRadius: 16, boxShadow: '0 2px 20px rgba(30,26,110,.14)', overflow: 'hidden', width: '100%', maxWidth: 420, margin: '0 auto' },
  header:      { background: '#1e1a6e', padding: '12px 24px 24px', textAlign: 'center' },
  logo:        { width: 96, height: 96, objectFit: 'contain', display: 'block', margin: '0 auto 12px' },
  title:       { fontSize: '1.1rem', fontWeight: 800, color: 'white', marginBottom: 4 },
  sub:         { fontSize: '.82rem', color: 'rgba(255,255,255,.7)' },
  body:        { padding: 20, display: 'flex', flexDirection: 'column', gap: 16 },
  infoBox:     { borderLeft: '3px solid #c9952a', background: '#fdf6e8', borderRadius: '0 10px 10px 0', padding: '14px 16px' },
  infoLabel:   { fontSize: '.67rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#c9952a', marginBottom: 8 },
  infoRow:     { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', borderBottom: '1px solid rgba(201,149,42,.15)', fontSize: '.82rem', color: '#1a1624', lineHeight: 1.45 },
  infoRowLast: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '5px 0', fontSize: '.82rem', color: '#1a1624', lineHeight: 1.45 },
  infoIcon:    { fontSize: '.95rem', flexShrink: 0, marginTop: 1 },
  infoStrong:  { fontWeight: 700, display: 'block', fontSize: '.78rem', color: '#7a5a10' },
  saveImgBtn:  { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', padding: '10px 16px', background: '#ebebf8', color: '#1e1a6e', border: '1.5px solid #e2e0ef', borderRadius: 10, fontSize: '.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  divider:     { height: 1, background: '#e2e0ef' },
  donateBtn:   { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fdf6e8', color: '#c9952a', border: '1.5px solid rgba(201,149,42,.35)', borderRadius: 8, padding: '9px 18px', fontSize: '.78rem', fontWeight: 700, textDecoration: 'none' },
  waBtn:       { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#25D366', color: 'white', border: 'none', borderRadius: 12, padding: '14px 20px', fontSize: '.92rem', fontWeight: 700, cursor: 'pointer', width: '100%', textDecoration: 'none', textAlign: 'center' },
  saveContact: { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ebebf8', color: '#1e1a6e', border: '1.5px solid rgba(30,26,110,.2)', borderRadius: 6, padding: '3px 9px', fontSize: '.7rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' },
  followLabel: { fontSize: '.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#6b6888', textAlign: 'center', marginBottom: 10 },
  socialRow:   { display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' },
  backLink:    { textAlign: 'center', fontSize: '.78rem', color: '#6b6888', paddingTop: 4 },
}

function InfoRow({ icon, label, children, last }) {
  return (
    <div style={last ? S.infoRowLast : S.infoRow}>
      <span style={S.infoIcon}>{icon}</span>
      <div><strong style={S.infoStrong}>{label}</strong>{children}</div>
    </div>
  )
}

function SocialBtn({ href, color, label, path }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
        fontSize: '.78rem', fontWeight: 700, textDecoration: 'none',
        background: color + '1e', color, border: `1.5px solid ${color}40` }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d={path}/></svg>
      {label}
    </a>
  )
}

const FB_PATH = 'M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.532-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z'
const IG_PATH = 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z'
const YT_PATH = 'M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z'

function SuccessScreen({ settings: s }) {
  function saveContact() {
    const phone = (s.phone || '07471122007').replace(/\s/g, '').replace(/^0/, '')
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Akaal Sahai Punjabi Classes',
      'N:Classes;Punjabi;;;',
      'ORG:Akaal Sahai Southall',
      `TEL;TYPE=CELL:+44${phone}`,
      `URL:https://${(s.website || 'www.karamishersar.com').replace(/^https?:\/\//, '')}`,
      'NOTE:Punjabi Classes',
      'END:VCARD',
    ].join('\r\n')

    // iOS Safari: navigate to a data URI — the browser hands it to Contacts app directly
    const dataUri = 'data:text/x-vcard;charset=utf-8,' + encodeURIComponent(vcard)
    window.location.href = dataUri
  }

  function saveInfoCard() {
    const W = 640, H = 430
    const canvas = document.createElement('canvas')
    canvas.width = W * 2; canvas.height = H * 2
    const ctx = canvas.getContext('2d')
    ctx.scale(2, 2)

    function rr(x, y, w, h, r) {
      ctx.beginPath()
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
      ctx.quadraticCurveTo(x + w, y, x + w, y + r)
      ctx.lineTo(x + w, y + h - r)
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
      ctx.lineTo(x + r, y + h)
      ctx.quadraticCurveTo(x, y + h, x, y + h - r)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.closePath()
    }

    function draw(logo) {
      rr(0, 0, W, H, 16); ctx.fillStyle = '#ffffff'; ctx.fill()
      rr(0, 0, W, 140, 16); ctx.fillStyle = '#1e1a6e'; ctx.fill()
      ctx.fillRect(0, 124, W, 16)
      if (logo) ctx.drawImage(logo, W / 2 - 40, 10, 80, 80)
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 16px -apple-system, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('Akaal Sahai Punjabi Classes', W / 2, 112)
      ctx.fillStyle = '#c9952a'; ctx.fillRect(32, 152, 4, 170)
      const rows = [
        ['📅 Class Days & Times', s.class_schedule || 'Every Friday & Saturday, 6:15PM – 8:30PM'],
        ['📞 Enquiries',          s.phone || '07471 122007'],
        ['👳 Girls',              s.dress_code_girls || 'Girls MUST wear Keski/Dastar'],
        ['   Boys',               s.dress_code_boys  || 'Boys MUST wear Patka/Dastar at ALL times'],
        ['🌐 Website',            s.website || 'www.karamishersar.com'],
      ]
      let y = 170
      rows.forEach(([lbl, val]) => {
        ctx.textAlign = 'left'
        ctx.font = 'bold 11px -apple-system, sans-serif'; ctx.fillStyle = '#7a5a10'
        ctx.fillText(lbl, 46, y)
        ctx.font = '12px -apple-system, sans-serif'; ctx.fillStyle = '#1a1624'
        ctx.fillText(val, 46, y + 15)
        y += 40
      })
      ctx.fillStyle = '#9ca3af'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(s.website || 'karamishersar.com', W / 2, H - 12)
      canvas.toBlob(blob => {
        if (!blob) return
        const file = new File([blob], 'Akaal-Sahai-Class-Info.png', { type: 'image/png' })
        // Web Share with file → native share sheet → Save to Photos on iOS/Android
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'Akaal Sahai Class Info' }).catch(() => {})
          return
        }
        // Fallback: open image in new tab — user can long-press → Save Image on iOS
        const url = URL.createObjectURL(blob)
        const opened = window.open(url, '_blank')
        if (!opened) {
          // If popup blocked, trigger download
          const a = document.createElement('a')
          a.href = url; a.download = 'Akaal-Sahai-Class-Info.png'
          document.body.appendChild(a); a.click(); document.body.removeChild(a)
        }
        setTimeout(() => URL.revokeObjectURL(url), 10000)
      }, 'image/png')
    }

    // crossOrigin needed to avoid canvas taint on some browsers
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => draw(img)
    img.onerror = () => draw(null)
    img.src = '/logo.png?v=1'
  }

  const wa      = s.whatsapp_url  || ''
  const fb      = s.facebook_url  || ''
  const ig      = s.instagram_url || ''
  const yt      = s.youtube_url   || ''
  const donate  = s.donate_url    || 'https://karamishersar.com/donate'
  const hasSocial = fb || ig || yt

  return (
    <div className="public-screen">
      <div style={S.card}>
        <div style={S.header}>
          <img src="/logo.png" alt="Akaal Sahai" style={S.logo} />
          <div style={S.title}>Application Submitted!</div>
          <div style={S.sub}>Thank you</div>
        </div>

        <div style={S.body}>
          <div style={S.infoBox}>
            <div style={S.infoLabel}>Akaal Sahai Punjabi Class Details</div>
            <InfoRow icon="📅" label="Class Days &amp; Times">
              {s.class_schedule || 'Every Friday & Saturday, 6:15PM – 8:30PM'}
            </InfoRow>
            <InfoRow icon="📞" label="Enquiries">
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                <a href={`tel:${(s.phone || '07471122007').replace(/\s/g, '')}`}
                   style={{ color: '#1e1a6e', fontWeight: 700, textDecoration: 'none' }}>
                  {s.phone || '07471 122007'}
                </a>
                <button onClick={saveContact} style={S.saveContact}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                  </svg>
                  Save Contact
                </button>
              </span>
            </InfoRow>
            <InfoRow icon="👳" label="Dress Code">
              {s.dress_code_girls || 'Girls MUST wear Keski/Dastar'}<br />
              {s.dress_code_boys  || 'Boys MUST wear Patka/Dastar at ALL times'}
            </InfoRow>
            <InfoRow icon="🌐" label="Website" last>
              {s.website || 'www.karamishersar.com'}
            </InfoRow>
          </div>

          <button onClick={saveInfoCard} style={S.saveImgBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
            Save Class Info as Image
          </button>

          <div style={S.divider} />

          <div style={{ textAlign: 'center' }}>
            <a href={donate} target="_blank" rel="noreferrer" style={S.donateBtn}>
              🤲 Daswandh / Donate
            </a>
          </div>

          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" style={S.waBtn}>
              <svg style={{ width: 22, height: 22, flexShrink: 0 }} viewBox="0 0 24 24" fill="white">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.124 1.532 5.857L.054 23.903a.5.5 0 00.609.61l6.162-1.492A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.807 9.807 0 01-5.031-1.382l-.36-.214-3.733.904.937-3.629-.235-.373A9.818 9.818 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
              </svg>
              Click to join Punjabi Class WhatsApp Group
            </a>
          )}

          {hasSocial && (
            <div>
              <div style={S.followLabel}>Follow Us</div>
              <div style={S.socialRow}>
                {fb && <SocialBtn href={fb} color="#1877f2" label="Facebook"  path={FB_PATH} />}
                {ig && <SocialBtn href={ig} color="#e1306c" label="Instagram" path={IG_PATH} />}
                {yt && <SocialBtn href={yt} color="#ff0000" label="YouTube"   path={YT_PATH} />}
              </div>
            </div>
          )}

          <div style={S.backLink}>
            <Link to="/" style={{ color: '#1e1a6e', fontWeight: 600, textDecoration: 'none' }}>Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

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
  const [settings, setSettings] = useState(null)

  useEffect(() => {
    if (!done) return
    supabase.from('site_settings').select('key, value').then(({ data }) => {
      setSettings(Object.fromEntries((data || []).map(r => [r.key, r.value])))
    })
  }, [done])

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

  if (done) {
    if (!settings) return (
      <div className="public-screen">
        <div className="public-card" style={{ textAlign: 'center', color: 'var(--muted)' }}>Loading…</div>
      </div>
    )
    return <SuccessScreen settings={settings} />
  }

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
