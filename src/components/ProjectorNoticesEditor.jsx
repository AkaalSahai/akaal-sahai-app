import { useEffect, useState } from 'react'
import ProjectorNoticeSlide from './ProjectorNoticeSlide'
import { NOTICE_SECTIONS, NOTICE_SIZES, NOTICE_FONTS, NOTICE_COLOURS, NOTICE_BOXES, newNotice, noticeHasText, loadNoticeFonts } from '../lib/projectorNotices'

// Settings -> Projector Screen -> Notices (14-11-2026). A list of notices,
// each its own projector slide, with a live preview laid out like the
// projector (logo bar and upcoming-dates column shown as faint placeholders).
// Saved by ProjectorSettings' Save button.

const small = { fontSize: '.73rem', color: 'var(--muted)', marginTop: 4 }
const sel = { padding: '5px 8px', fontSize: '.8rem', width: 'auto' }

function Swatches({ list, value, onChange, title }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
      {list.map(c => (
        <button key={c.key} type="button" title={c.label} aria-label={`${title}: ${c.label}`} onClick={() => onChange(c.key)}
          style={{ width: 24, height: 24, borderRadius: '50%', background: c.key, cursor: 'pointer', padding: 0,
            border: value.toLowerCase() === c.key ? '3px solid var(--primary)' : '1px solid #cbd5e1',
            boxShadow: value.toLowerCase() === c.key ? '0 0 0 2px white inset' : 'none' }} />
      ))}
      <label title="Any colour" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.72rem', color: 'var(--muted)', cursor: 'pointer' }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 30, height: 26, padding: 0, border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer' }} />
        Any colour
      </label>
    </div>
  )
}

function Preview({ notice, hasDates }) {
  const dates = notice.withDates && !notice.fullScreen && hasDates
  return (
    <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#14123f', borderRadius: 10, overflow: 'hidden',
      padding: '2% 2.5%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '2%' }}>
      {!notice.fullScreen && (
        <div style={{ flex: '0 0 20%', borderRadius: 6, border: '1px dashed #3b3880', color: '#4b4890',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem' }}>logos, date and time</div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '2.5%' }}>
        {dates && (
          <div style={{ flex: 1, borderRadius: 6, border: '1px dashed #3b3880', color: '#4b4890',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem' }}>📅 upcoming dates</div>
        )}
        <div style={{ flex: dates ? 1.4 : 1, minWidth: 0, minHeight: 0, display: 'flex' }}>
          {noticeHasText(notice)
            ? <ProjectorNoticeSlide notice={notice} />
            : <div style={{ margin: 'auto', color: '#6b6bb0', fontSize: '.8rem' }}>Type something to see the preview</div>}
        </div>
      </div>
    </div>
  )
}

function NoticeCard({ notice: n, index, count, hasDates, onChange, onMove, onDelete }) {
  // New/empty notices, or the only notice, start open for editing
  const [open, setOpen] = useState(!noticeHasText(n) || count === 1)
  const set = patch => onChange({ ...n, ...patch })
  const setSec = (key, patch) => onChange({ ...n, [key]: { ...n[key], ...patch } })
  const title = NOTICE_SECTIONS.map(({ key }) => n[key].text.trim()).find(Boolean)?.split('\n')[0] || 'New notice'

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, marginBottom: 12, background: n.active ? 'white' : '#f8fafc' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(o => !o)} style={{ minWidth: 34 }}>{open ? '▾' : '▸'}</button>
        <div style={{ flex: 1, minWidth: 120, fontWeight: 700, fontSize: '.9rem', opacity: n.active ? 1 : .55,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {index + 1}. {title}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={n.active} onChange={e => set({ active: e.target.checked })} style={{ width: 'auto', margin: 0 }} />
          Show
        </label>
        <button type="button" className="btn btn-outline btn-sm" disabled={index === 0} onClick={() => onMove(-1)} title="Move up">↑</button>
        <button type="button" className="btn btn-outline btn-sm" disabled={index === count - 1} onClick={() => onMove(1)} title="Move down">↓</button>
        <button type="button" className="btn btn-outline btn-sm" title="Delete notice"
          onClick={() => { if (!noticeHasText(n) || confirm(`Delete notice "${title}"?`)) onDelete() }}>✕</button>
      </div>

      {open && (
        <div style={{ padding: '0 12px 12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 16 }} className="notice-edit-grid">
            <div>
              {NOTICE_SECTIONS.map(({ key, label, hint }) => (
                <div key={key} className="form-group" style={{ marginBottom: 12 }}>
                  <label>{label}</label>
                  <textarea value={n[key].text} placeholder={hint} maxLength={600}
                    rows={key === 'main' || key === 'second' ? 3 : 1}
                    style={{ minHeight: key === 'main' || key === 'second' ? 60 : 38, fontSize: '1rem' }}
                    onChange={e => setSec(key, { text: e.target.value })} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select value={n[key].size} onChange={e => setSec(key, { size: e.target.value })} style={sel} title="Size">
                      {NOTICE_SIZES.map(s => <option key={s.key} value={s.key}>Size: {s.label}</option>)}
                    </select>
                    <select value={n[key].font} onChange={e => setSec(key, { font: e.target.value })} style={sel} title="Font">
                      {NOTICE_FONTS.map(f => <option key={f.key} value={f.key}>Font: {f.label}</option>)}
                    </select>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <Swatches list={NOTICE_COLOURS} value={n[key].color} title={`${label} colour`} onChange={c => setSec(key, { color: c })} />
                  </div>
                </div>
              ))}

              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Box colour</label>
                <Swatches list={NOTICE_BOXES} value={n.box} title="Box colour" onChange={c => set({ box: c })} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '.83rem' }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={n.grow} onChange={e => set({ grow: e.target.checked })} style={{ width: 'auto', margin: 0 }} />
                  Make the text as big as fits the screen
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={n.fullScreen} onChange={e => set({ fullScreen: e.target.checked })} style={{ width: 'auto', margin: 0 }} />
                  Full screen (hide the logos, date and time)
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: n.fullScreen ? 'default' : 'pointer', opacity: n.fullScreen ? .5 : 1 }}>
                  <input type="checkbox" checked={n.withDates && !n.fullScreen} disabled={n.fullScreen}
                    onChange={e => set({ withDates: e.target.checked })} style={{ width: 'auto', margin: 0 }} />
                  Show upcoming dates beside it
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '.75rem', fontWeight: 600 }}>Show from</div>
                  <input type="date" value={n.from} onChange={e => set({ from: e.target.value })} style={{ width: 150 }} />
                </div>
                <div>
                  <div style={{ fontSize: '.75rem', fontWeight: 600 }}>Until</div>
                  <input type="date" value={n.until} min={n.from || undefined} onChange={e => set({ until: e.target.value })} style={{ width: 150 }} />
                </div>
              </div>
              <div style={small}>Both dates are optional. A notice with an "until" date drops off the screen by itself after that day.</div>
            </div>

            <div>
              <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>PREVIEW</div>
              <div style={{ position: 'sticky', top: 10 }}>
                <Preview notice={n} hasDates={hasDates} />
                <div style={small}>Laid out exactly like the projector. Dashed boxes stand for the logos and the dates.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjectorNoticesEditor({ notices, onChange, hasDates }) {
  useEffect(() => { loadNoticeFonts() }, [])
  const update = (i, n) => onChange(notices.map((x, j) => j === i ? n : x))
  const move = (i, d) => {
    const next = notices.slice()
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <div style={{ marginBottom: 16 }}>
      {notices.length === 0 && <div style={{ ...small, marginBottom: 10 }}>No notices yet.</div>}
      {notices.map((n, i) => (
        <NoticeCard key={n.id} notice={n} index={i} count={notices.length} hasDates={hasDates}
          onChange={x => update(i, x)} onMove={d => move(i, d)}
          onDelete={() => onChange(notices.filter((_, j) => j !== i))} />
      ))}
      <button type="button" className="btn btn-outline btn-sm" onClick={() => onChange([...notices, newNotice()])}>+ Add notice</button>
      <div style={small}>
        Each notice is its own slide on the projector, in this order. A notice shows as soon as any part has text - in any language.
      </div>
      <style>{`@media (max-width: 760px) { .notice-edit-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  )
}
