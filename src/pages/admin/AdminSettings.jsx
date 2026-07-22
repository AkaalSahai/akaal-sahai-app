import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const DEFAULTS = {
  class_schedule:   'Every Friday & Saturday, 6:15PM – 8:30PM',
  phone:            '07471 122007',
  dress_code_girls: 'Girls MUST wear Keski/Dastar',
  dress_code_boys:  'Boys MUST wear Patka/Dastar at ALL times',
  website:          'www.karamishersar.com',
  whatsapp_url:     '',
  facebook_url:     '',
  instagram_url:    '',
  youtube_url:      '',
  donate_url:       'https://karamishersar.com/donate',
}

export default function AdminSettings() {
  const [form, setForm]     = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    supabase.from('site_settings').select('key, value').then(({ data, error }) => {
      if (!error && data?.length) {
        const s = Object.fromEntries(data.map(r => [r.key, r.value]))
        setForm(f => ({ ...f, ...s }))
      }
      setLoading(false)
    })
  }, [])

  function set(k) { return e => { setForm(f => ({ ...f, [k]: e.target.value })); setSaved(false) } }

  async function save() {
    setBusy(true)
    const rows = Object.entries(form).map(([key, value]) => ({ key, value }))
    const { error } = await supabase.from('site_settings').upsert(rows)
    setBusy(false)
    if (error) { alert('Save failed: ' + error.message); return }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div className="empty-state">Loading settings…</div>

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="card">
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>Registration Success Screen</div>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>Shown to parents after they submit a registration</div>
        </div>
        <div>

          <div className="section-label">Class Information</div>

          <div className="form-group">
            <label>Class Schedule</label>
            <input type="text" value={form.class_schedule} onChange={set('class_schedule')}
              placeholder="Every Friday & Saturday, 6:15PM – 8:30PM" />
          </div>

          <div className="form-group">
            <label>Phone Number</label>
            <input type="text" value={form.phone} onChange={set('phone')}
              placeholder="07471 122007" />
          </div>

          <div className="form-group">
            <label>Girls Dress Code</label>
            <input type="text" value={form.dress_code_girls} onChange={set('dress_code_girls')}
              placeholder="Girls MUST wear Keski/Dastar" />
          </div>

          <div className="form-group">
            <label>Boys Dress Code</label>
            <input type="text" value={form.dress_code_boys} onChange={set('dress_code_boys')}
              placeholder="Boys MUST wear Patka/Dastar at ALL times" />
          </div>

          <div className="form-group">
            <label>Website</label>
            <input type="text" value={form.website} onChange={set('website')}
              placeholder="www.karamishersar.com" />
          </div>

          <div className="section-label" style={{ marginTop: 8 }}>Links &amp; Social Media</div>

          <div className="form-group">
            <label>Donate URL</label>
            <input type="url" value={form.donate_url} onChange={set('donate_url')}
              placeholder="https://karamishersar.com/donate" />
          </div>

          <div className="form-group">
            <label>WhatsApp Group Link</label>
            <input type="url" value={form.whatsapp_url} onChange={set('whatsapp_url')}
              placeholder="https://chat.whatsapp.com/…" />
            <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginTop: 4 }}>Leave blank to hide the WhatsApp button</div>
          </div>

          <div className="form-group">
            <label>Facebook URL</label>
            <input type="url" value={form.facebook_url} onChange={set('facebook_url')}
              placeholder="https://facebook.com/yourpage" />
          </div>

          <div className="form-group">
            <label>Instagram URL</label>
            <input type="url" value={form.instagram_url} onChange={set('instagram_url')}
              placeholder="https://instagram.com/yourhandle" />
          </div>

          <div className="form-group">
            <label>YouTube URL</label>
            <input type="url" value={form.youtube_url} onChange={set('youtube_url')}
              placeholder="https://youtube.com/@yourchannel" />
          </div>

          <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginBottom: 16 }}>
            Leave any social field blank to hide that button from parents.
          </div>

          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
