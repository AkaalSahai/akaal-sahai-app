import { supabase } from './supabase'

// studentId -> { pct, sessions }. Pass studentIds to scope to a specific
// roster; omit to compute across every group a student has ever been in
// (e.g. the admin-wide Students page, which has no single-group context).
// Pass groupId too when the page itself is scoped to one group (e.g. a
// teacher's My Students for a specific class) - a student who is in more
// than one group this same teacher teaches (their main Punjabi class and
// also an extra class like Gatka, say) would otherwise have both classes'
// attendance blended into one misleading number for either roster.
// pct = (present + late) / (total non-holiday sessions), rounded - holiday
// days don't count either way. Matches AdminDashboard.jsx's convention.
//
// Computed via the get_attendance_stats() function (one GROUP BY query in
// Postgres) rather than fetching raw attendance_records rows to sum
// client-side - with 14,000+ rows and growing, that was ~15 sequential
// paginated requests and was making the Students tab slow to load. The
// function has no SECURITY DEFINER, so it runs under the calling user's
// own RLS: exactly the same rows they could already see via a direct
// select, just aggregated server-side.
export async function loadAttendanceStats(studentIds = null, groupId = null) {
  const { data, error } = await supabase.rpc('get_attendance_stats', {
    p_student_ids: studentIds,
    p_group_id: groupId,
  })
  if (error) { console.error('Attendance stats load error:', error.message); return {} }
  const statsMap = Object.fromEntries((data || []).map(r => [r.student_id, r]))
  const ids = studentIds || Object.keys(statsMap)
  const result = {}
  ids.forEach(id => {
    const s = statsMap[id]
    const total = s ? Number(s.total) : 0
    const attended = s ? Number(s.attended) : 0
    result[id] = { pct: total > 0 ? Math.round((attended / total) * 100) : null, sessions: total }
  })
  return result
}
