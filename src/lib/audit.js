import { supabase } from './supabase'

export async function logAction(profile, action, detail = null) {
  if (!profile) return
  try {
    await supabase.from('audit_logs').insert({
      user_id:   profile.id,
      user_name: profile.name || 'Unknown',
      action,
      detail:    detail || null,
    })
  } catch (err) {
    console.error('Audit log failed:', err)
  }
}
