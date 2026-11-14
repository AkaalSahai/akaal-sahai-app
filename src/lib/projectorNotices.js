import { supabase } from './supabase'

// Upcoming dates and Thought of the week for the projector's Notices slide
// (agreed 06-11-2026). Kept in site_settings as JSON text, typed by admins on
// Settings -> Projector Screen. Everyone in the room sees the projector, so
// these are general notices only - never anything about one child.
//   projector_dates   - [{ date: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | '', title }]
//   projector_thought - { notices: [...] } (14-11-2026, see NOTICE_*);
//                       before that { gurmukhi, english, source }
//   projector_headings - { dates, thought } - blank means the default
//   projector_images  - [{ id, path, caption, from, until, active, textPos,
//                       left: { heading, body }, right: { heading, body },
//                       textSize, textWidth, fullScreen }] - files in the
//                       projector-images storage bucket, in slide order
//                       (text/layout options added 07-11-2026, see PICTURE_*)
//   projector_images_per_slide - '1' | '2' | '3' | '4' | '6'
//   projector_timings - { [slide]: { secs, show }, holdSecs } (see SLIDE_TYPES);
//                       video also has maxMins (0 = play each video to the end)

export const PROJECTOR_KEYS = ['projector_dates', 'projector_thought', 'projector_headings',
  'projector_images', 'projector_images_per_slide', 'projector_timings']

// The projector's slide types, in rotation order. Admins set how long each
// stays up and can switch any off (Settings -> Projector Screen).
export const SLIDE_TYPES = [
  { key: 'pending', label: '⚠ Registers Pending' },
  { key: 'seva',    label: '🙏 Seva' },
  { key: 'top5',    label: '🏆 Top 5 & Students Verified' },
  { key: 'notices', label: '📢 Notices & upcoming dates (each one)' },
  { key: 'images',  label: '🖼 Picture slides (each one)' },
  { key: 'video',   label: '🎬 Video slides (laptop folder)' },
]
// Videos play to the end unless a longest play time is set (minutes, 0 = none)
export const MAX_VIDEO_MINS = 180
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
    notices: readNoticeList(settings.projector_thought, settings.projector_headings),
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
  const mins = Math.round(Number(t.video?.maxMins))
  out.video.maxMins = Number.isFinite(mins) && mins > 0 ? Math.min(MAX_VIDEO_MINS, mins) : 0
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
  { key: 'bottom', label: 'Text across the bottom of the slide' },
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

// "Text across the bottom": shown centred in a band under every picture on
// its slide, so two pictures can share one explanation (07-11-2026)
export function bottomText(im) {
  return textPosition(im) === 'bottom' && hasSide(im.bottom) ? im.bottom : null
}

// The bottom text for a whole slide - usually one picture has it; if several
// do, their headings and texts are joined
export function slideBottomText(items) {
  const parts = (items || []).map(bottomText).filter(Boolean)
  if (!parts.length) return null
  return {
    heading: parts.map(p => p.heading?.trim()).filter(Boolean).join('  ·  '),
    body: parts.map(p => p.body?.trim()).filter(Boolean).join('\n\n'),
    size: items.find(bottomText)?.textSize || 'auto',
    area: items.find(bottomText)?.textWidth || 'auto',
  }
}

// Side text needs the whole slide, so that picture goes alone
export function isSoloPicture(im) {
  const s = shownSides(im)
  return s.left || s.right
}

// Pictures grouped into slides, perSlide at a time, in order. A picture with
// side text always gets a slide to itself. Full screen pictures share slides
// only with other full screen pictures next to them (07-11-2026), so a slide
// is either all full screen (no logo bar) or not.
export function imageSlides(images, perSlide) {
  const slides = []
  let group = []
  const flush = () => { if (group.length) slides.push(group); group = [] }
  for (const im of showingImages(images)) {
    if (isSoloPicture(im)) { flush(); slides.push([im]); continue }
    if (group.length && !!group[0].fullScreen !== !!im.fullScreen) flush()
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

// ── Notices (14-11-2026) ────────────────────────────────────────────────
// The old single "Thought of the week" became a list of notices, each its
// own slide, used for messages to children, teachers and parents ("No class
// tomorrow"). Stored in projector_thought as { notices: [...] } so Projector
// Managers can still save it (they may only write the projector_* keys).
//   notice = { id, active, from, until, fullScreen, withDates, grow, box,
//              heading|main|second|footer: { text, size, font, color } }
// A notice shows as soon as any section has text, in any language.

export const NOTICE_SECTIONS = [
  { key: 'heading', label: 'Heading',                  hint: 'e.g. NO CLASS TOMORROW' },
  { key: 'main',    label: 'Main text',                hint: 'Any language - line breaks are kept' },
  { key: 'second',  label: 'Second text',              hint: 'e.g. the same message in English' },
  { key: 'footer',  label: 'Small line at the bottom', hint: 'e.g. — Akaal Sahai Sevadars' },
]
// Size of each section relative to the others. With "grow" on (default) the
// whole notice is then made as big as fits the screen, keeping these ratios.
export const NOTICE_SIZES = [
  { key: 'small',  label: 'Small',       mult: 0.6 },
  { key: 'medium', label: 'Medium',      mult: 0.85 },
  { key: 'large',  label: 'Large',       mult: 1.15 },
  { key: 'xl',     label: 'Extra large', mult: 1.5 },
  { key: 'huge',   label: 'Huge',        mult: 2 },
]
// Every font here has Gurmukhi and English letters (loaded by loadNoticeFonts)
export const NOTICE_FONTS = [
  { key: 'standard', label: 'Standard', family: "'Noto Sans Gurmukhi', 'Raavi', system-ui, sans-serif", weight: 600 },
  { key: 'bold',     label: 'Bold',     family: "'Anek Gurmukhi', 'Noto Sans Gurmukhi', 'Raavi', system-ui, sans-serif", weight: 800 },
  { key: 'rounded',  label: 'Rounded',  family: "'Baloo Paaji 2', 'Noto Sans Gurmukhi', 'Raavi', system-ui, sans-serif", weight: 700 },
  { key: 'classic',  label: 'Classic',  family: "'Noto Serif Gurmukhi', Georgia, 'Raavi', serif", weight: 700 },
]
export const NOTICE_COLOURS = [
  { key: '#f0a500', label: 'Gold' },   { key: '#fcd34d', label: 'Yellow' },
  { key: '#ffffff', label: 'White' },  { key: '#fca5a5', label: 'Light red' },
  { key: '#ef4444', label: 'Red' },    { key: '#86efac', label: 'Green' },
  { key: '#93c5fd', label: 'Blue' },   { key: '#f9a8d4', label: 'Pink' },
  { key: '#a5b4fc', label: 'Lavender' },
]
export const NOTICE_BOXES = [
  { key: '#1e1a6e', label: 'Navy (usual)' }, { key: '#7f1d1d', label: 'Dark red' },
  { key: '#14532d', label: 'Dark green' },   { key: '#1e3a8a', label: 'Blue' },
  { key: '#000000', label: 'Black' },
]
const NOTICE_DEFAULTS = {
  heading: { size: 'xl',     font: 'bold',     color: '#f0a500' },
  main:    { size: 'large',  font: 'standard', color: '#ffffff' },
  second:  { size: 'medium', font: 'standard', color: '#fcd34d' },
  footer:  { size: 'small',  font: 'standard', color: '#a5b4fc' },
}
const isColour = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)
const pick = (list, k, d) => list.some(o => o.key === k) ? k : d

export function newNotice() {
  return cleanNotice({ id: crypto.randomUUID?.() || String(Date.now()), active: true })
}

// Fills in any missing option with its default, so old/partial data is safe
export function cleanNotice(n = {}) {
  const out = {
    id: n.id || crypto.randomUUID?.() || String(Date.now()),
    active: n.active !== false,
    from: n.from || '', until: n.until || '',
    fullScreen: !!n.fullScreen, withDates: !!n.withDates, grow: n.grow !== false,
    box: isColour(n.box) ? n.box : NOTICE_BOXES[0].key,
  }
  NOTICE_SECTIONS.forEach(({ key }) => {
    const s = n[key] || {}, d = NOTICE_DEFAULTS[key]
    out[key] = {
      text: typeof s.text === 'string' ? s.text : '',
      size: pick(NOTICE_SIZES, s.size, d.size),
      font: pick(NOTICE_FONTS, s.font, d.font),
      color: isColour(s.color) ? s.color : d.color,
    }
  })
  return out
}

export const noticeHasText = n => NOTICE_SECTIONS.some(({ key }) => n?.[key]?.text?.trim())

// projector_thought: { notices: [...] }, or the old { gurmukhi, english,
// source } thought (+ its heading), which becomes one notice laid out as before
export function readNoticeList(thoughtText, headingsText) {
  const t = parse(thoughtText, {})
  if (Array.isArray(t.notices)) return t.notices.map(cleanNotice)
  const old = { ...EMPTY_THOUGHT, ...t }
  if (!old.gurmukhi?.trim() && !old.english?.trim()) return []
  const h = parse(headingsText, {})
  return [cleanNotice({
    id: 'thought', withDates: true,
    heading: { text: h.thought || DEFAULT_HEADINGS.thought, size: 'large' },
    main:    { text: old.gurmukhi, font: 'standard' },
    second:  { text: old.english },
    footer:  { text: old.source ? `— ${old.source}` : '' },
  })]
}

// Switched on, has text, inside its from/until dates (either may be blank)
export function showingNotices(notices, today = new Date()) {
  const t = todayISO(today)
  return (notices || []).filter(n => n.active !== false && noticeHasText(n)
    && (!n.from || n.from <= t) && (!n.until || n.until >= t))
}

// Web fonts for notices - added once, only on pages that show notices
export function loadNoticeFonts() {
  if (typeof document === 'undefined' || document.getElementById('notice-fonts')) return
  const link = document.createElement('link')
  link.id = 'notice-fonts'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Anek+Gurmukhi:wght@600;800&family=Baloo+Paaji+2:wght@600;700&family=Noto+Sans+Gurmukhi:wght@400;600;800&family=Noto+Serif+Gurmukhi:wght@600;700&display=swap'
  document.head.appendChild(link)
}

const fmt = (iso, opts) => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', opts)

// "Sat 8 Nov" or "Fri 21 – Sat 22 Nov"
export function fmtDateRange(d) {
  const day = { weekday: 'short', day: 'numeric', month: 'short' }
  if (!d.end || d.end === d.date) return fmt(d.date, day)
  const sameMonth = d.date.slice(0, 7) === d.end.slice(0, 7)
  return `${fmt(d.date, sameMonth ? { weekday: 'short', day: 'numeric' } : day)} – ${fmt(d.end, day)}`
}
