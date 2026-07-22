import { supabase } from './supabase'

export async function notifyTeachersOfGroup(groupId, message) {
  if (!groupId) return
  try {
    const [{ data: tg }, { data: g }] = await Promise.all([
      supabase.from('teacher_groups').select('teacher_id').eq('group_id', groupId),
      supabase.from('groups').select('teacher_id').eq('id', groupId).single(),
    ])
    const ids = new Set((tg || []).map(r => r.teacher_id))
    if (g?.teacher_id) ids.add(g.teacher_id)
    if (ids.size === 0) return
    await supabase.from('notifications').insert(
      Array.from(ids).map(user_id => ({ user_id, message }))
    )
  } catch {
    // notifications are best-effort — don't block the main action
  }
}
