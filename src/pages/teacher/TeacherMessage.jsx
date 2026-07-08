import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function TeacherMessage() {
  const { profile }       = useAuth()
  const [subject, setSubject] = useState('')
  const [body, setBody]       = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState(null)

  async function send(e) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return
    setSending(true)
    setError(null)
    try {
      const { error: err } = await supabase.from('messages').insert({
        from_user_id: profile.id,
        from_name:    profile.name || 'Unknown',
        subject:      subject.trim(),
        body:         body.trim(),
      })
      if (err) throw err
      setSent(true)
      setSubject('')
      setBody('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card">
      <div className="card-title">Message Admin</div>

      <p style={{ fontSize: '.87rem', color: 'var(--muted)', marginBottom: 20 }}>
        Send a message to the admin team — for queries, student concerns, absences, or anything else.
        Messages are one-way; someone will follow up with you directly if needed.
      </p>

      {sent && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          Message sent — the admin team will be in touch if needed.
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 12 }}
            onClick={() => setSent(false)}>
            Send another
          </button>
        </div>
      )}

      {!sent && (
        <form onSubmit={send}>
          {error && (
            <div className="alert" style={{ background: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', marginBottom: 16 }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Unable to take register this Friday"
              maxLength={120}
              required
            />
          </div>

          <div className="form-group">
            <label>Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your message here…"
              rows={5}
              maxLength={2000}
              required
              style={{ resize: 'vertical' }}
            />
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 2, textAlign: 'right' }}>
              {body.length} / 2000
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="submit" className="btn btn-primary" disabled={sending || !subject.trim() || !body.trim()}>
              {sending ? 'Sending…' : 'Send Message'}
            </button>
            <span style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
              From: {profile?.name || 'You'}
            </span>
          </div>
        </form>
      )}
    </div>
  )
}
