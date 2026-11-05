import { localISO } from './teacherAttendanceReport'

// The Teacher Register has one register per class (teacher_attendance.class_type,
// agreed 05-11-2026). Everyone teaching is on the Punjabi register; Gatka and
// Kirtan only list teachers an admin has ticked on the Users page
// (users.register_classes). Days mirror class_types.days.
// Only Punjabi is auto-marked absent at 21:30 - Gatka/Kirtan are left blank.
export const TEACHER_REGISTERS = [
  { key: 'punjabi', label: 'Punjabi', days: [5, 6], dayNames: 'Fridays & Saturdays' },
  { key: 'gatka',   label: 'Gatka',   days: [0],    dayNames: 'Sundays' },
  { key: 'kirtan',  label: 'Kirtan',  days: [3],    dayNames: 'Wednesdays' },
]

export const EXTRA_REGISTERS = TEACHER_REGISTERS.filter(r => r.key !== 'punjabi')

export const registerByKey = key => TEACHER_REGISTERS.find(r => r.key === key) || TEACHER_REGISTERS[0]

export function onRegister(user, key) {
  return key === 'punjabi' || (user?.register_classes || []).includes(key)
}

// Today if it's a class day for this register, otherwise the most recent one.
export function latestClassDay(key, today = new Date()) {
  const { days } = registerByKey(key)
  const d = new Date(today)
  for (let i = 0; i < 7 && !days.includes(d.getDay()); i++) d.setDate(d.getDate() - 1)
  return localISO(d)
}
