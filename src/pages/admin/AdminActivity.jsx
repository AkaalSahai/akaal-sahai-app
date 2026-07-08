import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const ACTION_COLORS = {
  'Signed in':                      '#2563eb',
  'Signed out':                     '#64748b',
  'Approved student application':   '#16a34a',
  'Approved teacher application':   '#16a34a',
  'Approved transfer request':      '#16a34a',
  'Rejected student application':   '#dc2626',
  'Rejected teacher application':   '#dc2626',
  'Rejected transfer request':      '#dc2626',
  'Cleared student application':    '#d97706',
  'Cleared teacher application':    '#d97706',
  'Cleared transfer request':       '#d97706',
  'Removed student':                '#dc2626',
  'Moved student to group':         '#0d9488',
  'Created group':                  '#16a34a',
  'Deleted group':                  '#dc2626',
  'Assigned teacher to group':      '#0d9488',
  'Created user':                   '#16a34a',
  'Deleted user':                   '#dc2626',
  'Changed primary role':           '#7c3aed',
  'Updated extra roles':            '#7c3aed',
  'Reset password':                 '#d97706',
  'Updated email':                  '#0d9488',
  'Toggled student edit permission':'#0d9488',
}

function actionColor(action) {
  return ACTION_COLORS[action] || '#475569'
}

export default function AdminActivity() {
  const [logs, setLogs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [userFilter, setUserFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch]         = useState('')
  const [capped, setCapped]         = useState(false)

  const LIMIT = 500
  const [loadError, setLoadError] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoadError(null)
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(LIMIT + 1)
    if (error) { setLoadError(error.message); setLoading(false); return }
    const rows = data || []
    setCapped(rows.length > LIMIT)
    setLogs(rows.slice(0, LIMIT))
    setLoading(false)
  }

  const users   = [...new Set(logs.map(l => l.user_name))].sort()
  const actions = [...new Set(logs.map(l => l.action))].sort()

  const filtered = logs.filter(l => {
    const matchUser   = !userFilter   || l.user_name === userFilter
    const matchAction = !actionFilter || l.action    === actionFilter
    const q = search.toLowerCase()
    const matchSearch = !q
      || l.user_name.toLowerCase().includes(q)
      || l.action.toLowerCase().includes(q)
      || (l.detail || '').toLowerCase().includes(q)
    return matchUser && matchAction && matchSearch
  })

  const hasFilter = userFilter || actionFilter || search

  if (loading) return <div className="spinner" />

  if (loadError) return (
    <div className="card">
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: '.85rem' }}>
        <strong>Could not load activity log:</strong> {loadError}
      </div>
    </div>
  )

  return (
    <div className="card">
      <div className="card-title">
        Activity Log
        <button className="btn btn-outline btn-sm" onClick={load}>Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, padding: '7px 10px', fontSize: '.84rem' }}
        />
        <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: '.84rem' }}>
          <option value="">All users</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
          style={{ padding: '7px 10px', fontSize: '.84rem' }}>
          <option value="">All actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {hasFilter && (
          <button className="btn btn-outline btn-sm"
            onClick={() => { setUserFilter(''); setActionFilter(''); setSearch('') }}>
            Clear
          </button>
        )}
      </div>

      {capped && !hasFilter && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8,
          padding: '8px 14px', marginBottom: 12, fontSize: '.82rem', color: '#92400e' }}>
          Showing the most recent {LIMIT} entries. Use filters to narrow results.
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📋</div>
          {hasFilter ? 'No entries match your filters' : 'No activity recorded yet'}
        </div>
      ) : (
        <>
          <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8 }}>
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ whiteSpace: 'nowrap' }}>Date &amp; Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const d = new Date(l.created_at)
                  return (
                    <tr key={l.id}>
                      <td style={{ fontSize: '.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                        {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {', '}
                        {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: '.85rem' }}>{l.user_name}</td>
                      <td>
                        <span style={{
                          fontSize: '.78rem', fontWeight: 700,
                          color: actionColor(l.action),
                          background: actionColor(l.action) + '18',
                          borderRadius: 5, padding: '2px 8px', whiteSpace: 'nowrap',
                        }}>
                          {l.action}
                        </span>
                      </td>
                      <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{l.detail || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
