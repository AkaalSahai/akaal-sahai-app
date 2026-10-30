// Single source of truth for "is this student's detail sign-off still
// current" - shared by the teacher-side verify action, the admin
// breakdown view, and the Dashboard stat, so this logic can't drift
// out of sync between files the way isClassDay() once did.

import { normalizeUkPhone } from './studentChecks'

// Fields a teacher actually sees/edits for a student - exactly what
// TeacherStudents.jsx's save() payload touches. If any of these change
// after a verification, that sign-off no longer applies.
export const VERIFIED_FIELDS = [
  'first_name', 'middle_name', 'last_name', 'date_of_birth',
  'parent_name', 'relationship', 'phone', 'secondary_phone', 'email',
  'house_no', 'street_name', 'town', 'postcode', 'medical_notes', 'photo_consent',
]

// Roughly a school term - a sign-off older than this needs redoing
// even if nothing in the record ever changed.
export const VERIFICATION_TERM_DAYS = 120

export function buildVerificationSnapshot(student) {
  const snap = {}
  VERIFIED_FIELDS.forEach(f => { snap[f] = student[f] ?? null })
  return snap
}

// Names are stored tidied (trimmed, single spaces - see tidy-name-spacing.sql),
// but older snapshots may hold the untidied version. A spacing-only difference
// in a name isn't a real change, so it mustn't undo a verification.
const NAME_FIELDS = new Set(['first_name', 'middle_name', 'last_name', 'parent_name'])
function tidyName(v) {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v
}

// Same for phone numbers: "7700 900123", "07700900123" and "+447700900123"
// are one number, so tidying the format (the admin one-click fix) mustn't
// undo a verification either.
const PHONE_FIELDS = new Set(['phone', 'secondary_phone'])
function samePhone(a, b) {
  if (a === b) return true
  const na = normalizeUkPhone(a), nb = normalizeUkPhone(b)
  return !!na && na === nb
}

function snapshotMatchesStudent(snapshot, student) {
  if (!snapshot) return false
  return VERIFIED_FIELDS.every(f => {
    const a = snapshot[f] ?? null, b = student[f] ?? null
    if (NAME_FIELDS.has(f)) return tidyName(a) === tidyName(b)
    if (PHONE_FIELDS.has(f)) return samePhone(a, b)
    return a === b
  })
}

// latestVerification: the most recent student_verifications row for this
// student (or null/undefined if never verified).
// requiredSince: the site_settings 'verification_required_since' value
// (ISO string, or '' / null if no admin override is active).
export function getVerificationStatus(student, latestVerification, requiredSince) {
  if (!latestVerification) {
    return { verified: false, reason: 'never' }
  }

  if (requiredSince && new Date(latestVerification.verified_at) < new Date(requiredSince)) {
    return { verified: false, reason: 'admin_required', verifiedAt: latestVerification.verified_at }
  }

  if (!snapshotMatchesStudent(latestVerification.snapshot, student)) {
    return { verified: false, reason: 'changed', verifiedAt: latestVerification.verified_at }
  }

  const ageDays = (Date.now() - new Date(latestVerification.verified_at).getTime()) / 86400000
  if (ageDays > VERIFICATION_TERM_DAYS) {
    return { verified: false, reason: 'expired', verifiedAt: latestVerification.verified_at }
  }

  return {
    verified: true,
    verifiedAt: latestVerification.verified_at,
    verifiedByName: latestVerification.verified_by_name,
  }
}

export const VERIFICATION_REASON_LABEL = {
  never:          'Never verified',
  changed:        'Details changed since last verified',
  expired:        'Verification expired',
  admin_required: 'Re-verification requested',
}
