import { useState } from 'react'

export default function MedicalBadge({ notes, studentName }) {
  const [open, setOpen] = useState(false)
  if (!notes?.trim()) return null

  return (
    <>
      <button
        onClick={e => { e.stopPropagation(); setOpen(true) }}
        title="Medical notes — click to view"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          background: '#fef3c7', border: '1.5px solid #f59e0b',
          color: '#92400e', borderRadius: 6, padding: '2px 7px',
          fontSize: '.7rem', fontWeight: 700, cursor: 'pointer',
          lineHeight: 1.4, whiteSpace: 'nowrap', flexShrink: 0,
        }}>
        ⚕ Medical
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, padding: 28,
              maxWidth: 420, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              border: '2px solid #f59e0b',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{
                background: '#fef3c7', border: '2px solid #f59e0b',
                borderRadius: 8, width: 36, height: 36,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', flexShrink: 0,
              }}>⚕</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#1a1a2e' }}>Medical Notes</div>
                {studentName && (
                  <div style={{ fontSize: '.78rem', color: '#64748b' }}>{studentName}</div>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  fontSize: '1.2rem', cursor: 'pointer', color: '#94a3b8', lineHeight: 1,
                }}>✕</button>
            </div>
            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: 8, padding: '12px 14px',
              fontSize: '.875rem', lineHeight: 1.6, color: '#78350f',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {notes}
            </div>
            <div style={{ fontSize: '.72rem', color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>
              Tap outside or ✕ to close
            </div>
          </div>
        </div>
      )}
    </>
  )
}
