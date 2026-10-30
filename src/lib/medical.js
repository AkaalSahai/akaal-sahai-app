// "Does your child have any medical conditions or allergies?"
//
// students.has_medical_condition / parent_applications.has_medical_condition:
//   true  - parent answered Yes (details in medical_notes)
//   false - parent answered No  (kept as a record that they were asked)
//   null  - never asked (records from before 30-10-2026)
//
// Older notes like "no" / "none" / "n/a" are parents answering No in the old
// free-text box - they mustn't show the Medical marker.

const NOTHING = /^(no|none|non|nil|nothing|n\/?a|not applicable|no allergies|no allergy|no medical (issues?|conditions?)|no (conditions?|issues?))[\s.,!]*$/i

export const isNothingAnswer = notes => !!notes && NOTHING.test(String(notes).trim())

// Real medical details worth flagging to a teacher
export const hasMedicalNotes = notes => !!notes?.trim() && !isNothingAnswer(notes)

// 'yes' | 'no' | 'unknown'
export function medicalStatus(s) {
  if (s.has_medical_condition === true) return 'yes'
  if (s.has_medical_condition === false) return 'no'
  if (hasMedicalNotes(s.medical_notes)) return 'yes'
  if (isNothingAnswer(s.medical_notes)) return 'no'
  return 'unknown'
}

export const MEDICAL_STATUS_LABEL = {
  yes: 'Yes',
  no: 'No medical conditions or allergies (parent answered No)',
  unknown: 'Not recorded',
}

// For an edit form: the Yes/No answer to start on
export const medicalAnswerFor = s => ({ yes: true, no: false, unknown: null })[medicalStatus(s)]

// What to save from a form's { has_medical_condition, medical_notes }
export function medicalPayload(f) {
  const has = f.has_medical_condition
  return {
    has_medical_condition: has === true || has === false ? has : null,
    medical_notes: has === false ? null : (f.medical_notes?.trim() || null),
  }
}

// Form check: answer required (when `required`), details required on Yes
export function medicalError(f, { required }) {
  if (f.has_medical_condition == null) return required ? 'Please answer Yes or No' : null
  if (f.has_medical_condition === true && !f.medical_notes?.trim()) return 'Please give details of the condition or allergy'
  return null
}
