import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

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

// Kept faint in the corner so it doesn't distract on the projector, but
// always reachable - including on the loading and error screens.
function LogoutButton() {
  const { logout } = useAuth()
  const [busy, setBusy] = useState(false)
  async function handleClick() {
    if (!confirm('Log out of the projector dashboard?')) return
    setBusy(true)
    try { await logout() } finally { setBusy(false) }
  }
  return (
    <button onClick={handleClick} disabled={busy} className="proj-logout"
      style={{ position: 'fixed', right: 16, bottom: 14, zIndex: 10, padding: '7px 14px', borderRadius: 8,
        border: '1px solid #3b3880', background: 'rgba(20,18,63,.85)', color: '#a5b4fc',
        fontSize: '.85rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
      {busy ? 'Logging out…' : 'Log out'}
    </button>
  )
}

const LOGOUT_CSS = `
  .proj-logout { opacity: .35; transition: opacity .2s; }
  .proj-logout:hover, .proj-logout:focus-visible { opacity: 1; }
`

export default function ProjectorDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(new Date())
  const [scene, setScene] = useState(0)
  const [seva, setSeva] = useState(null)

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
    const [{ data: stats, error }, { data: sevaData, error: sevaError }] = await Promise.all([
      supabase.rpc('get_projector_dashboard_stats'),
      supabase.rpc('get_projector_seva'),
    ])
    if (error) { setError(error.message); return }
    setError(null)
    setData(stats)
    // Seva is a separate slide - a problem loading it mustn't blank the rest
    setSeva(sevaError ? null : sevaData)
  }

  const page = {
    height: '100vh', overflow: 'hidden', background: '#14123f', color: 'white',
    fontFamily: 'system-ui, -apple-system, sans-serif', padding: '2vh 2.5vw',
    boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
  }

  if (error) return (
    <div style={page}>
      <div style={{ fontSize: '1.4rem', color: '#fca5a5', textAlign: 'center', marginTop: 160 }}>
        Couldn't load dashboard — {error}
      </div>
      <style>{LOGOUT_CSS}</style>
      <LogoutButton />
    </div>
  )

  if (!data) return (
    <div style={page}>
      <div style={{ textAlign: 'center', marginTop: 200, fontSize: '1.4rem', color: '#a5b4fc' }}>
        Loading…
      </div>
      <style>{LOGOUT_CSS}</style>
      <LogoutButton />
    </div>
  )

  const groups = data.groups || []
  const verifiedStudents = data.verified_students || null
  // "Pending" means genuinely untouched - a group a teacher has already
  // started marking isn't flagged here even before they hit Submit.
  const pending = groups.filter(g => !g.started)
  const isToday = data.is_today
  const hasSession = !!data.target_date
  const sectionLabel = isToday ? 'Today' : fmtTargetDate(data.target_date) || 'No sessions recorded yet'
  const recent = data.recent || []
  const manyMissing = pending.length > 14
  // Start of class: nearly every group is pending - smaller cards so all fit
  const hugeMissing = pending.length > 24

  // Sizes follow the screen so text fills a projector at any resolution
  const vw = n => `${n}vw`
  const fmtDay = iso => new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const sevaDays = seva?.days || []
  const sevaToday = seva?.today_is_class_day ? sevaDays[0] : null
  const sevaNext = seva?.today_is_class_day ? sevaDays.slice(1) : sevaDays

  // One look across every slide: gold headings, navy cards with gold borders,
  // white main text and a yellow second line.
  const GOLD = '#f0a500', YELLOW = '#fcd34d', CARD_BG = '#1e1a6e'
  const card = extra => ({ background: CARD_BG, border: `2px solid ${GOLD}`, borderRadius: 22, ...extra })
  const Heading = ({ children, size = 2.6 }) => (
    <div style={{ fontSize: vw(size), fontWeight: 800, color: GOLD, textAlign: 'center', lineHeight: 1.15, flexShrink: 0 }}>{children}</div>
  )
  const Bar = ({ pct }) => (
    <div style={{ width: '100%', background: '#14123f', border: `2px solid ${GOLD}`, borderRadius: 99, height: '3.2vh', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: GOLD, borderRadius: 99, transition: 'width .4s' }} />
    </div>
  )
  const SevaCard = ({ g, big }) => (
    <div style={card({ flex: 1, minWidth: 0, padding: big ? '2vh 1.6vw' : '1.2vh 1.2vw', textAlign: 'center',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.6vh' })}>
      <div style={{ fontSize: vw(big ? 3.2 : 2.2), fontWeight: 800, lineHeight: 1.1 }}>{g.group}</div>
      {g.teacher && <div style={{ fontSize: vw(big ? 2 : 1.5), color: YELLOW, fontWeight: 600 }}>{g.teacher}</div>}
    </div>
  )

  return (
    <div style={page}>
      <style>{`
        @keyframes projFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .proj-scene { animation: projFade .6s ease; }
        @media (prefers-reduced-motion: reduce) { .proj-scene { animation: none !important; } }
        ${LOGOUT_CSS}
      `}</style>
      <LogoutButton />

      {/* Header - both logos on every slide */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: '2vw', flexShrink: 0, marginBottom: '2.5vh' }}>
        <div style={{ justifySelf: 'start' }}>
          <img src="/logo-akaal-sahai-light.png" alt="Akaal Sahai Southall" style={{ height: '20vh', display: 'block' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: vw(3.6), fontWeight: 800, color: '#f0a500', lineHeight: 1.1 }}>Akaal Sahai Southall</div>
          <div style={{ fontSize: vw(2.2), fontWeight: 700, marginTop: '0.6vh', fontVariantNumeric: 'tabular-nums' }}>
            {now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            <span style={{ color: '#a5b4fc', margin: '0 0.8vw' }}>·</span>
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          {!isToday && hasSession && (
            <div style={{ fontSize: vw(1.4), color: '#a5b4fc', marginTop: '0.4vh' }}>Last session: {sectionLabel}</div>
          )}
        </div>
        <div style={{ justifySelf: 'end' }}>
          <img src="/logo-karam-ishersar-white.png" alt="Karam Ishersar" style={{ height: '17vh', display: 'block' }} />
        </div>
      </div>

      <div key={scene} className="proj-scene" style={{ flex: 1, display: 'flex', flexDirection: 'column',
        gap: '1.8vh', minHeight: 0, width: '100%' }}>

        {scene === 0 && (!hasSession ? (
          <div style={{ margin: 'auto', fontSize: vw(3), color: '#a5b4fc' }}>No Punjabi class sessions recorded yet</div>
        ) : (
          <>
            <Heading>⚠ {isToday ? 'Registers Pending' : 'Didn’t Submit'} {pending.length > 0 && `(${pending.length})`}</Heading>
            {pending.length === 0 ? (
              <div style={card({ padding: '2vh', textAlign: 'center', fontSize: vw(3), fontWeight: 800 })}>
                ✓ Every group has started!
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, display: 'grid', alignContent: 'start',
                gridTemplateColumns: `repeat(auto-fill, minmax(${hugeMissing ? 11 : manyMissing ? 17 : 28}vw, 1fr))`, gap: hugeMissing ? '0.7vw' : '1.4vw' }}>
                {pending.map(g => (
                  <div key={g.id} style={card({ padding: hugeMissing ? '1.2vh 0.5vw' : manyMissing ? '1.4vh 1vw' : '2.4vh 1.2vw', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', justifyContent: 'center' })}>
                    <div style={{ fontSize: vw(hugeMissing ? 1.3 : manyMissing ? 2 : 2.9), fontWeight: 800, lineHeight: 1.15 }}>{g.name}</div>
                    {!hugeMissing && (
                      <div style={{ fontSize: vw(manyMissing ? 1.3 : 1.8), color: YELLOW, fontWeight: 600 }}>{isToday ? 'Not started yet' : 'Not submitted'}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {recent.length > 0 && (
              <div style={{ fontSize: vw(1.9), color: YELLOW, textAlign: 'center', flexShrink: 0 }}>
                Last started: <strong style={{ color: 'white' }}>{recent[0].name}</strong>
                {' · '}
                {isToday ? timeAgo(recent[0].created_at) : new Date(recent[0].created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </>
        ))}

        {scene === 1 && (
          !seva ? (
            <div style={{ margin: 'auto', fontSize: vw(3), color: '#a5b4fc' }}>Seva timetable not available</div>
          ) : (
            <>
              {sevaToday && (
                <>
                  <Heading size={2.8}>🙏 Today’s Seva</Heading>
                  {sevaToday.groups.length === 0 ? (
                    <div style={card({ padding: '2vh', textAlign: 'center', fontSize: vw(2.4) })}>No seva groups listed for today</div>
                  ) : (
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '2vw' }}>
                      {sevaToday.groups.map(g => <SevaCard key={g.group} g={g} big />)}
                    </div>
                  )}
                </>
              )}
              <Heading size={sevaToday ? 2.4 : 2.8}>{sevaToday ? 'Next Week’s Seva' : '🙏 Seva This Weekend'}</Heading>
              <div style={{ flex: sevaToday ? 1.4 : 1, minHeight: 0, display: 'flex', gap: '2vw' }}>
                {sevaNext.map(day => (
                  <div key={day.date} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1vh' }}>
                    <div style={{ fontSize: vw(sevaToday ? 1.8 : 2.2), fontWeight: 700, color: YELLOW, textAlign: 'center' }}>
                      {fmtDay(day.date)}
                    </div>
                    {day.groups.length === 0 ? (
                      <div style={card({ padding: '1.5vh', textAlign: 'center', fontSize: vw(1.8) })}>No seva listed</div>
                    ) : day.groups.map(g => <SevaCard key={g.group} g={g} big={!sevaToday} />)}
                  </div>
                ))}
              </div>
            </>
          )
        )}

        {scene === 2 && (!hasSession ? (
          <div style={{ margin: 'auto', fontSize: vw(3), color: '#a5b4fc' }}>No Punjabi class sessions recorded yet</div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: '2.5vw' }}>
            <div style={{ flex: 3, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.4vh' }}>
              <Heading>🏆 Top 5 — Higher Attendance Group</Heading>
              {(data.top5 || []).length === 0 ? (
                <div style={card({ padding: '2vh', textAlign: 'center', fontSize: vw(2.2) })}>Not enough data yet</div>
              ) : data.top5.map((g, i) => (
                <div key={g.name} style={card({ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', gap: '1.6vw', padding: '0 2vw',
                  background: i === 0 ? '#2a2590' : CARD_BG })}>
                  <span style={{ fontSize: vw(3), width: '4.5vw', textAlign: 'center' }}>{MEDALS[i] || `${i + 1}.`}</span>
                  <span style={{ flex: 1, fontSize: vw(2.6), fontWeight: 800 }}>{g.name}</span>
                  <span style={{ fontSize: vw(3), fontWeight: 800, color: YELLOW }}>{g.high_count}</span>
                </div>
              ))}
            </div>

            {verifiedStudents && (
              <div style={{ flex: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '1.4vh' }}>
                <Heading>✅ Students Verified</Heading>
                <div style={card({ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                  gap: '2.5vh', padding: '3vh 2vw', textAlign: 'center' })}>
                  <div style={{ fontSize: vw(7), fontWeight: 800, lineHeight: 1 }}>{verifiedStudents.verified} / {verifiedStudents.total}</div>
                  <div style={{ fontSize: vw(2), color: YELLOW, fontWeight: 600 }}>
                    {verifiedStudents.total ? Math.round((verifiedStudents.verified / verifiedStudents.total) * 100) : 0}% of students verified
                  </div>
                  <Bar pct={verifiedStudents.total ? (verifiedStudents.verified / verifiedStudents.total) * 100 : 0} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 10, paddingTop: '1.2vh', flexShrink: 0 }}>
        {Array.from({ length: SCENE_COUNT }).map((_, i) => (
          <span key={i} style={{ width: 13, height: 13, borderRadius: '50%',
            background: i === scene ? '#f0a500' : '#302d6e', transition: 'background .3s' }} />
        ))}
      </div>
    </div>
  )
}
