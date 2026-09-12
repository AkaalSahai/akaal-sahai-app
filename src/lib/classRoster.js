import { supabase } from './supabase'

// Fetches the student roster for ANY group - a student's primary Punjabi
// group (matched via students.group_id) or an admin-managed extra class
// like Gatka/Kirtan/etc (matched via the student_classes junction table).
//
// A student's group_id always points at their PRIMARY Punjabi group, never
// an extra class - enrollment in Gatka/Kirtan/a newly admin-added class
// type lives only in student_classes. Every teacher-facing screen that
// lists "students in my group" (My Register, My Students, My Reports) needs
// to know which lookup applies, or a teacher assigned to any non-Punjabi
// group sees an empty roster - exactly the kind of thing that should live
// in one place rather than be re-implemented (and go out of sync) in each
// screen separately, the way teacher-assignment and Holiday status did.
//
// `select` is the students-table column list (or '*'), same shape you'd
// pass straight to supabase's own .select().
export async function loadGroupStudents(groupId, classType, select = '*') {
  if (!groupId) return []

  if (!classType || classType === 'punjabi') {
    const { data, error } = await supabase
      .from('students')
      .select(select)
      .eq('group_id', groupId)
      .eq('active', true)
    if (error) throw error
    return data || []
  }

  // student_classes has no active column of its own to filter on server-side
  // the way the primary-group path above does - the check has to happen
  // after the join instead, which means `active` must always be part of the
  // embedded select, even if the caller's field list didn't ask for it.
  const fields = select === '*' || /(^|,)\s*active\s*(,|$)/.test(select) ? select : `${select}, active`
  const { data, error } = await supabase
    .from('student_classes')
    .select(`students(${fields})`)
    .eq('group_id', groupId)
  if (error) throw error
  return (data || [])
    .map(r => r.students)
    .filter(s => s && s.active)
}
