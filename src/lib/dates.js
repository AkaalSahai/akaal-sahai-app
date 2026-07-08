// Returns DD-MM-YYYY for any date value.
// Accepts ISO date strings (YYYY-MM-DD), ISO timestamps, or Date objects.
export function fmtDate(value) {
  if (!value) return '—'
  // Plain date string YYYY-MM-DD — split directly to avoid timezone shift
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${d}-${m}-${y}`
  }
  // Full timestamp or Date object — use local time
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  const day   = String(d.getDate()).padStart(2, '0')
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const year  = d.getFullYear()
  return `${day}-${month}-${year}`
}
