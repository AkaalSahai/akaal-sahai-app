import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { logAction } from '../lib/audit'
import { PROJECTOR_KEYS, DEFAULT_HEADINGS, readNotices, upcomingDates } from '../lib/projectorNotices'

// Settings -> Projector Screen: what the projector's Notices slide shows.
// The slide is skipped while both are empty.
export default function ProjectorSettings() {
  const { profile } = useAuth()
  const [dates, setDates]     = useState([])
  const [thought, setThought] = useState(null)
  const [headings, setHeadings] = useState({ dates: '', thought: '' })
  const [busy, setBusy]       = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    supabase.from('site_settings').select('key, value').in('key', PROJECTOR_KEYS).then(({ data }) => {
      const n = readNotices(Object.fromEntries((data || []).map(r => [r.key, r.value])))
      setDates(n.dates)
      setThought(n.thought)
      setHeadings(n.headings)
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
    setBusy(true)
    const { error } = await supabase.from('site_settings').upsert([
      { key: 'projector_dates', value: JSON.stringify(clean) },
      { key: 'projector_thought', value: JSON.stringify(t) },
      { key: 'projector_headings', value: JSON.stringify(h) },
    ])
    setBusy(false)
    if (error) { alert('Save failed: ' + error.message); return }
    logAction(profile, 'Updated projector notices', `${clean.length} date${clean.length === 1 ? '' : 's'}; thought ${t.gurmukhi || t.english ? 'set' : 'empty'}`).catch(() => {})
    setDates(clean)
    setThought(t)
    setHeadings(h)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const small = { fontSize: '.73rem', color: 'var(--muted)', marginTop: 4 }

  return (
    <div className="card" style={{ marginTop: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>Projector Screen</div>
        <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>
          The Notices slide. Everyone in the hall sees it - parents, children and visitors - so keep it general.
        </div>
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
