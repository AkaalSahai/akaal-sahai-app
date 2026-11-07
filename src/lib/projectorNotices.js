import { supabase } from './supabase'

// Upcoming dates and Thought of the week for the projector's Notices slide
// (agreed 06-11-2026). Kept in site_settings as JSON text, typed by admins on
// Settings -> Projector Screen. Everyone in the room sees the projector, so
// these are general notices only - never anything about one child.
//   projector_dates   - [{ date: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | '', title }]
//   projector_thought - { gurmukhi, english, source }
//   projector_headings - { dates, thought } - blank means the default
//   projector_images  - [{ id, path, caption, from, until, active, textPos,
//                       left: { heading, body }, right: { heading, body },
//                       textSize, textWidth, fullScreen }] - files in the
//                       projector-images storage bucket, in slide order
//                       (text/layout options added 07-11-2026, see PICTURE_*)
//   projector_images_per_slide - '1' | '2' | '3' | '4' | '6'
//   projector_timings - { [slide]: { secs, show }, holdSecs } (see SLIDE_TYPES)

export const PROJECTOR_KEYS = ['projector_dates', 'projector_thought', 'projector_headings',
  'projector_images', 'projector_images_per_slide', 'projector_timings']

// The projector's slide types, in rotation order. Admins set how long each
// stays up and can switch any off (Settings -> Projector Screen).
export const SLIDE_TYPES = [
  { key: 'pending', label: '⚠ Registers Pending' },
  { key: 'seva',    label: '🙏 Seva' },
  { key: 'top5',    label: '🏆 Top 5 & Students Verified' },
  { key: 'notices', label: '📅 Notices (dates & thought)' },
  { key: 'images',  label: '🖼 Picture slides (each one)' },
]
export const MIN_SECS = 5, MAX_SECS = 120
export const DEFAULT_TIMINGS = {
  ...Object.fromEntries(SLIDE_TYPES.map(t => [t.key, { secs: 14, show: true }])),
  holdSecs: 60,   // after someone taps a dot
}

const clampSecs = (n, d) => Number.isFinite(Number(n)) && Number(n) > 0
  ? Math.min(MAX_SECS, Math.max(MIN_SECS, Math.round(Number(n)))) : d

export const IMAGE_BUCKET = 'projector-images'
export const PER_SLIDE_OPTIONS = [1, 2, 3, 4, 6]

export const imageUrl = path => supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl

export const EMPTY_THOUGHT = { gurmukhi: '', english: '', source: '' }

export const DEFAULT_HEADINGS = { dates: 'Upcoming Dates', thought: 'Thought of the Week' }

function parse(text, fallback) {
  try { return text ? JSON.parse(text) : fallback } catch { return fallback }
}

export function readNotices(settings) {
  return {
    dates: parse(settings.projector_dates, []),
    thought: { ...EMPTY_THOUGHT, ...parse(settings.projector_thought, {}) },
    headings: { dates: '', thought: '', ...parse(settings.projector_headings, {}) },
    images: parse(settings.projector_images, []),
    perSlide: PER_SLIDE_OPTIONS.includes(Number(settings.projector_images_per_slide))
      ? Number(settings.projector_images_per_slide) : 1,
    timings: readTimings(parse(settings.projector_timings, {})),
  }
}

function readTimings(t) {
  const out = { holdSecs: clampSecs(t.holdSecs, DEFAULT_TIMINGS.holdSecs) }
  SLIDE_TYPES.forEach(({ key }) => {
    out[key] = { secs: clampSecs(t[key]?.secs, 14), show: t[key]?.show !== false }
  })
  return out
}

function todayISO(today = new Date()) {
  return new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

// Switched on and inside their from/until dates (either may be blank)
export function showingImages(images, today = new Date()) {
  const t = todayISO(today)
  return (images || []).filter(im => im.active !== false && im.path
    && (!im.from || im.from <= t) && (!im.until || im.until >= t))
}

// Text and layout choices for each picture (agreed 07-11-2026)
export const PICTURE_TEXT_POSITIONS = [
  { key: 'none',  label: 'No text' },
  { key: 'below', label: 'Caption below' },
  { key: 'left',  label: 'Text on left' },
  { key: 'right', label: 'Text on right' },
  { key: 'both',  label: 'Text on both sides' },
]
export const PICTURE_TEXT_SIZES = [
  { key: 'auto',   label: 'Auto (biggest that fits)' },
  { key: 'small',  label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large',  label: 'Large' },
]
export const PICTURE_TEXT_WIDTHS = [
  { key: 'auto',   label: 'Auto (all space the picture leaves)' },
  { key: 'narrow', label: 'Narrow' },
  { key: 'medium', label: 'Medium' },
  { key: 'wide',   label: 'Wide' },
]
export const EMPTY_SIDE = { heading: '', body: '' }

// Pictures saved before 07-11-2026 have no textPos - a caption meant "below"
export const textPosition = im =>
  PICTURE_TEXT_POSITIONS.some(p => p.key === im.textPos) ? im.textPos : (im.caption?.trim() ? 'below' : 'none')

const hasSide = s => !!(s?.heading?.trim() || s?.body?.trim())

// Which sides actually have something to show
export function shownSides(im) {
  const pos = textPosition(im)
  return {
    left:  (pos === 'left'  || pos === 'both') && hasSide(im.left),
    right: (pos === 'right' || pos === 'both') && hasSide(im.right),
  }
}

// Side text or full screen needs the whole slide, so that picture goes alone
export function isSoloPicture(im) {
  const s = shownSides(im)
  return !!im.fullScreen || s.left || s.right
}

// Pictures grouped into slides, perSlide at a time, in order; a solo picture
// (side text or full screen) always gets a slide to itself
export function imageSlides(images, perSlide) {
  const slides = []
  let group = []
  const flush = () => { if (group.length) slides.push(group); group = [] }
  for (const im of showingImages(images)) {
    if (isSoloPicture(im)) { flush(); slides.push([im]); continue }
    group.push(im)
    if (group.length >= perSlide) flush()
  }
  flush()
  return slides
}

// Columns for a slide holding n pictures - a part-filled last slide is laid
// out for what it actually has, so the pictures come out bigger, not gappy
export function gridColumns(n) {
  return { 1: 1, 2: 2, 3: 3, 4: 2, 5: 3, 6: 3 }[n] || 3
}

// Today onwards (a range stays until its last day), soonest first
export function upcomingDates(dates, today = new Date()) {
  const t = todayISO(today)
  return (dates || [])
    .filter(d => d.date && d.title?.trim() && (d.end || d.date) >= t)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function hasThought(thought) {
  return !!(thought?.gurmukhi?.trim() || thought?.english?.trim())
}

const fmt = (iso, opts) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', opts)

// "Sat 8 Nov" or "Fri 21 – Sat 22 Nov"
export function fmtDateRange(d) {
  const day = { weekday: 'short', day: 'numeric', month: 'short' }
  if (!d.end || d.end === d.date) return fmt(d.date, day)
  const sameMonth = d.date.slice(0, 7) === d.end.slice(0, 7)
  return `${fmt(d.date, sameMonth ? { weekday: 'short', day: 'numeric' } : day)} – ${fmt(d.end, day)}`
}
