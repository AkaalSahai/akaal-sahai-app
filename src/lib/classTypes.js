import { supabase } from './supabase'

// Punjabi is the foundational class the app is built around (fixed
// Friday/Saturday schedule hardcoded into the teacher daily register,
// default class_type on new groups, etc.) - it's intentionally NOT part of
// the admin-manageable class_types table, so it stays a plain constant here.
export const CLASS_META = {
  punjabi: { label: 'Punjabi', days: [5, 6], dayNames: 'Fridays and Saturdays', color: '#1e1a6e', bg: '#eef2ff' },
}

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Turns [0, 3] into "Sundays and Wednesdays" - used so admin only ever
// picks days, never has to type the human-readable label by hand.
export function formatDayNames(days) {
  const names = [...(days || [])].sort((a, b) => a - b).map(d => DAY_LABELS[d] + 's')
  if (names.length === 0) return ''
  if (names.length === 1) return names[0]
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
}

// True if today is a class day for ANY class type (Punjabi or any
// admin-added extra class) - the union of every entry's days. Single
// source of truth for "is some class running today" checks, so it can't
// drift out of sync the way several separate hardcoded copies did before.
// Takes the already-merged { ...CLASS_META, ...extra } meta object so
// callers can call it synchronously once they've loaded the extra types.
export function isAnyClassDay(meta, date = new Date()) {
  const day = date.getDay()
  return Object.values(meta).some(m => m.days.includes(day))
}

// Fetches every admin-managed extra class type (Gatka, Kirtan, and any
// others added since) in the same {label, color, bg, days, dayNames} shape
// CLASS_META already uses, so callers can treat { ...CLASS_META, ...extra }
// as one combined lookup.
export async function loadClassTypes() {
  const { data, error } = await supabase.from('class_types').select('*').order('label')
  if (error) {
    console.error('loadClassTypes error:', error.message)
    return {}
  }
  const meta = {}
  ;(data || []).forEach(row => {
    meta[row.key] = {
      id: row.id,
      label: row.label,
      color: row.color,
      bg: row.bg,
      days: row.days || [],
      dayNames: row.day_names || formatDayNames(row.days),
    }
  })
  return meta
}
