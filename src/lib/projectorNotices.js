import { supabase } from './supabase'

// Upcoming dates and Thought of the week for the projector's Notices slide
// (agreed 06-11-2026). Kept in site_settings as JSON text, typed by admins on
// Settings -> Projector Screen. Everyone in the room sees the projector, so
// these are general notices only - never anything about one child.
//   projector_dates   - [{ date: 'YYYY-MM-DD', end: 'YYYY-MM-DD' | '', title }]
//   projector_thought - { gurmukhi, english, source }
//   projector_headings - { dates, thought } - blank means the default
//   projector_images  - [{ id, path, caption, from, until, active }] - files in
//                       the projector-images storage bucket, in slide order
//   projector_images_per_slide - '1' | '2' | '3' | '4' | '6'

export const PROJECTOR_KEYS = ['projector_dates', 'projector_thought', 'projector_headings',
  'projector_images', 'projector_images_per_slide']

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
  }
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

// Pictures grouped into slides, perSlide at a time, in order
export function imageSlides(images, perSlide) {
  const shown = showingImages(images)
  const slides = []
  for (let i = 0; i < shown.length; i += perSlide) slides.push(shown.slice(i, i + perSlide))
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
