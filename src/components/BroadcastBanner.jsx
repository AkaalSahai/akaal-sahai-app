import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function BroadcastBanner() {
  const { profile } = useAuth()
  const [message, setMessage] = useState('')
  const [broadcastId, setBroadcastId] = useState('')
  const [visible, setVisible] = useState(false)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['broadcast_message', 'broadcast_id', 'broadcast_active'])
      .then(async ({ data }) => {
        if (!data) return
        const s = Object.fromEntries(data.map(r => [r.key, r.value]))
        if (s.broadcast_active !== 'true') return
        if (!s.broadcast_message?.trim()) return
        if (!s.broadcast_id) return

        // Has this user already acknowledged this exact broadcast? Checked
        // server-side so it's consistent across every device/browser they
        // use, not just the one they dismissed it on.
        const { data: ack } = await supabase
          .from('broadcast_acknowledgments')
          .select('id')
          .eq('broadcast_id', s.broadcast_id)
          .eq('acknowledged_by', profile.id)
          .maybeSingle()
        if (ack) return

        setMessage(s.broadcast_message)
        setBroadcastId(s.broadcast_id)
        setVisible(true)
      })
  }, [profile?.id])

  async function acknowledge() {
    if (!checked || busy) return
    setBusy(true)
    const { error } = await supabase.from('broadcast_acknowledgments').upsert({
      broadcast_id: broadcastId,
      acknowledged_by: profile.id,
      acknowledged_by_name: profile.name || 'Unknown',
    }, { onConflict: 'broadcast_id,acknowledged_by' })
    setBusy(false)
    if (error) {
      alert('Could not record your acknowledgment: ' + error.message)
      return
    }
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, width: 'calc(100% - 32px)', maxWidth: 480,
    }}>
      <div style={{
        background: '#1e1a6e', color: 'white', borderRadius: 14,
        boxShadow: '0 8px 32px rgba(30,26,110,.35)',
        padding: '14px 16px 16px 18px',
        display: 'flex', flexDirection: 'column', gap: 10,
        borderLeft: '4px solid #c9952a',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Megaphone icon */}
          <svg style={{ flexShrink: 0, marginTop: 2, opacity: .85 }}
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="#c9952a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11l19-9-9 19-2-8-8-2z"/>
          </svg>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.07em', color: '#c9952a', marginBottom: 4 }}>
              Message from Admin
            </div>
            <div style={{ fontSize: '.88rem', lineHeight: 1.5, color: 'rgba(255,255,255,.92)' }}>
              {message}
            </div>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem',
          color: 'rgba(255,255,255,.85)', cursor: 'pointer', paddingLeft: 30 }}>
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)}
            style={{ width: 'auto' }} />
          I acknowledge I've read this message
        </label>

        <div style={{ paddingLeft: 30 }}>
          <button onClick={acknowledge} disabled={!checked || busy} style={{
            background: checked ? '#c9952a' : 'rgba(255,255,255,.15)',
            color: checked ? '#1e1a6e' : 'rgba(255,255,255,.5)',
            border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '.82rem',
            padding: '8px 18px', cursor: checked && !busy ? 'pointer' : 'not-allowed',
            transition: 'background .15s, color .15s',
          }}>
            {busy ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}
