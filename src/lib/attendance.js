import { supabase } from './supabase'

const PAGE_SIZE = 1000

// Supabase/PostgREST caps any unfiltered select() at a default row limit
// (1000 on this project) - a plain .select() on attendance_records silently
// truncated results once the table grew past that, producing wrong
// percentages for whichever students' rows got cut off. Page through
// everything so the count is always complete.
async function fetchAllAttendanceRows(studentIds) {
  let rows = []
  let from = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // PostgREST does not guarantee a stable row order across separate
    // range() requests unless one is specified explicitly - without this,
    // consecutive pages of an unfiltered scan can skip or duplicate rows,
    // which is exactly what was causing some students to show no
    // attendance % at all despite having real session history.
    let q = supabase.from('attendance_records').select('student_id, status').order('id').range(from, from + PAGE_SIZE - 1)
    if (studentIds) q = q.in('student_id', studentIds)
    const { data, error } = await q
    if (error) { console.error('Attendance stats load error:', error.message); break }
    rows = rows.concat(data || [])
    if (!data || data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return rows
}

// studentId -> { pct, sessions }. Pass studentIds to scope to a specific
// roster (e.g. one group); omit to compute for every student in the table.
// pct = (present + late) / (total non-holiday sessions), rounded - holiday
// days don't count either way. Matches AdminDashboard.jsx's convention.
export async function loadAttendanceStats(studentIds = null) {
  const rows = await fetchAllAttendanceRows(studentIds)
  const stats = {}
  rows.forEach(r => {
    if (!stats[r.student_id]) stats[r.student_id] = { total: 0, attended: 0 }
    if (r.status === 'holiday') return
    stats[r.student_id].total++
    if (r.status === 'present' || r.status === 'late') stats[r.student_id].attended++
  })
  const ids = studentIds || Object.keys(stats)
  const result = {}
  ids.forEach(id => {
    const s = stats[id]
    result[id] = { pct: s && s.total > 0 ? Math.round((s.attended / s.total) * 100) : null, sessions: s?.total || 0 }
  })
  return result
}
