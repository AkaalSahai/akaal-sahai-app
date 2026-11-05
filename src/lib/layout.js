// Tabs whose page is mostly a big table get the full screen width
// (.content-wide in global.css); forms and dashboards stay narrow.
export const WIDE_TABS = new Set([
  'users', 'students', 'registerstatus', 'teacherregister', 'activity', 'logins', 'archive',
])

export const contentClass = tab => WIDE_TABS.has(tab) ? 'content content-wide' : 'content'
