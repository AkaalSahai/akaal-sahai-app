import { useEffect, useState, useCallback, useMemo, useRef, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { fmtDate } from '../../lib/dates'
import { exportCSV } from '../../lib/csv'
import { logAction } from '../../lib/audit'
import {
  STATUS_COLOR, STATUS_BG, STATUS_LABEL, STATUS_CODE,
  todayISO, daysAgoISO, tsToISO, shortDate, pctText, pctColor, statusTag,
  buildReport, buildPdf,
} from '../../lib/teacherAttendanceReport'

const PRESETS = [
  { id: 'all', label: 'All time' },
  { id: '30',  label: 'Last 30 days' },
  { id: '90',  label: 'Last 3 months' },
  { id: 'custom', label: 'Custom' },
]

// PostgREST caps responses at 1000 rows, so page through.
async function fetchAllAttendance(from, to) {
  const PAGE = 1000
  const out = []
  for (let start = 0; ; start += PAGE) {
    let q = supabase.from('teacher_attendance')
      .select('teacher_id, session_date, status, notes')
      .lte('session_date', to)
      .order('session_date').order('id')
      .range(start, start + PAGE - 1)
    if (from) q = q.gte('session_date', from)
    const { data, error } = await q
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return out
}



export default function TeacherAttendanceReport({ onPickDate }) {
  const { profile } = useAuth()
  const [preset, setPreset]   = useState('all')
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState(todayISO)
  const [search, setSearch]   = useState('')
  const [view, setView]       = useState('summary')
  const [sortCol, setSortCol] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [expanded, setExpanded] = useState(null)
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const loggedView = useRef(false)

  function pickPreset(id) {
    setPreset(id)
    if (id === 'all') { setFrom(''); setTo(todayISO()) }
    if (id === '30')  { setFrom(daysAgoISO(30)); setTo(todayISO()) }
    if (id === '90')  { setFrom(daysAgoISO(90)); setTo(todayISO()) }
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [records, { data: teacherRows, error: tErr }, { data: tgRows }, { data: groupRows }, { data: archRows }] = await Promise.all([
        fetchAllAttendance(from, to),
        // Teachers and registrars, whether it's their primary or an extra role
        supabase.from('users').select('id, name, created_at').or('role.in.(teacher,registrar),extra_roles.ov.{teacher,registrar}'),
        supabase.from('teacher_groups').select('teacher_id, groups(name)').eq('role', 'primary'),
        supabase.from('groups').select('name, teacher_id'),
        // Admin-only table; for other viewers this just returns nothing.
        supabase.from('users_archive').select('original_id, name, deleted_at, group_names'),
      ])
      if (tErr) throw tErr

      // Primary groups only: teacher_groups rows marked primary, plus the
      // legacy groups.teacher_id (the only source visible to non-admin viewers).
      const primaryGroups = {}
      const addPrimary = (teacherId, name) => {
        if (!teacherId || !name) return
        if (!primaryGroups[teacherId]) primaryGroups[teacherId] = []
        if (!primaryGroups[teacherId].includes(name)) primaryGroups[teacherId].push(name)
      }
      ;(tgRows || []).forEach(r => addPrimary(r.teacher_id, r.groups?.name))
      ;(groupRows || []).forEach(g => addPrimary(g.teacher_id, g.name))
      Object.values(primaryGroups).forEach(list => list.sort())

      const people = {}
      ;(teacherRows || []).forEach(t => {
        people[t.id] = {
          id: t.id, name: t.name,
          groups: primaryGroups[t.id] || [],
          joined: tsToISO(t.created_at), left: false, leftDate: null, otherRole: null,
        }
      })

      // Anyone with records who isn't a current teacher: left (archived) or moved to another role.
      const missing = [...new Set(records.map(r => r.teacher_id))].filter(id => !people[id])
      if (missing.length) {
        const archMap = Object.fromEntries((archRows || []).map(a => [a.original_id, a]))
        const { data: others } = await supabase.from('users').select('id, name, role, created_at').in('id', missing)
        const otherMap = Object.fromEntries((others || []).map(u => [u.id, u]))
        missing.forEach(id => {
          const u = otherMap[id], a = archMap[id]
          if (u) {
            people[id] = { id, name: u.name, groups: primaryGroups[id] || [], joined: tsToISO(u.created_at),
              left: false, leftDate: null, otherRole: u.role }
          } else {
            people[id] = { id, name: a?.name || 'Unknown teacher', groups: a?.group_names || [], joined: null,
              left: true, leftDate: a ? tsToISO(a.deleted_at) : null, otherRole: null }
          }
        })
      }

      const { classDays, rows } = buildReport(Object.values(people), records)
      setData({ classDays, rows })
      // Log the first view only - not every filter change
      if (!loggedView.current) {
        loggedView.current = true
        logAction(profile, 'Viewed teacher attendance report').catch(() => {})
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [from, to, profile])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const q = search.trim().toLowerCase()
    const filtered = q ? data.rows.filter(r => r.name?.toLowerCase().includes(q)) : data.rows
    const val = r => {
      if (sortCol === 'name')   return (r.name || '').toLowerCase()
      if (sortCol === 'groups') return r.groups.join(', ').toLowerCase()
      if (sortCol === 'joined') return r.joined || ''
      if (sortCol === 'pct')    return r.pct === null ? -1 : r.pct
      return r.counts[sortCol]
    }
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b)
      const c = x < y ? -1 : x > y ? 1 : 0
      return sortDir === 'asc' ? c : -c
    })
  }, [data, search, sortCol, sortDir])

  function sortBy(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'name' || col === 'groups' || col === 'joined' ? 'asc' : 'desc') }
  }

  const rangeLabel = `${from ? fmtDate(from) : 'Start'} to ${fmtDate(to)}`
  const exportLabel = rangeLabel + (search.trim() ? `  ·  Filtered by name: "${search.trim()}"` : '')
  const fileStem = `teacher-attendance-${from || 'all'}-to-${to}`

  function downloadCSV() {
    const cols = [
      { label: 'Teacher',   get: r => r.name },
      { label: 'Status',    get: r => statusTag(r) || 'Current' },
      { label: 'Primary group', get: r => r.groups.join(', ') },
      { label: 'Joined',    get: r => r.joined ? fmtDate(r.joined) : '' },
      { label: 'Present',   get: r => r.counts.present },
      { label: 'Late',      get: r => r.counts.late },
      { label: 'Absent',    get: r => r.counts.absent },
      { label: 'Not marked (counted absent)', get: r => r.counts.unmarked },
      { label: 'Holiday',   get: r => r.counts.holiday },
      { label: 'Attendance %', get: r => r.pct === null ? '' : r.pct },
      ...data.classDays.map(d => ({ label: fmtDate(d), get: r => r.days[d] ? STATUS_CODE[r.days[d].status] : '' })),
    ]
    exportCSV(rows, cols, `${fileStem}.csv`)
    logAction(profile, 'Downloaded teacher attendance report', `CSV, ${exportLabel}`).catch(() => {})
  }

  async function downloadPDF() {
    setPdfBusy(true)
    try {
      const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      buildPdf(doc, autoTable, { classDays: data.classDays, rows, rangeLabel: exportLabel })
      doc.save(`${fileStem}.pdf`)
      logAction(profile, 'Downloaded teacher attendance report', `PDF, ${exportLabel}`).catch(() => {})
    } catch (err) {
      alert('Could not create PDF: ' + err.message)
    } finally {
      setPdfBusy(false)
    }
  }

  const th = (col, label, extra = {}) => (
    <th onClick={() => sortBy(col)} style={{ cursor: 'pointer', whiteSpace: 'nowrap', ...extra }}>
      {label}{sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  )

  const pill = active => ({
    padding: '5px 11px', borderRadius: 7, fontSize: '.76rem', fontWeight: 700, fontFamily: 'inherit',
    cursor: 'pointer', border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    background: active ? 'var(--primary)' : 'white', color: active ? 'white' : 'var(--muted)',
  })

  const totalUnmarked = rows.reduce((s, r) => s + r.counts.unmarked, 0)

  return (
    <div className="card">
      <div className="card-title">
        Teacher Attendance Report
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-outline btn-sm" onClick={downloadCSV} disabled={!data || loading}>Download CSV</button>
          <button className="btn btn-primary btn-sm" onClick={downloadPDF} disabled={!data || loading || pdfBusy}>
            {pdfBusy ? 'Creating PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {PRESETS.map(p => (
          <button key={p.id} style={pill(preset === p.id)} onClick={() => pickPreset(p.id)}>{p.label}</button>
        ))}
        {preset === 'custom' && (
          <>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
              style={{ fontSize: '.82rem', padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)' }} />
            <span style={{ color: 'var(--muted)', fontSize: '.8rem' }}>to</span>
            <input type="date" value={to} min={from || undefined} onChange={e => e.target.value && setTo(e.target.value)}
              style={{ fontSize: '.82rem', padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)' }} />
          </>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teacher…"
          style={{ fontSize: '.82rem', padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)',
            fontFamily: 'inherit', marginLeft: 'auto', minWidth: 160 }} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={pill(view === 'summary')} onClick={() => setView('summary')}>Summary</button>
        <button style={pill(view === 'grid')} onClick={() => setView('grid')}>Register grid</button>
        {data && (
          <span style={{ fontSize: '.78rem', color: 'var(--muted)', marginLeft: 8 }}>
            {rangeLabel} · {data.classDays.length} class days · {rows.length} teachers
            {totalUnmarked > 0 && <span style={{ color: '#ea580c', fontWeight: 700 }}> · ⚠ {totalUnmarked} unmarked days counted as absent</span>}
          </span>
        )}
      </div>

      {loading ? <div className="spinner" /> : error ? (
        <div style={{ color: '#dc2626', fontSize: '.85rem' }}>Could not load report: {error}</div>
      ) : !data || data.classDays.length === 0 ? (
        <div style={{ color: 'var(--muted)', fontSize: '.85rem', padding: '8px 0' }}>No teacher attendance recorded in this period.</div>
      ) : view === 'summary' ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {th('name', 'Teacher')}
                {th('groups', 'Primary group')}
                {th('joined', 'Joined')}
                {th('present', 'Present')}
                {th('late', 'Late')}
                {th('absent', 'Absent')}
                {th('unmarked', 'Not marked')}
                {th('holiday', 'Holiday')}
                {th('pct', 'Attendance %')}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <Fragment key={r.id}>
                  <tr style={{ cursor: 'pointer', background: expanded === r.id ? '#f8fafc' : undefined }}
                    onClick={() => setExpanded(e => e === r.id ? null : r.id)}>
                    <td style={{ fontWeight: 600, fontSize: '.86rem' }}>
                      <span style={{ color: 'var(--muted)', marginRight: 6 }}>{expanded === r.id ? '▾' : '▸'}</span>
                      {r.name}
                      {statusTag(r) && (
                        <span style={{ marginLeft: 6, fontSize: '.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 6,
                          background: r.left ? '#e2e8f0' : '#ede9fe', color: r.left ? '#475569' : '#6d28d9' }}>
                          {statusTag(r)}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>{r.groups.join(', ') || '—'}</td>
                    <td style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>{r.joined ? fmtDate(r.joined) : '—'}</td>
                    <td style={{ color: STATUS_COLOR.present, fontWeight: 700 }}>{r.counts.present}</td>
                    <td style={{ color: STATUS_COLOR.late, fontWeight: 700 }}>{r.counts.late}</td>
                    <td style={{ color: STATUS_COLOR.absent, fontWeight: 700 }}>{r.counts.absent}</td>
                    <td style={{ color: r.counts.unmarked ? '#ea580c' : 'var(--muted)', fontWeight: 700 }}>
                      {r.counts.unmarked ? `⚠ ${r.counts.unmarked}` : 0}
                    </td>
                    <td style={{ color: STATUS_COLOR.holiday, fontWeight: 700 }}>{r.counts.holiday}</td>
                    <td style={{ color: pctColor(r.pct), fontWeight: 800 }}>{pctText(r.pct)}</td>
                  </tr>
                  {expanded === r.id && (
                    <tr>
                      <td colSpan={9} style={{ background: '#f8fafc', padding: '10px 16px' }}>
                        <div style={{ fontSize: '.76rem', color: 'var(--muted)', marginBottom: 8 }}>
                          {r.joined ? `Joined ${fmtDate(r.joined)}` : 'Joining date unknown'}
                          {r.left && ` · ${statusTag(r)}`}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {Object.keys(r.days).sort((a, b) => b.localeCompare(a)).map(d => {
                            const day = r.days[d]
                            return (
                              <div key={d} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '.82rem' }}>
                                <span style={{ width: 90, fontWeight: 600 }}>{fmtDate(d)}</span>
                                <span style={{ fontWeight: 700, color: STATUS_COLOR[day.status], background: STATUS_BG[day.status],
                                  padding: '2px 8px', borderRadius: 6 }}>
                                  {day.status === 'unmarked' ? '⚠ ' : ''}{STATUS_LABEL[day.status]}
                                </span>
                                {day.notes && <span style={{ color: 'var(--muted)' }}>📝 {day.notes}</span>}
                              </div>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div style={{ fontSize: '.74rem', color: 'var(--muted)', marginBottom: 8 }}>
            P Present · L Late · A Absent · <span style={{ color: '#ea580c', fontWeight: 700 }}>A⚠ Not marked (counted absent)</span> · H Holiday · blank = before joining / after leaving.
            {onPickDate && ' Click a date to open that day\'s register.'}
          </div>
          <div className="table-wrap">
            <table style={{ fontSize: '.76rem' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1 }}>Teacher</th>
                  {data.classDays.map(d => (
                    <th key={d} title={fmtDate(d)} onClick={() => onPickDate?.(d)}
                      style={{ textAlign: 'center', padding: '6px 4px', cursor: onPickDate ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
                      {shortDate(d)}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'white', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {r.name}{r.left && <span style={{ color: '#64748b', fontWeight: 400 }}> (Left)</span>}
                    </td>
                    {data.classDays.map(d => {
                      const day = r.days[d]
                      return (
                        <td key={d} title={day ? `${fmtDate(d)}: ${STATUS_LABEL[day.status]}${day.notes ? ' — ' + day.notes : ''}` : ''}
                          style={{ textAlign: 'center', padding: '4px', fontWeight: 700,
                            color: day ? STATUS_COLOR[day.status] : undefined,
                            background: day ? STATUS_BG[day.status] : undefined }}>
                          {day ? (day.status === 'unmarked' ? 'A⚠' : STATUS_CODE[day.status]) : ''}
                        </td>
                      )
                    })}
                    <td style={{ textAlign: 'center', fontWeight: 800, color: pctColor(r.pct) }}>{pctText(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
