import { supabase } from './supabase'

// Staff who have left (archived). Their records are kept under their old ID,
// so this is how screens still show who did something. Returns name, joined
// and left dates and groups - never contact details. Resolves to [] for
// viewers without Teacher Register access (or before the SQL is run).
export async function loadFormerStaff() {
  const { data, error } = await supabase.rpc('get_former_staff')
  if (error) return []
  return data || []
}

export function formerStaffNameMap(rows) {
  return Object.fromEntries(rows.map(r => [r.original_id, `${r.name} (left)`]))
}
