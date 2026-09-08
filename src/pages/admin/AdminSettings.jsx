import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'

const DEFAULTS = {
  class_schedule:    'Every Friday & Saturday, 6:15PM – 8:30PM',
  phone:             '07471 122007',
  dress_code_girls:  'Girls MUST wear Keski/Dastar',
  dress_code_boys:   'Boys MUST wear Patka/Dastar at ALL times',
  website:           'www.karamishersar.com',
  whatsapp_url:      '',
  facebook_url:      '',
  instagram_url:     '',
  youtube_url:       '',
  donate_url:        'https://karamishersar.com/donate',
  broadcast_message: '',
  broadcast_active:  'false',
  broadcast_id:      '',
}

export default function AdminSettings() {
  const { profile } = useAuth()
  const [form, setForm]     = useState(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState(false)
  const [saved, setSaved]   = useState(false)
  const [ackReport, setAckReport] = useState(null)   // null = not loaded yet
  const [ackLoading, setAckLoading] = useState(false)
  const [ackError, setAckError] = useState(null)
  // Last-saved message/active values, so we only mint a fresh broadcast_id
  // (which resets everyone's read-report) when the broadcast itself actually
  // changes — not on every unrelated settings save.
  const [savedBroadcast, setSavedBroadcast] = useState({ message: '', active: 'false' })

  useEffect(() => {
    supabase.from('site_settings').select('key, value').then(({ data, error }) => {
      if (!error && data?.length) {
        const s = Object.fromEntries(data.map(r => [r.key, r.value]))
        setForm(f => ({ ...f, ...s }))
        setSavedBroadcast({ message: s.broadcast_message || '', active: s.broadcast_active || 'false' })
        if (s.broadcast_id) loadAckReport(s.broadcast_id)
      }
      setLoading(false)
    })
  }, [])

  async function loadAckReport(broadcastId) {
    if (!broadcastId) return
    setAckLoading(true)
    setAckError(null)
    try {
      const [{ data: teachers, error: tErr }, { data: acks, error: aErr }] = await Promise.all([
        supabase.from('users').select('id, name').eq('role', 'teacher').order('name'),
        supabase.from('broadcast_acknowledgments').select('acknowledged_by, acknowledged_at').eq('broadcast_id', broadcastId),
      ])
      if (tErr) throw tErr
      if (aErr) throw aErr
      const ackMap = Object.fromEntries((acks || []).map(a => [a.acknowledged_by, a.acknowledged_at]))
      const rows = (teachers || []).map(t => ({ ...t, acknowledgedAt: ackMap[t.id] || null }))
        .sort((a, b) => {
          if (!!a.acknowledgedAt === !!b.acknowledgedAt) return a.name.localeCompare(b.name)
          return a.acknowledgedAt ? 1 : -1  // not-yet-acknowledged first
        })
      setAckReport(rows)
    } catch (err) {
      setAckError(err.message?.includes('broadcast_acknowledgments')
        ? 'Run the add-broadcast-acknowledgments.sql migration to enable this report.'
        : 'Could not load report: ' + err.message)
    } finally {
      setAckLoading(false)
    }
  }

  function set(k) { return e => { setForm(f => ({ ...f, [k]: e.target.value })); setSaved(false) } }

  async function save() {
    // kept for compatibility — broadcast save uses inline handler with new broadcast_id
    setBusy(true)
    const rows = Object.entries(form).map(([key, value]) => ({ key, value }))
    const { error } = await supabase.from('site_settings').upsert(rows)
    setBusy(false)
    if (error) { logAction(profile, 'Updated site settings', error.message, false).catch(() => {}); alert('Save failed: ' + error.message); return }
    logAction(profile, 'Updated site settings').catch(() => {})
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

          <div className="section-label" style={{ marginTop: 8 }}>Teacher Broadcast Message</div>

          <div className="form-group">
            <label>Message</label>
            <textarea value={form.broadcast_message} onChange={set('broadcast_message')}
              placeholder="e.g. Classes cancelled this Friday — no register needed."
              style={{ minHeight: 80 }} />
            <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginTop: 4 }}>
              This appears as a floating pop-up for all teachers when they log in. Leave blank to show nothing.
            </div>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 400, cursor: 'pointer' }}>
              <input type="checkbox"
                checked={form.broadcast_active === 'true'}
                onChange={e => { setForm(f => ({ ...f, broadcast_active: e.target.checked ? 'true' : 'false' })); setSaved(false) }}
                style={{ width: 'auto' }} />
              Show this message to all teachers now
            </label>
          </div>

          <button className="btn btn-primary" onClick={async () => {
            // Only mint a fresh broadcast_id — which resets every teacher's
            // read-report back to "not yet acknowledged" — when the message
            // text or active flag actually changed. An unrelated settings
            // save (e.g. fixing the phone number) shouldn't re-trigger it.
            const broadcastChanged = form.broadcast_message !== savedBroadcast.message
              || form.broadcast_active !== savedBroadcast.active
            const newId = broadcastChanged ? String(Date.now()) : form.broadcast_id
            setForm(f => ({ ...f, broadcast_id: newId }))
            setBusy(true)
            const rows = Object.entries({ ...form, broadcast_id: newId }).map(([key, value]) => ({ key, value }))
            const { error } = await supabase.from('site_settings').upsert(rows)
            setBusy(false)
            if (error) { logAction(profile, 'Updated site settings', error.message, false).catch(() => {}); alert('Save failed: ' + error.message); return }
            logAction(profile, 'Updated site settings', form.broadcast_active === 'true' ? 'Broadcast message updated (active)' : 'Broadcast message updated').catch(() => {})
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
            setSavedBroadcast({ message: form.broadcast_message, active: form.broadcast_active })
            loadAckReport(newId)
          }} disabled={busy}>
            {busy ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
          </button>

          {form.broadcast_id && (
            <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--primary)' }}>
                  Read Report — Current Message
                </div>
                <button className="btn btn-outline btn-sm" disabled={ackLoading}
                  onClick={() => loadAckReport(form.broadcast_id)}>
                  {ackLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {ackError && (
                <div style={{ fontSize: '.8rem', color: 'var(--danger)', marginBottom: 8 }}>⚠ {ackError}</div>
              )}

              {!ackError && ackReport && (() => {
                const total = ackReport.length
                const done  = ackReport.filter(r => r.acknowledgedAt).length
                return (
                  <>
                    <div style={{ fontSize: '.82rem', color: 'var(--muted)', marginBottom: 10 }}>
                      <strong style={{ color: done === total && total > 0 ? '#16a34a' : 'var(--text)' }}>
                        {done} of {total}
                      </strong> teachers have acknowledged this message
                    </div>
                    <div style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                      {ackReport.length === 0 ? (
                        <div style={{ padding: 16, fontSize: '.82rem', color: 'var(--muted)', textAlign: 'center' }}>
                          No teacher accounts found.
                        </div>
                      ) : ackReport.map(r => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '9px 14px', borderBottom: '1px solid #f1f5f9', fontSize: '.84rem' }}>
                          <span style={{ fontWeight: 600 }}>{r.name}</span>
                          {r.acknowledgedAt ? (
                            <span style={{ color: '#16a34a', fontWeight: 600, fontSize: '.78rem' }}>
                              ✓ {new Date(r.acknowledgedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span style={{ color: '#d97706', fontWeight: 600, fontSize: '.78rem' }}>Not yet</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
