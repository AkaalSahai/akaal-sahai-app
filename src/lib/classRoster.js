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
  // embedded select, even if the caller's field list didn't ask for it. A
  // bare `*` anywhere in the list already covers every column (including
  // active), so only append it when neither is already present - appending
  // a duplicate `active` alongside `*` would otherwise be invalid.
  const hasStar   = /(^|,)\s*\*\s*(,|$)/.test(select)
  const hasActive = /(^|,)\s*active\s*(,|$)/.test(select)
  const fields = (hasStar || hasActive) ? select : `${select}, active`
  const { data, error } = await supabase
    .from('student_classes')
    .select(`students(${fields})`)
    .eq('group_id', groupId)
  if (error) throw error
  return (data || [])
    .map(r => r.students)
    .filter(s => s && s.active)
}

// Resolves the teacher name for a student's PRIMARY Punjabi group - used
// wherever an extra-class roster (Gatka/Kirtan/etc) shows students who
// belong to a *different* group day-to-day, so the teacher marking that
// extra class can see who each student's Punjabi teacher is. Checks both
// the legacy groups.teacher_id field and the teacher_groups junction, the
// same two-mechanism check AdminClasses.jsx already uses - fetches once
// and returns a resolver function rather than querying per student row.
//
// Degrades gracefully (resolver always returns null) rather than breaking
// the whole roster if either query fails for any reason.
export async function loadPunjabiTeacherResolver() {
  try {
    const [{ data: users }, { data: tg }] = await Promise.all([
      supabase.from('users').select('id, name, role, extra_roles'),
      supabase.from('teacher_groups').select('group_id, teacher_id'),
    ])
    const teachers = (users || []).filter(u => u.role === 'teacher' || (u.extra_roles || []).includes('teacher'))
    const nameById = new Map(teachers.map(t => [t.id, t.name]))
    const groupTeacherMap = {}
    ;(tg || []).forEach(r => {
      if (!groupTeacherMap[r.group_id]) groupTeacherMap[r.group_id] = []
      groupTeacherMap[r.group_id].push(r.teacher_id)
    })
    return function resolvePunjabiTeacher(grp) {
      if (!grp) return null
      const primary = nameById.get(grp.teacher_id)
      if (primary) return primary
      for (const tid of (groupTeacherMap[grp.id] || [])) {
        const name = nameById.get(tid)
        if (name) return name
      }
      return null
    }
  } catch (err) {
    console.error('loadPunjabiTeacherResolver error:', err)
    return () => null
  }
}
