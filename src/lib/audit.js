import { supabase } from './supabase'

export async function logAction(profile, action, detail = null, success = true) {
  if (!profile) return
  const { error } = await supabase.from('audit_logs').insert({
    user_id:   profile.id,
    user_name: profile.name || 'Unknown',
    action,
    detail:    detail || null,
    success,
  })
  if (error) console.error('Audit log insert failed:', error.message, { action, detail })
}
