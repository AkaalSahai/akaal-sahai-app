// Single source of truth for "are this student's details complete and
// plausible" - used by the admin/registrar Students page (badges, filter,
// summary), teachers' My Students, the edit forms and the import.
//
// Rules agreed 24-10/30-10-2026: youngest expected age is 4 (over 18 is fine),
// email is required for new students, and phone numbers are UK numbers stored
// the way the sign-up form stores them ("+44" + 10 digits) - "07..." is also
// accepted as correct.

export const MIN_AGE = 4

// Returns "+44XXXXXXXXXX" for anything that is clearly a UK number in some
// format (missing leading 0, 44 without +, 0044, spaces...), else null.
export function normalizeUkPhone(raw) {
  if (!raw) return null
  let d = String(raw).replace(/[\s\-().]/g, '')
  if (d.startsWith('+44')) d = d.slice(3)
  else if (d.startsWith('0044')) d = d.slice(4)
  else if (d.startsWith('44') && d.length === 12) d = d.slice(2)
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1)
  if (d.startsWith('0') && d.length === 11) d = d.slice(1)   // "+4407..." typed with the 0
  return /^[1-9]\d{9}$/.test(d) ? '+44' + d : null
}

// Stored in an accepted format already
export function isPhoneWellFormatted(raw) {
  if (!raw) return false
  const d = String(raw).replace(/\s/g, '')
  return /^\+44[1-9]\d{9}$/.test(d) || /^0[1-9]\d{9}$/.test(d)
}

// What the one-click fix would change the number to, or null if it's
// already fine or can't be fixed safely (needs a person to check).
export function phoneFormatFix(raw) {
  if (!raw || isPhoneWellFormatted(raw)) return null
  return normalizeUkPhone(raw)
}

export const isValidEmail = v => !!v && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim())
export const isValidPostcode = v => !!v && /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(String(v).trim())

export function ageOn(dob, on = new Date()) {
  if (!dob) return null
  const d = new Date(dob + 'T12:00:00')
  let a = on.getFullYear() - d.getFullYear()
  if (on.getMonth() < d.getMonth() || (on.getMonth() === d.getMonth() && on.getDate() < d.getDate())) a--
  return a
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// Issue catalogue - key -> { level, label }. 'error' = must be fixed,
// 'warning' = please check / complete.
export const ISSUE_TYPES = {
  dob_missing:       { level: 'error',   label: 'Date of birth missing' },
  dob_future:        { level: 'error',   label: 'Date of birth is in the future' },
  age_under_min:     { level: 'error',   label: `Younger than ${MIN_AGE}` },
  phone_missing:     { level: 'error',   label: 'Phone number missing' },
  fields_mixed:      { level: 'error',   label: 'Details mixed up between fields (e.g. “Mother” in the phone box)' },
  phone_invalid:     { level: 'error',   label: 'Phone number is not a valid UK number' },
  phone_fixable:     { level: 'warning', label: 'Phone number format can be fixed automatically' },
  parent_missing:    { level: 'error',   label: 'Parent/guardian name missing' },
  email_invalid:     { level: 'error',   label: 'Email address is not valid' },
  email_missing:     { level: 'warning', label: 'Email missing' },
  phone2_invalid:    { level: 'warning', label: 'Second phone number is not valid' },
  postcode_missing:  { level: 'warning', label: 'Postcode missing' },
  postcode_invalid:  { level: 'warning', label: 'Postcode format looks wrong' },
  address_missing:   { level: 'warning', label: 'Address missing' },
  duplicate:         { level: 'warning', label: 'Possible duplicate' },
}

// Same first name, last name and date of birth -> map of studentId -> the
// other record(s)' reference numbers.
export function findDuplicates(students) {
  const byKey = {}
  students.forEach(s => {
    const k = [s.first_name, s.last_name].map(x => (x || '').trim().toLowerCase()).join('|') + '|' + (s.date_of_birth || '')
    ;(byKey[k] ||= []).push(s)
  })
  const out = {}
  Object.values(byKey).filter(list => list.length > 1).forEach(list => {
    list.forEach(s => { out[s.id] = list.filter(o => o.id !== s.id).map(o => o.student_ref || 'another record') })
  })
  return out
}

// All issues for one student: [{ key, level, label }]
export function studentIssues(s, duplicates = {}) {
  const out = []
  const add = (key, extra) => out.push({ key, ...ISSUE_TYPES[key], ...(extra ? { label: ISSUE_TYPES[key].label + extra } : {}) })
  if (!s.date_of_birth) add('dob_missing')
  else if (s.date_of_birth > todayISO()) add('dob_future')
  else if (ageOn(s.date_of_birth) < MIN_AGE) add('age_under_min')
  if (!s.phone?.trim()) add('phone_missing')
  else if (/[a-z]{2,}/i.test(s.phone)) add('fields_mixed')   // a word where the number should be - usually shifted columns from an import
  else if (!isPhoneWellFormatted(s.phone)) add(normalizeUkPhone(s.phone) ? 'phone_fixable' : 'phone_invalid')
  if (s.secondary_phone?.trim() && !isPhoneWellFormatted(s.secondary_phone) && !normalizeUkPhone(s.secondary_phone)) add('phone2_invalid')
  if (!s.parent_name?.trim()) add('parent_missing')
  if (!s.email?.trim()) add('email_missing')
  else if (!isValidEmail(s.email)) add('email_invalid')
  if (!s.postcode?.trim()) add('postcode_missing')
  else if (!isValidPostcode(s.postcode)) add('postcode_invalid')
  if (!s.house_no?.trim() && !s.street_name?.trim()) add('address_missing')
  if (duplicates[s.id]) add('duplicate', ` of ${duplicates[s.id].join(', ')}`)
  return out
}

// Checks for the edit forms and import. Returns { errors: {field: msg}, warnings: [msg] }.
// isNew: true for new students (sign-up, import) - email and phone are then
// required. Editing an existing record only warns about a missing email or
// phone, so a registrar fixing (say) a date of birth isn't blocked.
export function validateStudentForm(f, { isNew }) {
  const errors = {}, warnings = []
  if (!f.first_name?.trim()) errors.first_name = 'Required'
  if (f.date_of_birth) {
    if (f.date_of_birth > todayISO()) errors.date_of_birth = 'Date of birth cannot be in the future'
    else if (ageOn(f.date_of_birth) < MIN_AGE) errors.date_of_birth = `Students must be at least ${MIN_AGE} years old - please check the date`
  }
  if (!f.phone?.trim()) {
    if (isNew) errors.phone = 'Phone number is required'
    else warnings.push('Phone number missing - please add one when you can')
  } else if (!normalizeUkPhone(f.phone)) errors.phone = 'Enter a UK phone number, e.g. 07700 900123'
  if (f.secondary_phone?.trim() && !normalizeUkPhone(f.secondary_phone)) errors.secondary_phone = 'Enter a UK phone number, or leave it blank'
  if (!f.email?.trim()) {
    if (isNew) errors.email = 'Email is required'
    else warnings.push('Email missing - please add the parent’s email when you can')
  } else if (!isValidEmail(f.email)) errors.email = 'Enter a valid email address'
  if (f.postcode?.trim() && !isValidPostcode(f.postcode)) warnings.push('Postcode format looks wrong - please check')
  return { errors, warnings }
}
