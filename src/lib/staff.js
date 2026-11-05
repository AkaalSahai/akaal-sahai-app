// PostgREST filter for "teaching staff": anyone whose primary or extra role is
// teacher or registrar. Registrars are treated as teachers (they're marked in
// the Teacher Register and count as teachers), even with no group assigned.
export const TEACHING_STAFF_FILTER = 'role.in.(teacher,registrar),extra_roles.ov.{teacher,registrar}'

// The same rule for a user row already loaded
export function isTeachingStaff(u) {
  return ['teacher', 'registrar'].includes(u?.role) || (u?.extra_roles || []).some(r => r === 'teacher' || r === 'registrar')
}
