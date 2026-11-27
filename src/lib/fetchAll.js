// Supabase returns at most 1000 rows per request, silently cutting the rest
// off. fetchAll pages through with .range() until everything is loaded.
//
// Pass a function that BUILDS the query (it's called once per page, because
// a Supabase query object can only be run once), e.g.
//   const { data, error } = await fetchAll(() =>
//     supabase.from('students').select('*').order('id'))
// Always give the query a stable .order() so pages don't overlap/skip rows.
// Works for .rpc() calls that return a table too.
const PAGE = 1000

export async function fetchAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) return { data: rows.length ? rows : null, error }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) return { data: rows, error: null }
  }
}
