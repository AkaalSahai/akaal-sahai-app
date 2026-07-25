import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function BroadcastBanner() {
  const [message, setMessage] = useState('')
  const [broadcastId, setBroadcastId] = useState('')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('key, value')
      .in('key', ['broadcast_message', 'broadcast_id', 'broadcast_active'])
      .then(({ data }) => {
        if (!data) return
        const s = Object.fromEntries(data.map(r => [r.key, r.value]))
        if (s.broadcast_active !== 'true') return
        if (!s.broadcast_message?.trim()) return
        const dismissed = localStorage.getItem('dismissed_broadcast')
        if (dismissed === s.broadcast_id) return
        setMessage(s.broadcast_message)
        setBroadcastId(s.broadcast_id || '')
        setVisible(true)
      })
  }, [])

  function dismiss() {
    if (broadcastId) localStorage.setItem('dismissed_broadcast', broadcastId)
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
        padding: '14px 16px 14px 18px',
        display: 'flex', gap: 12, alignItems: 'flex-start',
        borderLeft: '4px solid #c9952a',
      }}>
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

        <button onClick={dismiss} style={{
          background: 'rgba(255,255,255,.12)', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,.7)', borderRadius: 6, padding: '4px 8px',
          fontSize: '1rem', lineHeight: 1, flexShrink: 0, marginTop: -2,
          transition: 'background .15s',
        }}>
          ×
        </button>
      </div>
    </div>
  )
}
