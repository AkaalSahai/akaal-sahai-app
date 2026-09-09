export function formatPhone(raw) {
  if (!raw) return ''
  // raw is digits after +44 (no leading 0), e.g. "7700000000"
  return '+44' + raw
}

export function parsePhone(stored) {
  // stored is "+447700000000" — return just the 10 digits
  if (!stored) return ''
  return stored.replace(/^\+44/, '')
}
