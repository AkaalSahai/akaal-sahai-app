import { useState } from 'react'

export default function ConfirmDialog({
  message,
  confirmText = 'Confirm',
  danger = false,
  needsReason = false,
  reasonLabel = 'Reason (required):',
  onConfirm,
  onCancel,
}) {
  const [reason, setReason]       = useState('')
  const [showError, setShowError] = useState(false)

  function handleConfirm() {
    if (needsReason && !reason.trim()) { setShowError(true); return }
    onConfirm(needsReason ? reason.trim() : undefined)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9000, padding: 20 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={{ background: 'white', borderRadius: 12,
        boxShadow: '0 24px 64px rgba(0,0,0,.22)',
        width: '100%', maxWidth: 400, padding: 24 }}>
        <div style={{ fontSize: '.95rem', fontWeight: 600, color: '#1a2332',
          lineHeight: 1.55, marginBottom: needsReason ? 18 : 24 }}>
          {message}
        </div>

        {needsReason && (
          <div style={{ marginBottom: 22 }}>
            <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 700,
              color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em',
              marginBottom: 6 }}>
              {reasonLabel}
            </label>
            <textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setShowError(false) }}
              rows={3}
              autoFocus
              placeholder="Enter reason…"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, resize: 'vertical',
                border: `1.5px solid ${showError ? '#dc2626' : '#d1d5db'}`,
                fontSize: '.85rem', fontFamily: 'inherit', lineHeight: 1.5,
                outline: 'none', boxSizing: 'border-box' }}
            />
            {showError && (
              <div style={{ color: '#dc2626', fontSize: '.75rem', marginTop: 4, fontWeight: 600 }}>
                A reason is required for the GDPR record.
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #d1d5db',
              background: 'white', fontWeight: 600, fontSize: '.85rem',
              cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>
            Cancel
          </button>
          <button onClick={handleConfirm}
            style={{ padding: '9px 20px', borderRadius: 8, border: 'none',
              background: danger ? '#dc2626' : 'var(--primary, #1e1a6e)',
              color: 'white', fontWeight: 700, fontSize: '.85rem',
              cursor: 'pointer', fontFamily: 'inherit' }}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
