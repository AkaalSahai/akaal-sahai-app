export const CLASS_META = {
  punjabi: { label: 'Punjabi', days: [5, 6], dayNames: 'Fridays and Saturdays', color: '#1e1a6e', bg: '#eef2ff' },
  gatka:   { label: 'Gatka',   days: [0],    dayNames: 'Sundays',               color: '#15803d', bg: '#f0fdf4' },
  kirtan:  { label: 'Kirtan',  days: [3],    dayNames: 'Wednesdays',            color: '#7c3aed', bg: '#f5f3ff' },
}

// True if today is a class day for ANY class type (Punjabi, Gatka, or
// Kirtan) - the union of every CLASS_META entry's days. Single source
// of truth for "is some class running today" checks that span all
// groups, so it can never drift out of sync with CLASS_META the way
// several separate hardcoded copies did before this.
export function isAnyClassDay(date = new Date()) {
  const day = date.getDay()
  return Object.values(CLASS_META).some(m => m.days.includes(day))
}
