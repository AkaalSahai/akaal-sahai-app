// Single source of truth for "is this student's detail sign-off still
// current" - shared by the teacher-side verify action, the admin
// breakdown view, and the Dashboard stat, so this logic can't drift
// out of sync between files the way isClassDay() once did.

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

function snapshotMatchesStudent(snapshot, student) {
  if (!snapshot) return false
  return VERIFIED_FIELDS.every(f => (snapshot[f] ?? null) === (student[f] ?? null))
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
