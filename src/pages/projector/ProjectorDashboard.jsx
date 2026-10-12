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

export default function ProjectorDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    load()
    const poll = setInterval(load, 30000)
    const clock = setInterval(() => setNow(new Date()), 1000)
    return () => { clearInterval(poll); clearInterval(clock) }
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
    boxSizing: 'border-box',
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
  const notSubmitted = groups.filter(g => !g.submitted)
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

  return (
    <div style={page}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f0a500' }}>Akaal Sahai Southall</div>
          <div style={{ fontSize: '1rem', color: '#a5b4fc', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
            {isToday ? (
              <span style={{ background: '#dc2626', color: 'white', fontWeight: 700, fontSize: '.75rem',
                padding: '2px 10px', borderRadius: 99 }}>● LIVE</span>
            ) : (
              <span style={{ color: '#a5b4fc', fontSize: '.9rem' }}>Last session: {sectionLabel}</span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div style={{ fontSize: '1rem', color: '#a5b4fc' }}>
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      </div>

      {!hasSession ? (
        <div style={{ textAlign: 'center', marginTop: 140, fontSize: '1.6rem', color: '#a5b4fc' }}>
          No Punjabi class sessions recorded yet
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24 }}>
          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Submission progress */}
            <div style={{ background: '#1e1a6e', borderRadius: 16, padding: '20px 26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#c7d2fe' }}>
                  Registers Submitted {!isToday && <span style={{ fontWeight: 400, color: '#a5b4fc' }}>({sectionLabel})</span>}
                </span>
                <span style={{ fontSize: '1.6rem', fontWeight: 800 }}>{totals.submitted} / {groups.length}</span>
              </div>
              <div style={{ background: '#2d2a66', borderRadius: 99, height: 14, overflow: 'hidden' }}>
                <div style={{ width: `${groups.length ? (totals.submitted / groups.length) * 100 : 0}%`,
                  height: '100%', background: '#f0a500', borderRadius: 99, transition: 'width .4s' }} />
              </div>
            </div>

            {/* Not started */}
            <div style={{ background: '#1e1a6e', borderRadius: 16, padding: '20px 26px', flex: 1 }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fca5a5', marginBottom: 14 }}>
                ⚠ {isToday ? 'Not Submitted Yet' : 'Didn’t Submit'} {notSubmitted.length > 0 && `(${notSubmitted.length})`}
              </div>
              {notSubmitted.length === 0 ? (
                <div style={{ fontSize: '1.3rem', color: '#86efac', fontWeight: 700, padding: '20px 0', textAlign: 'center' }}>
                  ✓ Every group has submitted!
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
                  {notSubmitted.map(g => (
                    <div key={g.id} style={{ background: '#450a0a', border: '1px solid #7f1d1d', borderRadius: 10,
                      padding: '10px 14px', fontSize: '1.05rem', fontWeight: 700, color: '#fecaca' }}>
                      {g.name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live just-submitted feed */}
            <div style={{ background: '#1e1a6e', borderRadius: 16, padding: '20px 26px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#c7d2fe', marginBottom: 12 }}>
                {isToday ? '🔴 Live Activity' : 'Submission Order'}
              </div>
              {(data.recent || []).length === 0 ? (
                <div style={{ color: '#a5b4fc', fontSize: '.95rem' }}>No registers started</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data.recent.slice(0, 6).map((r, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
                      fontSize: '1rem', borderBottom: i < 5 ? '1px solid #2d2a66' : 'none', paddingBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ color: '#a5b4fc' }}>
                        {isToday ? timeAgo(r.created_at) : new Date(r.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Tracker ring */}
            <div style={{ background: '#1e1a6e', borderRadius: 16, padding: '24px 26px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#c7d2fe', marginBottom: 16 }}>
                {isToday ? 'Live Tracker' : 'Tracker'}
              </div>
              <div style={{ position: 'relative', width: 180, height: 180, margin: '0 auto 16px', borderRadius: '50%', background: ringBg }}>
                <div style={{ position: 'absolute', inset: 14, borderRadius: '50%', background: '#1e1a6e',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800 }}>{attendedPct !== null ? `${attendedPct}%` : '—'}</div>
                  <div style={{ fontSize: '.78rem', color: '#a5b4fc' }}>attendance</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap', fontSize: '.95rem', fontWeight: 700 }}>
                <span style={{ color: '#4ade80' }}>● {totals.present} Present</span>
                <span style={{ color: '#fbbf24' }}>● {totals.late} Late</span>
                <span style={{ color: '#f87171' }}>● {totals.absent} Absent</span>
                {totals.holiday > 0 && <span style={{ color: '#38bdf8' }}>● {totals.holiday} Holiday</span>}
              </div>
              <div style={{ marginTop: 14, fontSize: '1rem', color: '#a5b4fc' }}>
                {marked} of {totals.total} students marked
              </div>
            </div>

            {/* Top 5 */}
            <div style={{ background: '#1e1a6e', borderRadius: 16, padding: '20px 26px', flex: 1 }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#c7d2fe', marginBottom: 14 }}>
                🏆 Top 5 — Higher Attendance Group
              </div>
              {(data.top5 || []).length === 0 ? (
                <div style={{ color: '#a5b4fc', fontSize: '.95rem' }}>Not enough data yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.top5.map((g, i) => (
                    <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 12,
                      background: i === 0 ? '#2d2a66' : 'transparent', borderRadius: 10, padding: '8px 12px' }}>
                      <span style={{ fontSize: '1.4rem', width: 32 }}>{MEDALS[i] || `${i + 1}.`}</span>
                      <span style={{ flex: 1, fontSize: '1.15rem', fontWeight: 700 }}>{g.name}</span>
                      <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f0a500' }}>{g.high_count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
