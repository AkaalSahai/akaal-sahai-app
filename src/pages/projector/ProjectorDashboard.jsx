import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  return `${Math.floor(diff / 60)}h ago`
}

function fmtTargetDate(dateStr) {
  if (!dateStr) return null
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

const MEDALS = ['🥇', '🥈', '🥉']

// Three scenes so a projector viewed from across a room only ever has to
// read one focused thing at a time, instead of six cards competing at once.
const SCENE_COUNT = 3
const SCENE_MS = 14000

export default function ProjectorDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(new Date())
  const [scene, setScene] = useState(0)

  useEffect(() => {
    load()
    const poll = setInterval(load, 30000)
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => { clearInterval(poll); clearInterval(clock) }
  }, [])

  useEffect(() => {
    const rotate = setInterval(() => setScene(s => (s + 1) % SCENE_COUNT), SCENE_MS)
    return () => clearInterval(rotate)
  }, [])

  async function load() {
    const { data: stats, error } = await supabase.rpc('get_projector_dashboard_stats')
    if (error) { setError(error.message); return }
    setError(null)
    setData(stats)
  }

  const page = {
    minHeight: '100vh', background: '#14123f', color: 'white',
    fontFamily: 'system-ui, -apple-system, sans-serif', padding: '28px 40px',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
  }

  if (error) return (
    <div style={page}>
      <div style={{ fontSize: '1.4rem', color: '#fca5a5', textAlign: 'center', marginTop: 160 }}>
        Couldn't load dashboard — {error}
      </div>
    </div>
  )

  if (!data) return (
    <div style={page}>
      <div style={{ textAlign: 'center', marginTop: 200, fontSize: '1.4rem', color: '#a5b4fc' }}>
        Loading…
      </div>
    </div>
  )

  const groups = data.groups || []
  const verifiedStudents = data.verified_students || null
  // "Pending" means genuinely untouched - a group a teacher has already
  // started marking isn't flagged here even before they hit Submit.
  const pending = groups.filter(g => !g.started)
  const totals = groups.reduce((a, g) => ({
    total:   a.total   + g.total_students,
    present: a.present + g.present,
    late:    a.late    + g.late,
    absent:  a.absent  + g.absent,
    holiday: a.holiday + g.holiday,
    submitted: a.submitted + (g.submitted ? 1 : 0),
  }), { total: 0, present: 0, late: 0, absent: 0, holiday: 0, submitted: 0 })
  const marked = totals.present + totals.late + totals.absent + totals.holiday
  const attendedPct = marked > 0 ? Math.round(((totals.present + totals.late) / marked) * 100) : null

  // Conic-gradient ring for the present/late/absent/holiday split - same
  // technique as the group health cards on the admin Dashboard.
  let ringStops = [], acc = 0
  ;[['#16a34a', totals.present], ['#d97706', totals.late], ['#dc2626', totals.absent], ['#0284c7', totals.holiday]].forEach(([color, count]) => {
    if (count === 0) return
    const start = acc
    acc += (count / Math.max(marked, 1)) * 360
    ringStops.push(`${color} ${start}deg ${acc}deg`)
  })
  const ringBg = marked > 0 ? `conic-gradient(${ringStops.join(',')})` : 'conic-gradient(#2d2a66 0 360deg)'

  const isToday = data.is_today
  const hasSession = !!data.target_date
  const sectionLabel = isToday ? 'Today' : fmtTargetDate(data.target_date) || 'No sessions recorded yet'
  const recent = data.recent || []
  const manyMissing = pending.length > 14

  return (
    <div style={page}>
      <style>{`
        @keyframes projFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .proj-scene { animation: projFade .6s ease; }
        @media (prefers-reduced-motion: reduce) { .proj-scene { animation: none !important; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '2.6rem', fontWeight: 800, color: '#f0a500' }}>Akaal Sahai Southall</div>
          <div style={{ fontSize: '1.15rem', color: '#a5b4fc', marginTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
            {isToday ? (
              <span style={{ background: '#dc2626', color: 'white', fontWeight: 700, fontSize: '.95rem',
                padding: '3px 13px', borderRadius: 99 }}>● LIVE</span>
            ) : (
              <span style={{ color: '#a5b4fc', fontSize: '1.05rem' }}>Last session: {sectionLabel}</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '2.8rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ fontSize: '1.15rem', color: '#a5b4fc' }}>
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {!hasSession ? (
        <div style={{ textAlign: 'center', marginTop: 140, fontSize: '1.6rem', color: '#a5b4fc' }}>
          No Punjabi class sessions recorded yet
        </div>
      ) : (
        <>
          <div key={scene} className="proj-scene" style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 34, minHeight: 0 }}>

            {scene === 0 && (
              <>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#c7d2fe' }}>
                    Registers Submitted {!isToday && <span style={{ fontWeight: 400, color: '#a5b4fc' }}>({sectionLabel})</span>}
                  </div>
                  <div style={{ fontSize: '6.6rem', fontWeight: 800, lineHeight: 1, margin: '10px 0' }}>
                    {totals.submitted} / {groups.length}
                  </div>
                  <div style={{ width: 'min(640px, 75vw)', background: '#2d2a66', borderRadius: 99, height: 26, overflow: 'hidden', margin: '0 auto' }}>
                    <div style={{ width: `${groups.length ? (totals.submitted / groups.length) * 100 : 0}%`,
                      height: '100%', background: '#f0a500', borderRadius: 99, transition: 'width .4s' }} />
                  </div>
                </div>

                <div style={{ width: '100%', maxWidth: 1100 }}>
                  <div style={{ fontSize: '1.7rem', fontWeight: 700, color: '#fca5a5', marginBottom: 18, textAlign: 'center' }}>
                    ⚠ {isToday ? 'Registers Pending' : 'Didn’t Submit'} {pending.length > 0 && `(${pending.length})`}
                  </div>
                  {pending.length === 0 ? (
                    <div style={{ fontSize: '2.2rem', color: '#86efac', fontWeight: 700, textAlign: 'center', padding: '10px 0' }}>
                      ✓ Every group has started!
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${manyMissing ? 190 : 260}px, 1fr))`, gap: manyMissing ? 12 : 16 }}>
                      {pending.map(g => (
                        <div key={g.id} style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 14,
                          padding: manyMissing ? '12px 16px' : '16px 22px', fontSize: manyMissing ? '1.3rem' : '1.7rem',
                          fontWeight: 700, color: '#fecaca', textAlign: 'center' }}>
                          {g.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {recent.length > 0 && (
                  <div style={{ fontSize: '1.3rem', color: '#a5b4fc' }}>
                    {isToday ? '🔴 ' : ''}Last started: <strong style={{ color: 'white' }}>{recent[0].name}</strong>
                    {' · '}
                    {isToday ? timeAgo(recent[0].created_at) : new Date(recent[0].created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </>
            )}

            {scene === 1 && (
              <>
                <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#c7d2fe' }}>{isToday ? 'Live Tracker' : 'Tracker'}</div>
                <div style={{ position: 'relative', width: 380, height: 380, borderRadius: '50%', background: ringBg }}>
                  <div style={{ position: 'absolute', inset: 30, borderRadius: '50%', background: '#14123f',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '5.2rem', fontWeight: 800, lineHeight: 1 }}>{attendedPct !== null ? `${attendedPct}%` : '—'}</div>
                    <div style={{ fontSize: '1.2rem', color: '#a5b4fc' }}>attendance</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', justifyContent: 'center', fontSize: '1.7rem', fontWeight: 700 }}>
                  <span style={{ color: '#4ade80' }}>● {totals.present} Present</span>
                  <span style={{ color: '#fbbf24' }}>● {totals.late} Late</span>
                  <span style={{ color: '#f87171' }}>● {totals.absent} Absent</span>
                  {totals.holiday > 0 && <span style={{ color: '#38bdf8' }}>● {totals.holiday} Holiday</span>}
                </div>
                <div style={{ fontSize: '1.5rem', color: '#a5b4fc' }}>{marked} of {totals.total} students marked</div>
              </>
            )}

            {scene === 2 && (
              <>
                <div style={{ width: '100%', maxWidth: 900 }}>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#c7d2fe', marginBottom: 22, textAlign: 'center' }}>
                    🏆 Top 5 — Higher Attendance Group
                  </div>
                  {(data.top5 || []).length === 0 ? (
                    <div style={{ color: '#a5b4fc', fontSize: '1.4rem', textAlign: 'center' }}>Not enough data yet</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {data.top5.map((g, i) => (
                        <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 22,
                          background: i === 0 ? '#1e1a6e' : 'transparent', border: i === 0 ? 'none' : '1px solid #2d2a66',
                          borderRadius: 16, padding: '18px 26px' }}>
                          <span style={{ fontSize: '2.5rem', width: 56, textAlign: 'center' }}>{MEDALS[i] || `${i + 1}.`}</span>
                          <span style={{ flex: 1, fontSize: '1.85rem', fontWeight: 700 }}>{g.name}</span>
                          <span style={{ fontSize: '2.1rem', fontWeight: 800, color: '#f0a500' }}>{g.high_count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {verifiedStudents && (
                  <div style={{ width: '100%', maxWidth: 600, textAlign: 'center' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#c7d2fe', marginBottom: 10 }}>Students Verified</div>
                    <div style={{ fontSize: '3.2rem', fontWeight: 800, marginBottom: 12 }}>{verifiedStudents.verified} / {verifiedStudents.total}</div>
                    <div style={{ background: '#2d2a66', borderRadius: 99, height: 22, overflow: 'hidden' }}>
                      <div style={{ width: `${verifiedStudents.total ? (verifiedStudents.verified / verifiedStudents.total) * 100 : 0}%`,
                        height: '100%', background: '#38bdf8', borderRadius: 99, transition: 'width .4s' }} />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingTop: 16, flexShrink: 0 }}>
            {Array.from({ length: SCENE_COUNT }).map((_, i) => (
              <span key={i} style={{ width: 11, height: 11, borderRadius: '50%',
                background: i === scene ? '#f0a500' : '#302d6e', transition: 'background .3s' }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
