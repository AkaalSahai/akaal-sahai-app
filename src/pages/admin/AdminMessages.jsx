import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminMessages({ onRead }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: false })
    setMessages(data || [])
    setLoading(false)
  }

  async function toggleExpand(msg) {
    if (expanded === msg.id) { setExpanded(null); return }
    setExpanded(msg.id)
    if (!msg.read_at) {
      const now = new Date().toISOString()
      await supabase.from('messages').update({ read_at: now }).eq('id', msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read_at: now } : m))
      if (onRead) onRead()
    }
  }

  const unread = messages.filter(m => !m.read_at).length

  if (loading) return <div className="spinner" />

  return (
    <div className="card">
      <div className="card-title">
        Messages
        {unread > 0 && (
          <span style={{ background: 'var(--primary)', color: 'white', borderRadius: 99,
            fontSize: '.72rem', fontWeight: 700, padding: '2px 9px', marginLeft: 4 }}>
            {unread} new
          </span>
        )}
        <button className="btn btn-outline btn-sm" onClick={load}>Refresh</button>
      </div>

      {messages.length === 0 ? (
        <div className="empty-state">
          <div className="icon">✉️</div>
          No messages yet
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {messages.map(msg => {
            const isUnread  = !msg.read_at
            const isOpen    = expanded === msg.id
            const sent      = new Date(msg.created_at)
            return (
              <li key={msg.id} style={{
                borderBottom: '1px solid var(--border)',
                background: isUnread ? '#f0f9ff' : 'transparent',
                cursor: 'pointer',
              }} onClick={() => toggleExpand(msg)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 4px' }}>
                  {/* Unread dot */}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                    background: isUnread ? 'var(--primary)' : 'transparent' }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: isUnread ? 700 : 600, fontSize: '.9rem' }}>
                        {msg.subject}
                      </span>
                      <span style={{ fontSize: '.75rem', color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {sent.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {', '}
                        {sent.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 2 }}>
                      From: <strong>{msg.from_name}</strong>
                      {!isUnread && <span style={{ marginLeft: 8, fontSize: '.72rem', color: '#94a3b8' }}>· Read</span>}
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 12, padding: '12px 14px', background: 'white',
                        borderRadius: 8, border: '1px solid var(--border)', fontSize: '.87rem',
                        lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                        {msg.body}
                      </div>
                    )}
                  </div>

                  <div style={{ color: 'var(--muted)', fontSize: '.8rem', flexShrink: 0, paddingTop: 2 }}>
                    {isOpen ? '▲' : '▼'}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
