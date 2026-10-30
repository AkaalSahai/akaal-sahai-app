// Data-quality flags for a student (rules in lib/studentChecks.js).
// Red = must be fixed, amber = please check or complete.

const STYLE = {
  error:   { color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca' },
  warning: { color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a' },
}

// Missing email is on most older records, so it's left off the row badge
// (it still shows in the details list and the filter) to keep the badge meaningful.
const BADGE_IGNORES = new Set(['email_missing'])

export function IssueBadge({ issues }) {
  const shown = issues.filter(i => !BADGE_IGNORES.has(i.key))
  if (!shown.length) return null
  const level = shown.some(i => i.level === 'error') ? 'error' : 'warning'
  return (
    <span title={shown.map(i => '• ' + i.label).join('\n')}
      style={{ ...STYLE[level], fontSize: '.68rem', fontWeight: 700, borderRadius: 10,
        padding: '1px 7px', whiteSpace: 'nowrap', cursor: 'help' }}>
      ⚠ {shown.length === 1 ? shown[0].label : `${shown.length} details to check`}
    </span>
  )
}

export function IssueList({ issues }) {
  if (!issues.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: '.74rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        Details to check:
      </span>
      {issues.map(i => (
        <span key={i.key} style={{ ...STYLE[i.level], fontSize: '.74rem', fontWeight: 600, borderRadius: 99, padding: '2px 9px' }}>
          {i.level === 'error' ? '⚠ ' : ''}{i.label}
        </span>
      ))}
    </div>
  )
}

// Clickable count in the summary card
export function IssuePill({ level, active, onClick, children }) {
  return (
    <button onClick={onClick}
      style={{ ...STYLE[level], fontSize: '.76rem', fontWeight: 600, padding: '4px 10px', borderRadius: 99,
        cursor: 'pointer', fontFamily: 'inherit', outline: active ? '2px solid #1e1a6e' : 'none', outlineOffset: 1 }}>
      {children}
    </button>
  )
}

// Red message under a form field
export function FieldError({ msg }) {
  if (!msg) return null
  return <div style={{ color: '#dc2626', fontSize: '.74rem', fontWeight: 600, marginTop: 3 }}>{msg}</div>
}

// Non-blocking notes above a form's save button
export function FormWarnings({ warnings }) {
  if (!warnings?.length) return null
  return (
    <div style={{ ...STYLE.warning, borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', marginBottom: 12 }}>
      {warnings.map(w => <div key={w}>⚠ {w}</div>)}
    </div>
  )
}
