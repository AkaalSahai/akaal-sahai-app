import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction } from '../lib/audit'
import { PROJECTOR_KEYS, DEFAULT_HEADINGS, DEFAULT_TIMINGS, SLIDE_TYPES, MIN_SECS, MAX_SECS, MAX_VIDEO_MINS, readNotices, upcomingDates } from '../lib/projectorNotices'

// Settings -> Projector Screen: slide timings / which slides show, and what
// the Notices slide says (skipped while dates and thought are both empty).
export default function ProjectorSettings() {
  const { profile } = useAuth()
  const [dates, setDates]     = useState([])
  const [thought, setThought] = useState(null)
  const [headings, setHeadings] = useState({ dates: '', thought: '' })
  const [timings, setTimings] = useState(DEFAULT_TIMINGS)
  const [busy, setBusy]       = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    supabase.from('site_settings').select('key, value').in('key', PROJECTOR_KEYS).then(({ data }) => {
      const n = readNotices(Object.fromEntries((data || []).map(r => [r.key, r.value])))
      setDates(n.dates)
      setThought(n.thought)
      setHeadings(n.headings)
      setTimings(n.timings)
    })
  }, [])

  if (!thought) return null

  const changed = () => setSaved(false)
  const setDate = (i, k, v) => { setDates(ds => ds.map((d, j) => j === i ? { ...d, [k]: v } : d)); changed() }
  const showing = upcomingDates(dates).length

  async function save() {
    const clean = dates.filter(d => d.date && d.title?.trim())
      .map(d => ({ date: d.date, end: d.end && d.end > d.date ? d.end : '', title: d.title.trim() }))
      .sort((a, b) => a.date.localeCompare(b.date))
    const t = { gurmukhi: thought.gurmukhi.trim(), english: thought.english.trim(), source: thought.source.trim() }
    const h = { dates: headings.dates.trim(), thought: headings.thought.trim() }
    const secs = (v, d) => Math.min(MAX_SECS, Math.max(MIN_SECS, Math.round(Number(v)) || d))
    const tm = { holdSecs: secs(timings.holdSecs, DEFAULT_TIMINGS.holdSecs) }
    SLIDE_TYPES.forEach(({ key }) => { tm[key] = { secs: secs(timings[key].secs, 14), show: timings[key].show } })
    const mins = Math.round(Number(timings.video.maxMins))
    tm.video.maxMins = mins > 0 ? Math.min(MAX_VIDEO_MINS, mins) : 0
    setBusy(true)
    const { error } = await supabase.from('site_settings').upsert([
      { key: 'projector_dates', value: JSON.stringify(clean) },
      { key: 'projector_thought', value: JSON.stringify(t) },
      { key: 'projector_headings', value: JSON.stringify(h) },
      { key: 'projector_timings', value: JSON.stringify(tm) },
    ])
    setBusy(false)
    if (error) { alert('Save failed: ' + error.message); return }
    const hidden = SLIDE_TYPES.filter(({ key }) => !tm[key].show).map(({ key }) => key)
    logAction(profile, 'Updated projector screen', `${clean.length} date${clean.length === 1 ? '' : 's'}; thought ${t.gurmukhi || t.english ? 'set' : 'empty'}; hidden slides: ${hidden.join(', ') || 'none'}`).catch(() => {})
    setDates(clean)
    setThought(t)
    setHeadings(h)
    setTimings(tm)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const small = { fontSize: '.73rem', color: 'var(--muted)', marginTop: 4 }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>Projector Screen</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>
          Slide timings and the Notices slide. Everyone in the hall sees the projector - parents, children and visitors - so keep it general.
        </div>
      </div>

      <div className="section-label">Slide Timings</div>
      <table style={{ width: '100%', fontSize: '.85rem', marginBottom: 6, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ fontSize: '.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
            <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 700 }}>Slide</th>
            <th style={{ textAlign: 'center', padding: 4, fontWeight: 700 }}>Show</th>
            <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 700 }}>Seconds</th>
          </tr>
        </thead>
        <tbody>
          {SLIDE_TYPES.map(({ key, label }) => (
            <tr key={key} style={{ borderTop: '1px solid var(--border)', opacity: timings[key].show ? 1 : .55 }}>
              <td style={{ padding: '6px 0' }}>{label}</td>
              <td style={{ textAlign: 'center' }}>
                <input type="checkbox" checked={timings[key].show} style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                  onChange={e => { setTimings(t => ({ ...t, [key]: { ...t[key], show: e.target.checked } })); changed() }} />
              </td>
              <td style={{ textAlign: 'right' }}>
                {key === 'video' ? (
                  // Videos play to the end; optionally cut off after this many minutes
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.75rem', color: 'var(--muted)' }}>
                    Longest play (minutes)
                    <input type="number" min={0} max={MAX_VIDEO_MINS} value={timings.video.maxMins || ''} placeholder="Whole video"
                      disabled={!timings.video.show}
                      onChange={e => { setTimings(t => ({ ...t, video: { ...t.video, maxMins: e.target.value } })); changed() }}
                      style={{ width: 110, padding: '4px 8px', textAlign: 'right' }} />
                  </label>
                ) : (
                  <input type="number" min={MIN_SECS} max={MAX_SECS} value={timings[key].secs} disabled={!timings[key].show}
                    onChange={e => { setTimings(t => ({ ...t, [key]: { ...t[key], secs: e.target.value } })); changed() }}
                    style={{ width: 80, padding: '4px 8px', textAlign: 'right' }} />
                )}
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid var(--border)' }}>
            <td style={{ padding: '6px 0' }} colSpan={2}>After tapping a dot, stay for</td>
            <td style={{ textAlign: 'right' }}>
              <input type="number" min={MIN_SECS} max={MAX_SECS} value={timings.holdSecs}
                onChange={e => { setTimings(t => ({ ...t, holdSecs: e.target.value })); changed() }}
                style={{ width: 80, padding: '4px 8px', textAlign: 'right' }} />
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ ...small, marginBottom: 16 }}>
        {MIN_SECS}–{MAX_SECS} seconds. Notices and picture slides only appear when they have something to show.
        Videos come from a folder on the projector laptop - click 🎬 Videos in the bottom-left corner of the projector
        screen to choose it. Each video plays to the end unless a longest play time is set.
        If every slide is switched off, Registers Pending still shows.
      </div>

      <div className="section-label">Upcoming Dates</div>
      <div className="form-group">
        <label>Heading on screen</label>
        <input type="text" value={headings.dates} placeholder={DEFAULT_HEADINGS.dates} maxLength={40}
          onChange={e => { setHeadings(h => ({ ...h, dates: e.target.value })); changed() }} />
      </div>
      {dates.length === 0 && <div style={{ ...small, marginBottom: 10 }}>No dates yet.</div>}
      {dates.map((d, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}
          className="projector-date-row">
          <input type="date" value={d.date} onChange={e => setDate(i, 'date', e.target.value)} title="Date" />
          <input type="date" value={d.end || ''} min={d.date} onChange={e => setDate(i, 'end', e.target.value)} title="Until (optional)" />
          <input type="text" value={d.title} placeholder="e.g. Bandi Chhor Divas programme" maxLength={80}
            onChange={e => setDate(i, 'title', e.target.value)} />
          <button className="btn btn-outline btn-sm" title="Remove"
            onClick={() => { setDates(ds => ds.filter((_, j) => j !== i)); changed() }}>✕</button>
        </div>
      ))}
      <button className="btn btn-outline btn-sm" onClick={() => { setDates(ds => [...ds, { date: '', end: '', title: '' }]); changed() }}>
        + Add date
      </button>
      <div style={{ ...small, marginBottom: 16 }}>
        Second date is optional ("until", e.g. half term). Past dates drop off the screen by themselves.
        {' '}{showing} showing now (up to 6 at a time).
      </div>

      <div className="section-label">Thought of the Week</div>
      <div className="form-group">
        <label>Heading on screen</label>
        <input type="text" value={headings.thought} placeholder={DEFAULT_HEADINGS.thought} maxLength={40}
          onChange={e => { setHeadings(h => ({ ...h, thought: e.target.value })); changed() }} />
        <div style={{ fontSize: '.73rem', color: 'var(--muted)', marginTop: 4 }}>Leave blank for "{DEFAULT_HEADINGS.thought}". Gurmukhi works here too.</div>
      </div>
      <div className="form-group">
        <label>Gurmukhi</label>
        <textarea value={thought.gurmukhi} style={{ minHeight: 60, fontSize: '1.05rem' }} maxLength={300}
          onChange={e => { setThought(t => ({ ...t, gurmukhi: e.target.value })); changed() }} />
      </div>
      <div className="form-group">
        <label>English meaning</label>
        <textarea value={thought.english} style={{ minHeight: 60 }} maxLength={300}
          onChange={e => { setThought(t => ({ ...t, english: e.target.value })); changed() }} />
      </div>
      <div className="form-group">
        <label>Source (optional)</label>
        <input type="text" value={thought.source} placeholder="e.g. Sri Guru Granth Sahib Ji, Ang 1" maxLength={80}
          onChange={e => { setThought(t => ({ ...t, source: e.target.value })); changed() }} />
        <div style={small}>Leave Gurmukhi and English empty to hide the thought.</div>
      </div>

      <button className="btn btn-primary" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : saved ? '✓ Saved' : 'Save Projector Screen'}
      </button>
      <style>{`@media (max-width: 600px) { .projector-date-row { grid-template-columns: 1fr 1fr !important; } }`}</style>
    </div>
  )
}
