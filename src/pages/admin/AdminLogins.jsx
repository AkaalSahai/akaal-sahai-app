import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { fmtDate } from '../../lib/dates'
import { logAction } from '../../lib/audit'

// Admin-only view of every active login: who, which device, which IP address
// (personal data - full admins only, each view is logged), and ending one
// device or all of a person's devices. See add-active-logins-view.sql.

const IDLE_DAYS = 30

function describeDevice(ua) {
  if (!ua) return { icon: '❔', label: 'Unknown device' }
  const device =
    /iPhone/i.test(ua) ? 'iPhone' :
    /iPad/i.test(ua) ? 'iPad' :
    /Android/i.test(ua) ? 'Android' :
    /Windows/i.test(ua) ? 'Windows' :
    /Mac OS X|Macintosh/i.test(ua) ? 'Mac' :
    /Linux/i.test(ua) ? 'Linux' : 'Other'
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /SamsungBrowser/i.test(ua) ? 'Samsung Internet' :
    /CriOS|Chrome\//i.test(ua) ? 'Chrome' :
    /FxiOS|Firefox\//i.test(ua) ? 'Firefox' :
    /Safari\//i.test(ua) ? 'Safari' : 'Browser'
  const icon = ['iPhone', 'Android'].includes(device) ? '📱' : device === 'iPad' ? '📲' : '💻'
  return { icon, label: `${device} · ${browser}` }
}

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const d = new Date(ts)
  const sameDay = d.toDateString() === new Date().toDateString()
  if (sameDay) return `today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
  const days = Math.floor(mins / 1440)
  if (days < 1) return 'yesterday'
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return fmtDate(d)
}

const isIdle = ts => Date.now() - new Date(ts).getTime() > IDLE_DAYS * 86400000

// The login this browser is using, from its access token's session_id claim
async function currentSessionId() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.session_id || null
  } catch { return null }
}

export default function AdminLogins() {
  const { profile } = useAuth()
  const [rows, setRows]       = useState(null)
  const [error, setError]     = useState(null)
  const [mySession, setMySession] = useState(null)
  const [expanded, setExpanded] = useState({})
  const [search, setSearch]   = useState('')
  const [onlyIdle, setOnlyIdle] = useState(false)
  const [busy, setBusy]       = useState(null)
  const loggedView = useRef(false)

  const load = useCallback(async () => {
    const [{ data, error: err }, sid] = await Promise.all([
      supabase.rpc('list_active_logins'),
      currentSessionId(),
    ])
    if (err) { setError(err.message); return }
    setError(null)
    setRows(data || [])
    setMySession(sid)
    if (!loggedView.current) {
      loggedView.current = true
      logAction(profile, 'Viewed active logins').catch(() => {})
    }
  }, [profile])

  useEffect(() => { load() }, [load])

  const people = useMemo(() => {
    if (!rows) return []
    const byUser = {}
    rows.forEach(r => {
      if (!byUser[r.user_id]) byUser[r.user_id] = { user_id: r.user_id, name: r.name, role: r.role, logins: [] }
      byUser[r.user_id].logins.push(r)
    })
    const list = Object.values(byUser).map(p => {
      p.logins.sort((a, b) => new Date(b.last_active_at) - new Date(a.last_active_at))
      p.lastActive = p.logins[0].last_active_at
      p.idleCount = p.logins.filter(l => isIdle(l.last_active_at)).length
      return p
    })
    const q = search.trim().toLowerCase()
    return list
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .filter(p => !onlyIdle || p.idleCount > 0)
      .sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive))
  }, [rows, search, onlyIdle])

  const stats = useMemo(() => {
    if (!rows) return null
    const day = Date.now() - 86400000, week = Date.now() - 7 * 86400000
    return {
      total: rows.length,
      people: new Set(rows.map(r => r.user_id)).size,
      today: rows.filter(r => new Date(r.last_active_at) > day).length,
      week: rows.filter(r => new Date(r.last_active_at) > week).length,
      idle: rows.filter(r => isIdle(r.last_active_at)).length,
    }
  }, [rows])

  async function endLogin(login) {
    const mine = login.session_id === mySession
    const what = describeDevice(login.user_agent).label
    if (!confirm(mine
      ? 'This is the login you are using now - ending it will log you out here. Continue?'
      : `End ${login.name}'s login on ${what} (${login.ip || 'unknown IP'})?`)) return
    setBusy(login.session_id)
    try {
      const { error: err } = await supabase.rpc('end_login', { p_session_id: login.session_id })
      if (err) throw err
      if (mine) { await supabase.auth.signOut({ scope: 'local' }); return }
      await load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function logOutEverywhere(p) {
    const includesMe = p.logins.some(l => l.session_id === mySession)
    if (!confirm(`Log ${p.name} out on all ${p.logins.length} device${p.logins.length === 1 ? '' : 's'}?${includesMe ? '\n\nThis includes the device you are using now.' : ''}`)) return
    setBusy(p.user_id)
    try {
      const { error: err } = await supabase.rpc('sign_out_user_everywhere', { p_user_id: p.user_id })
      if (err) throw err
      if (includesMe) { await supabase.auth.signOut({ scope: 'local' }); return }
      await load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  if (error) return <div className="card" style={{ color: '#dc2626' }}>Could not load logins: {error}</div>
  if (!rows) return <div className="spinner" />

  const tiles = [
    { value: stats.total,  label: 'Logins total',      color: '#1e1a6e' },
    { value: stats.people, label: 'People logged in',  color: '#1e1a6e' },
    { value: stats.today,  label: 'Active today',      color: '#16a34a' },
    { value: stats.week,   label: 'Active this week',  color: '#0284c7' },
    { value: stats.idle,   label: `Unused ${IDLE_DAYS}+ days`, color: '#ea580c' },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {tiles.map(t => (
          <div key={t.label} className="card" style={{ flex: 1, minWidth: 120, margin: 0, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: t.color, lineHeight: 1 }}>{t.value}</div>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color: t.color, textTransform: 'uppercase',
              letterSpacing: '.06em', marginTop: 4, opacity: .85 }}>{t.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-title">
          Active Logins
          <span style={{ fontSize: '.75rem', fontWeight: 400, color: 'var(--muted)' }}>
            IP addresses are personal data - viewing this page is recorded in the Activity log
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name…"
            style={{ fontSize: '.85rem', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
              fontFamily: 'inherit', minWidth: 200 }} />
          <label style={{ fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyIdle} onChange={e => setOnlyIdle(e.target.checked)} />
            Only people with logins unused {IDLE_DAYS}+ days
          </label>
          <button className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }} onClick={load}>Refresh</button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Devices</th>
                <th>IP addresses</th>
                <th>Last active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => {
                const open = !!expanded[p.user_id]
                const isProjector = p.role === 'dashboard'
                return (
                  <Fragment key={p.user_id}>
                    <tr style={{ cursor: 'pointer', background: open ? '#f8fafc' : undefined }}
                      onClick={() => setExpanded(e => ({ ...e, [p.user_id]: !e[p.user_id] }))}>
                      <td style={{ fontWeight: 600, fontSize: '.88rem' }}>
                        <span style={{ color: 'var(--muted)', marginRight: 6 }}>{open ? '▾' : '▸'}</span>
                        {p.name}
                        {isProjector && <span style={{ marginLeft: 6, fontSize: '.7rem', color: 'var(--muted)' }}>(projector)</span>}
                      </td>
                      <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{p.role}</td>
                      <td style={{ fontSize: '.85rem' }}>
                        {p.logins.length}
                        {p.idleCount > 0 && <span style={{ color: '#ea580c', fontWeight: 700 }}> · {p.idleCount} unused ⚠</span>}
                      </td>
                      <td style={{ fontSize: '.78rem', fontFamily: 'ui-monospace, monospace' }}>
                        {(() => {
                          // Most recently used first, each address once
                          const ips = [...new Set(p.logins.map(l => l.ip).filter(Boolean))]
                          return ips.length === 0 ? '—' : ips.slice(0, 3).join(', ') + (ips.length > 3 ? ` +${ips.length - 3} more` : '')
                        })()}
                      </td>
                      <td style={{ fontSize: '.85rem' }}>{timeAgo(p.lastActive)}</td>
                      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                        {!isProjector && (
                          <button className="btn btn-outline btn-xs" disabled={busy === p.user_id} onClick={() => logOutEverywhere(p)}>
                            {busy === p.user_id ? '…' : 'Log out everywhere'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={6} style={{ background: '#f8fafc', padding: '8px 16px 12px' }}>
                          <table style={{ fontSize: '.82rem' }}>
                            <thead>
                              <tr><th>Device</th><th>IP address</th><th>Logged in</th><th>Last active</th><th></th></tr>
                            </thead>
                            <tbody>
                              {p.logins.map(l => {
                                const d = describeDevice(l.user_agent)
                                const idle = isIdle(l.last_active_at)
                                return (
                                  <tr key={l.session_id}>
                                    <td title={l.user_agent || ''}>
                                      {d.icon} {d.label}
                                      {l.session_id === mySession && (
                                        <span style={{ marginLeft: 6, fontSize: '.7rem', fontWeight: 700, color: '#1e1a6e',
                                          background: '#e0e7ff', borderRadius: 6, padding: '1px 6px' }}>★ This device</span>
                                      )}
                                    </td>
                                    <td style={{ fontFamily: 'ui-monospace, monospace' }}>{l.ip || '—'}</td>
                                    <td>{fmtDate(l.logged_in_at)}</td>
                                    <td style={{ color: idle ? '#ea580c' : undefined, fontWeight: idle ? 700 : 400 }}>
                                      {timeAgo(l.last_active_at)}{idle ? ' ⚠' : ''}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <button className="btn btn-outline btn-xs" disabled={busy === l.session_id} onClick={() => endLogin(l)}>
                                        {busy === l.session_id ? '…' : 'End this login'}
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {people.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: '.85rem', padding: '8px 0' }}>No logins match.</div>
        )}
      </div>
    </>
  )
}
