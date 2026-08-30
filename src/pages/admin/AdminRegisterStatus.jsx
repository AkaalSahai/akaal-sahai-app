import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { isAnyClassDay } from '../../lib/classTypes'

function todayISO() { return new Date().toISOString().split('T')[0] }

export default function AdminRegisterStatus() {
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [filterMissing, setFilterMissing] = useState(false)

  const load = useCallback(async () => {
    const today = todayISO()
    const [
      { data: groups },
      { data: sessions },
      { data: records },
      { data: teachers },
      { data: tgRows },
    ] = await Promise.all([
      supabase.from('groups').select('id, name, teacher_id').order('name'),
      supabase.from('attendance_sessions').select('id, group_id, created_at').eq('session_date', today),
      supabase.from('attendance_records').select('session_id, status').eq('session_date', today),
      supabase.from('users').select('id, name').eq('role', 'teacher'),
      supabase.from('teacher_groups').select('teacher_id, group_id'),
    ])

    const teacherMap = Object.fromEntries((teachers || []).map(t => [t.id, t.name]))
    const tgMap = {}
    ;(tgRows || []).forEach(r => {
      if (!tgMap[r.group_id]) tgMap[r.group_id] = []
      if (teacherMap[r.teacher_id]) tgMap[r.group_id].push(teacherMap[r.teacher_id])
    })

    const sessionMap = {}
    ;(sessions || []).forEach(s => { sessionMap[s.group_id] = s })

    const totalCount = {}, presentCount = {}
    ;(records || []).forEach(r => {
      totalCount[r.session_id] = (totalCount[r.session_id] || 0) + 1
      if (r.status === 'present' || r.status === 'late')
        presentCount[r.session_id] = (presentCount[r.session_id] || 0) + 1
    })

    const enriched = (groups || []).map(g => {
      const session = sessionMap[g.id]
      const teacherNames = tgMap[g.id] || (g.teacher_id && teacherMap[g.teacher_id] ? [teacherMap[g.teacher_id]] : [])
      return {
        ...g,
        teacherNames,
        submitted:    !!session,
        submittedAt:  session?.created_at || null,
        marked:       session ? (totalCount[session.id] || 0) : null,
        present:      session ? (presentCount[session.id] || 0) : null,
      }
    })

    setData(enriched)
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [load])

  if (loading) return <div className="spinner" />

  const classDay  = isAnyClassDay()
  const submitted = (data || []).filter(g => g.submitted)
  const missing   = (data || []).filter(g => !g.submitted)
  const displayed = filterMissing ? missing : (data || [])

  function fmtTime(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <>
      {/* Summary tiles */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { value: submitted.length, label: 'Submitted',    color: '#16a34a', bg: 'white',   border: 'var(--border)' },
          { value: missing.length,   label: classDay ? 'Missing' : 'Not submitted',
            color: classDay && missing.length > 0 ? '#dc2626' : '#94a3b8',
            bg:    classDay && missing.length > 0 ? '#fef2f2' : 'white',
            border: classDay && missing.length > 0 ? '#fecaca' : 'var(--border)' },
          { value: (data || []).length, label: 'Total Groups', color: 'var(--primary)', bg: 'white', border: 'var(--border)' },
        ].map(({ value, label, color, bg, border }) => (
          <div key={label} style={{ flex: 1, minWidth: 120, background: bg, borderRadius: 10,
            padding: '14px 18px', border: `1px solid ${border}`, boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color, textTransform: 'uppercase',
              letterSpacing: '.06em', marginTop: 4, opacity: .85 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Main table card */}
      <div className="card">
        <div className="card-title">
          Register Status — Today
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {lastUpdated && (
              <span style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 400 }}>
                Updated {lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button onClick={() => setFilterMissing(f => !f)}
              style={{ fontSize: '.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${filterMissing ? '#fecaca' : 'var(--border)'}`,
                background: filterMissing ? '#fef2f2' : 'white',
                color: filterMissing ? '#dc2626' : 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {filterMissing ? 'Show all' : 'Missing only'}
            </button>
            <button onClick={load}
              style={{ fontSize: '.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'white', color: 'var(--muted)',
                cursor: 'pointer', fontFamily: 'inherit' }}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {!classDay && (
          <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, fontSize: '.83rem', color: 'var(--muted)' }}>
            Today is not a class day — classes run on Fridays and Saturdays.
          </div>
        )}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Teacher(s)</th>
                <th>Status</th>
                <th>Submitted At</th>
                <th>Present / Marked</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map(g => (
                <tr key={g.id} style={{ background: g.submitted ? 'white' : classDay ? '#fffbfb' : 'white' }}>
                  <td style={{ fontWeight: 600 }}>{g.name}</td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                    {g.teacherNames.length > 0 ? g.teacherNames.join(', ') : '—'}
                  </td>
                  <td>
                    {g.submitted
                      ? <span style={{ color: '#16a34a', fontWeight: 700, fontSize: '.82rem' }}>✓ Submitted</span>
                      : classDay
                        ? <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '.82rem' }}>⚠ Missing</span>
                        : <span style={{ color: '#94a3b8', fontSize: '.82rem' }}>— Not submitted</span>}
                  </td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtTime(g.submittedAt)}
                  </td>
                  <td style={{ fontSize: '.82rem' }}>
                    {g.submitted
                      ? <span><strong>{g.present}</strong> present / {g.marked} marked</span>
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                </tr>
              ))}
              {displayed.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: '#16a34a', fontWeight: 700, padding: 24 }}>
                  All registers submitted!
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
