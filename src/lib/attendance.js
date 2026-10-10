import { supabase } from './supabase'

const PAGE_SIZE = 1000

// Supabase/PostgREST caps any unfiltered select() at a default row limit
// (1000 on this project) - a plain .select() on attendance_records silently
// truncated results once the table grew past that, producing wrong
// percentages for whichever students' rows got cut off. Page through
// everything so the count is always complete.
//
// Uses keyset (cursor) pagination - "give me rows after the last id I saw",
// not offset ranges - for two reasons: (1) it only stops once a request
// truly comes back empty, so it's correct even if this project's actual
// server-side row cap is lower than PAGE_SIZE (an offset-based "got fewer
// than I asked for" check would wrongly treat that as "no more data" and
// quit early); (2) offset pagination can skip or duplicate rows if
// attendance is being marked concurrently while this is mid-fetch, since
// a row inserted before the current offset shifts every row after it -
// keyset pagination has no such gap because each page is "greater than the
// last id I've already got," not "the Nth batch."
async function fetchAllAttendanceRows(studentIds) {
  let rows = []
  let lastId = null
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from('attendance_records').select('id, student_id, status').order('id').limit(PAGE_SIZE)
    if (studentIds) q = q.in('student_id', studentIds)
    if (lastId) q = q.gt('id', lastId)
    const { data, error } = await q
    if (error) { console.error('Attendance stats load error:', error.message); break }
    if (!data || data.length === 0) break
    rows = rows.concat(data)
    lastId = data[data.length - 1].id
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
