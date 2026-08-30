import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/dates'
import { useAuth } from '../../hooks/useAuth'
import { isAnyClassDay } from '../../lib/classTypes'
import AdminRegisterStatus from './AdminRegisterStatus'
import html2canvas from 'html2canvas'

function todayISO() { return new Date().toISOString().split('T')[0] }
function isClassDay() { return isAnyClassDay() }

function getLastWeekend() {
  const d = new Date()
  while (d.getDay() !== 6) d.setDate(d.getDate() - 1)
  const saturday = d.toISOString().split('T')[0]
  const fri = new Date(d)
  fri.setDate(fri.getDate() - 1)
  const friday = fri.toISOString().split('T')[0]
  return { friday, saturday }
}

function calcAge(dob) {
  if (!dob) return null
  const ms = Date.now() - new Date(dob).getTime()
  if (ms < 0) return null
  return Math.floor(ms / 31557600000)
}

function ageRange(students) {
  const ages = (students || []).map(s => calcAge(s.date_of_birth)).filter(a => a !== null)
  if (ages.length === 0) return null
  const mn = Math.min(...ages), mx = Math.max(...ages)
  return mn === mx ? `${mn} yrs` : `${mn}–${mx} yrs`
}

function pct(n, d) { return d === 0 ? null : Math.round((n / d) * 100) }

function attColor(p) {
  if (p === null) return '#94a3b8'
  return p >= 80 ? '#16a34a' : p >= 65 ? '#d97706' : '#dc2626'
}


function LiveAttendanceWidget() {
  const [date,        setDate]        = useState(todayISO)
  const [groups,      setGroups]      = useState(null)
  const [totals,      setTotals]      = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const [refreshing,  setRefreshing]  = useState(false)
  const [countdown,   setCountdown]   = useState(30)
  const countRef = useRef(30)

  useEffect(() => {
    const isLive = date === todayISO()
    loadData(date)
    if (!isLive) return
    const data = setInterval(() => loadData(todayISO()), 30000)
    const tick  = setInterval(() => {
      countRef.current = Math.max(0, countRef.current - 1)
      setCountdown(countRef.current)
    }, 1000)
    return () => { clearInterval(data); clearInterval(tick) }
  }, [date])

  async function loadData(targetDate) {
    const isLive = targetDate === todayISO()
    setRefreshing(true)
    if (isLive) { countRef.current = 30; setCountdown(30) }
    try {
      const [{ data: grpRows }, { data: stuRows }, { data: recRows }, { data: scRows }] = await Promise.all([
        supabase.from('groups').select('id, name').order('name'),
        supabase.from('students').select('id, group_id').eq('active', true),
        supabase.from('attendance_records').select('student_id, group_id, status').eq('session_date', targetDate),
        supabase.from('student_classes').select('student_id, group_id'),
      ])

      const byGroup = {}
      ;(stuRows || []).forEach(s => {
        if (!s.group_id) return
        if (!byGroup[s.group_id]) byGroup[s.group_id] = { total: 0, present: 0, late: 0, absent: 0, holiday: 0, hasSession: false }
        byGroup[s.group_id].total++
      })
      ;(scRows || []).forEach(r => {
        if (!byGroup[r.group_id]) byGroup[r.group_id] = { total: 0, present: 0, late: 0, absent: 0, holiday: 0, hasSession: false }
        byGroup[r.group_id].total++
      })
      ;(recRows || []).forEach(r => {
        if (!byGroup[r.group_id]) byGroup[r.group_id] = { total: 0, present: 0, late: 0, absent: 0, holiday: 0, hasSession: false }
        byGroup[r.group_id][r.status] = (byGroup[r.group_id][r.status] || 0) + 1
        byGroup[r.group_id].hasSession = true
      })

      const grpData = (grpRows || [])
        .filter(g => byGroup[g.id]?.total > 0)
        .map(g => {
          const s = byGroup[g.id] || { total: 0, present: 0, late: 0, absent: 0, holiday: 0, hasSession: false }
          return { ...g, ...s, marked: s.present + s.late + s.absent + s.holiday }
        })

      const tot = grpData.reduce((a, g) => ({
        total:   a.total   + g.total,
        marked:  a.marked  + g.marked,
        present: a.present + g.present,
        late:    a.late    + g.late,
        absent:  a.absent  + g.absent,
        holiday: a.holiday + g.holiday,
      }), { total: 0, marked: 0, present: 0, late: 0, absent: 0, holiday: 0 })

      setGroups(grpData)
      setTotals(tot)
      setLastRefresh(new Date())
    } finally { setRefreshing(false) }
  }

  const isToday  = date === todayISO()
  const classDay = isClassDay()

  return (
    <div className="card" style={{ margin: 0 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px 0', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '.9rem', color: '#0f1229' }}>Register Viewer</span>
          {isToday && lastRefresh && (
            <span style={{ fontSize: '.68rem', color: 'var(--muted)' }}>
              next refresh in {countdown}s
            </span>
          )}
          {!isToday && (
            <span style={{ fontSize: '.69rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
              background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
              Past register
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={e => {
              if (!e.target.value) return
              setGroups(null)
              setDate(e.target.value)
            }}
            style={{ fontSize: '.78rem', padding: '4px 8px', borderRadius: 6,
              border: '1px solid var(--border)', background: 'white',
              fontFamily: 'inherit', outline: 'none', color: '#0f1229' }}
          />
          {isToday && (
            <button onClick={() => loadData(date)} disabled={refreshing}
              style={{ fontSize: '.72rem', fontWeight: 600, padding: '4px 12px', borderRadius: 6,
                border: '1px solid var(--border)', background: refreshing ? '#f8fafc' : 'white',
                color: refreshing ? 'var(--muted)' : 'var(--primary)', cursor: refreshing ? 'default' : 'pointer',
                fontFamily: 'inherit' }}>
              {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
            </button>
          )}
        </div>
      </div>

      {!groups ? (
        <div style={{ padding: '24px 18px' }}><div className="spinner" /></div>
      ) : (
        <>
          {/* Aggregate totals */}
          {totals && (
            <div style={{ padding: '12px 18px 14px',
              borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
              alignItems: 'center' }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f1229',
                fontVariantNumeric: 'tabular-nums' }}>
                {totals.marked} <span style={{ fontWeight: 400, fontSize: '.8rem', color: 'var(--muted)' }}>marked</span>
              </span>
              {[['Present', totals.present, '#16a34a'], ['Late', totals.late, '#d97706'],
                ['Absent', totals.absent, '#dc2626'], ['Holiday', totals.holiday, '#0284c7']].map(([lbl, val, clr]) =>
                val > 0 ? (
                  <span key={lbl} style={{ fontSize: '.78rem', fontWeight: 700, color: clr }}>
                    {val} {lbl}
                  </span>
                ) : null
              )}
              <span style={{ fontSize: '.78rem', color: 'var(--muted)', marginLeft: 'auto' }}>
                {totals.total - totals.marked} {isToday ? 'not yet marked' : 'not marked'} of {totals.total} total
              </span>
            </div>
          )}

          {/* Class day notice */}
          {isToday && !classDay && (
            <div style={{ padding: '10px 18px 12px', fontSize: '.76rem', color: '#92400e',
              background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
              Not a class day — data shown for reference only
            </div>
          )}

          {/* Per-group rows */}
          <div style={{ padding: '10px 18px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map(g => {
              const noSession = !isToday && !g.hasSession
              const pPct = g.total > 0 ? (g.present / g.total) * 100 : 0
              const lPct = g.total > 0 ? (g.late    / g.total) * 100 : 0
              const aPct = g.total > 0 ? (g.absent  / g.total) * 100 : 0
              const hPct = g.total > 0 ? (g.holiday / g.total) * 100 : 0
              const started = g.marked > 0
              return (
                <div key={g.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: '0 0 clamp(80px, 28%, 150px)', fontSize: '.76rem', fontWeight: 600,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      color: '#334155' }} title={g.name}>{g.name}</div>
                    {noSession ? (
                      <div style={{ flex: 1, fontSize: '.73rem', color: 'var(--muted)', fontStyle: 'italic' }}>
                        No session recorded
                      </div>
                    ) : (
                      <>
                        {/* Segmented bar */}
                        <div style={{ flex: 1, height: 9, borderRadius: 5, overflow: 'hidden',
                          background: '#eef0f7', display: 'flex' }}>
                          {pPct > 0 && <div style={{ width: `${pPct}%`, background: '#16a34a', transition: 'width .4s ease' }} />}
                          {lPct > 0 && <div style={{ width: `${lPct}%`, background: '#d97706', transition: 'width .4s ease' }} />}
                          {aPct > 0 && <div style={{ width: `${aPct}%`, background: '#ef4444', transition: 'width .4s ease' }} />}
                          {hPct > 0 && <div style={{ width: `${hPct}%`, background: '#0284c7', transition: 'width .4s ease' }} />}
                        </div>
                        {/* Count */}
                        <div style={{ flex: '0 0 44px', textAlign: 'right', fontSize: '.76rem',
                          fontWeight: 800, color: started ? '#0f1229' : 'var(--muted)',
                          fontVariantNumeric: 'tabular-nums' }}>
                          {g.marked}/{g.total}
                        </div>
                        {/* Breakdown chips */}
                        <div style={{ flex: '0 0 auto', display: 'flex', gap: 5, fontSize: '.66rem', fontWeight: 700 }}>
                          {g.present > 0 && <span style={{ color: '#16a34a' }}>P{g.present}</span>}
                          {g.late    > 0 && <span style={{ color: '#d97706' }}>L{g.late}</span>}
                          {g.absent  > 0 && <span style={{ color: '#ef4444' }}>A{g.absent}</span>}
                          {g.holiday > 0 && <span style={{ color: '#0284c7' }}>H{g.holiday}</span>}
                          {!started && (
                            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>not started</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
            {groups.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: '.82rem', padding: '12px 0' }}>
                {isToday ? 'No groups with students found' : 'No data found for this date'}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

let _dashCache = null
let _dashCacheAt = 0
const DASH_CACHE_TTL = 2 * 60 * 1000

export default function AdminDashboard({ setTab }) {
  const { hasRole } = useAuth()
  const [data, setData]         = useState(null)
  const [loading, setLoading]   = useState(true)
  const [showRS, setShowRS]     = useState(false)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportData, setReportData] = useState(null)
  const reportRef = useRef(null)

  useEffect(() => { load() }, [])

  async function loadData() {
    if (_dashCache && Date.now() - _dashCacheAt < DASH_CACHE_TTL) {
      setData(_dashCache)
      return
    }
    const today = todayISO()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)
    const fromDate = cutoff.toISOString().split('T')[0]

    const [
      { count: totalStudents },
      { count: totalGroups },
      { count: totalTeachers },
      { count: pendingStudents },
      { count: pendingTeachers },
      { data: scRows },
      { data: groupRows },
      { data: teacherRows },
      { data: todaySessions },
      { data: attStats },
      { data: studentRows },
      { data: tgRows },
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('groups').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
      supabase.from('parent_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('teacher_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('student_classes').select('student_id, group_id'),
      supabase.from('groups').select('id, name, class_type, teacher_id, students(date_of_birth)').order('name'),
      supabase.from('users').select('id, name, last_login, last_seen').eq('role', 'teacher').order('name'),
      supabase.from('attendance_sessions').select('id, group_id').eq('session_date', today),
      supabase.rpc('get_dashboard_attendance_stats', { from_date: fromDate }),
      supabase.from('students').select('id, first_name, last_name, group_id').eq('active', true),
      supabase.from('teacher_groups').select('teacher_id, group_id'),
    ])

    const scInGroupIds = new Set((scRows || []).map(r => r.student_id))
    const scGroupCountMap = {}
    ;(scRows || []).forEach(r => { scGroupCountMap[r.group_id] = (scGroupCountMap[r.group_id] || 0) + 1 })
    const unassignedStudents = (studentRows || []).filter(s => !s.group_id && !scInGroupIds.has(s.id)).length

    const teacherMap = {}
    ;(teacherRows || []).forEach(t => { teacherMap[t.id] = t })

    const tgGroupMap = {}
    ;(tgRows || []).forEach(r => {
      if (!tgGroupMap[r.group_id]) tgGroupMap[r.group_id] = []
      const t = teacherMap[r.teacher_id]
      if (t) tgGroupMap[r.group_id].push(t.name)
    })

    const doneGroupIds = new Set((todaySessions || []).map(s => s.group_id))

    const { groupAtt = {}, studentAtt = {} } = attStats || {}

    const studentMap = {}
    ;(studentRows || []).forEach(s => { studentMap[s.id] = s })

    const enrichedGroups = (groupRows || []).map(g => {
      const ga = groupAtt[g.id] || { total: 0, attended: 0 }
      const teacherNames = tgGroupMap[g.id]
        || (g.teacher_id && teacherMap[g.teacher_id] ? [teacherMap[g.teacher_id].name] : [])
      return {
        ...g,
        teacherNames,
        doneToday:    doneGroupIds.has(g.id),
        studentCount: (g.class_type && g.class_type !== 'punjabi')
          ? (scGroupCountMap[g.id] || 0)
          : (g.students || []).length,
        ageRange:     ageRange(g.students),
        attPct:       pct(ga.attended, ga.total),
      }
    })

    const lowestStudents = Object.entries(studentAtt)
      .filter(([, s]) => s.total >= 3)
      .map(([id, s]) => {
        const st  = studentMap[id]
        const grp = st ? groupRows?.find(g => g.id === st.group_id) : null
        return {
          id,
          name:      st ? [st.first_name, st.last_name].filter(Boolean).join(' ') : 'Unknown',
          groupName: grp?.name || '—',
          attPct:    pct(s.attended, s.total),
          sessions:  s.total,
        }
      })
      .sort((a, b) => (a.attPct ?? 100) - (b.attPct ?? 100))
      .slice(0, 10)

    const leastActive = [...(teacherRows || [])].sort((a, b) => {
      const av = a.last_seen || a.last_login
      const bv = b.last_seen || b.last_login
      if (!av && !bv) return a.name.localeCompare(b.name)
      if (!av) return -1
      if (!bv) return 1
      return new Date(av) - new Date(bv)
    })

    const result = {
      totalStudents, totalGroups, totalTeachers,
      pendingStudents, pendingTeachers,
      enrichedGroups, lowestStudents, leastActive,
      todayCount: doneGroupIds.size,
      unassignedStudents: unassignedStudents || 0,
    }
    _dashCache = result
    _dashCacheAt = Date.now()
    setData(result)
  }

  async function load() {
    try { await loadData() }
    catch (err) { console.error('Dashboard load error:', err) }
    finally { setLoading(false) }
  }

  async function generateWeeklyReport() {
    setReportBusy(true)
    try {
      const { friday, saturday } = getLastWeekend()
      const [
        { data: groupRows },
        { data: teacherRows },
        { data: tgRows },
        { data: sessions },
        { data: records },
      ] = await Promise.all([
        supabase.from('groups').select('id, name, teacher_id, class_type').order('name'),
        supabase.from('users').select('id, name').eq('role', 'teacher'),
        supabase.from('teacher_groups').select('teacher_id, group_id'),
        supabase.from('attendance_sessions').select('id, group_id, session_date').in('session_date', [friday, saturday]),
        supabase.from('attendance_records').select('session_id, group_id, status, session_date').in('session_date', [friday, saturday]),
      ])

      const teacherMap = Object.fromEntries((teacherRows || []).map(t => [t.id, t.name]))
      const tgMap = {}
      ;(tgRows || []).forEach(r => {
        if (!tgMap[r.group_id]) tgMap[r.group_id] = []
        if (teacherMap[r.teacher_id]) tgMap[r.group_id].push(teacherMap[r.teacher_id])
      })

      const punjabiGroups = (groupRows || []).filter(g => g.class_type === 'punjabi' || !g.class_type)
      const submittedGroupIds = new Set((sessions || []).map(s => s.group_id))

      const counts = {}
      ;(records || []).forEach(r => {
        if (!counts[r.group_id]) counts[r.group_id] = { present: 0, absent: 0, late: 0 }
        if (counts[r.group_id][r.status] !== undefined) counts[r.group_id][r.status]++
      })

      const groupSummaries = punjabiGroups.map(g => {
        const c = counts[g.id] || { present: 0, absent: 0, late: 0 }
        const marked = c.present + c.absent + c.late
        const attended = c.present + c.late
        const teacherNames = tgMap[g.id] || (g.teacher_id && teacherMap[g.teacher_id] ? [teacherMap[g.teacher_id]] : [])
        return {
          name: g.name,
          teacherNames,
          submitted: submittedGroupIds.has(g.id),
          present: c.present, absent: c.absent, late: c.late,
          pct: marked > 0 ? Math.round((attended / marked) * 100) : null,
        }
      })

      const totalMarked   = groupSummaries.reduce((s, g) => s + g.present + g.absent + g.late, 0)
      const totalAttended = groupSummaries.reduce((s, g) => s + g.present + g.late, 0)
      const overallPct = totalMarked > 0 ? Math.round((totalAttended / totalMarked) * 100) : null
      const best = [...groupSummaries].filter(g => g.pct !== null).sort((a, b) => b.pct - a.pct)[0] || null
      const missing = groupSummaries.filter(g => !g.submitted)

      setReportData({ friday, saturday, groupSummaries, overallPct, best, missing })
    } catch (err) {
      alert('Could not generate report: ' + err.message)
      setReportBusy(false)
    }
  }

  useEffect(() => {
    if (!reportData || !reportRef.current) return
    let cancelled = false
    ;(async () => {
      try {
        const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' })
        if (cancelled) return
        const url = canvas.toDataURL('image/png')
        const a = document.createElement('a')
        a.href = url
        a.download = `weekly-report-${reportData.saturday}.png`
        a.click()
      } catch (err) {
        alert('Could not create image: ' + err.message)
      } finally {
        if (!cancelled) { setReportData(null); setReportBusy(false) }
      }
    })()
    return () => { cancelled = true }
  }, [reportData])

  if (loading) return <div className="spinner" />
  if (!data) return (
    <div className="card">
      <div className="alert alert-danger">Dashboard failed to load. Check your connection and refresh.</div>
    </div>
  )

  if (showRS) return (
    <>
      <button onClick={() => setShowRS(false)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16,
          background: 'white', border: '1px solid var(--border)', borderRadius: 8,
          padding: '7px 14px', fontSize: '.82rem', fontWeight: 700, color: 'var(--primary)',
          cursor: 'pointer', fontFamily: 'inherit' }}>
        ← Back to Dashboard
      </button>
      <AdminRegisterStatus />
    </>
  )

  const { totalStudents, totalGroups, totalTeachers,
    pendingStudents, pendingTeachers, unassignedStudents,
    enrichedGroups, lowestStudents, leastActive, todayCount } = data

  const notDoneGroups = enrichedGroups.filter(g => !g.doneToday)
  const classDay      = isClassDay()
  const totalPending  = (pendingStudents || 0) + (pendingTeachers || 0)

  return (
    <>
      <style>{`
        .kpi-card:hover { box-shadow: 0 6px 20px rgba(30,26,110,.16) !important; transform: translateY(-2px) }
        .group-health-card:hover { box-shadow: 0 4px 16px rgba(30,26,110,.14) !important; transform: translateY(-2px) }
        @media (max-width: 820px) {
          .dash-kpi { grid-template-columns: 1fr 1fr !important }
        }
      `}</style>

      {/* Missing register warning */}
      {/* Pending applications — always at top */}
      {totalPending > 0 && (
        <div onClick={() => setTab('applications')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fffbeb',
            border: '1px solid #fde68a', borderLeft: '4px solid #d97706', borderRadius: 10,
            padding: '12px 16px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(217,119,6,.08)' }}>
          <span style={{ fontSize: '1.15rem' }}>📋</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, color: '#92400e' }}>
              {totalPending} pending application{totalPending > 1 ? 's' : ''} awaiting review
            </span>
            <span style={{ fontSize: '.78rem', color: '#b45309', marginLeft: 8 }}>
              {[
                pendingStudents > 0 && `${pendingStudents} student${pendingStudents > 1 ? 's' : ''}`,
                pendingTeachers > 0 && `${pendingTeachers} teacher${pendingTeachers > 1 ? 's' : ''}`,
              ].filter(Boolean).join(' · ')}
            </span>
          </div>
          <span style={{ fontWeight: 700, color: '#d97706', whiteSpace: 'nowrap' }}>Review →</span>
        </div>
      )}

      {/* Unassigned students warning */}
      {unassignedStudents > 0 && (
        <div onClick={() => setTab('students')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#faf5ff',
            border: '1px solid #e9d5ff', borderLeft: '4px solid #9333ea', borderRadius: 10,
            padding: '12px 16px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(147,51,234,.08)' }}>
          <span style={{ fontSize: '1.15rem' }}>👤</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, color: '#6b21a8' }}>
              {unassignedStudents} student{unassignedStudents > 1 ? 's have' : ' has'} no group assigned
            </span>
            <span style={{ fontSize: '.78rem', color: '#7e22ce', marginLeft: 8 }}>
              They will not appear in any register until assigned
            </span>
          </div>
          <span style={{ fontWeight: 700, color: '#9333ea', whiteSpace: 'nowrap' }}>Assign →</span>
        </div>
      )}

      {/* Missing register warning */}
      {classDay && notDoneGroups.length > 0 && (
        <div onClick={() => setShowRS(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fef2f2',
            border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', borderRadius: 10,
            padding: '12px 16px', cursor: 'pointer', boxShadow: '0 1px 4px rgba(220,38,38,.08)' }}>
          <span style={{ fontSize: '1.15rem' }}>⚠</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 700, color: '#dc2626' }}>
              {notDoneGroups.length} group{notDoneGroups.length > 1 ? 's have' : ' has'} not submitted today's register
            </span>
            <span style={{ fontSize: '.78rem', color: '#991b1b', marginLeft: 8 }}>
              {notDoneGroups.slice(0, 5).map(g => g.name).join(', ')}
              {notDoneGroups.length > 5 ? ` +${notDoneGroups.length - 5} more` : ''}
            </span>
          </div>
          <span style={{ fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>View Status →</span>
        </div>
      )}

      {/* KPI strip */}
      <div className="dash-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          {
            label: 'Active Students',
            value: totalStudents ?? 0,
            sub: `across ${totalGroups ?? 0} groups`,
            accent: '#1e1a6e',
            tab: 'students',
          },
          {
            label: "Today's Registers",
            value: `${todayCount}/${totalGroups ?? 0}`,
            sub: classDay && notDoneGroups.length > 0
              ? `${notDoneGroups.length} outstanding`
              : classDay ? 'All submitted!' : 'Not a class day',
            accent: classDay && notDoneGroups.length > 0 ? '#dc2626' : '#16a34a',
            subColor: classDay && notDoneGroups.length > 0 ? '#dc2626' : '#16a34a',
            action: () => setShowRS(true),
          },
          {
            label: 'Teachers',
            value: totalTeachers ?? 0,
            sub: 'registered accounts',
            accent: '#d97706',
            tab: 'users',
          },
          {
            label: 'Pending',
            value: totalPending,
            sub: totalPending === 0 ? 'Nothing pending' : `application${totalPending > 1 ? 's' : ''} to review`,
            accent: totalPending > 0 ? '#dc2626' : '#16a34a',
            subColor: totalPending > 0 ? '#dc2626' : '#16a34a',
            tab: 'applications',
          },
        ].map(({ label, value, sub, accent, subColor, tab, action }) => (
          <div key={label}
            className="kpi-card"
            onClick={() => action ? action() : setTab(tab)}
            style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 10,
              padding: '16px 18px', cursor: 'pointer', position: 'relative', overflow: 'hidden',
              boxShadow: '0 1px 4px rgba(30,26,110,.06)', transition: 'box-shadow .15s, transform .15s' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: accent, borderRadius: '10px 10px 0 0' }} />
            <div style={{ fontSize: '.65rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.08em', color: accent, marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1, color: '#0f1229',
              fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontSize: '.71rem', marginTop: 5, color: subColor || 'var(--muted)' }}>{sub}</div>
          </div>
        ))}
      </div>

      {hasRole('admin') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-outline btn-sm" disabled={reportBusy} onClick={generateWeeklyReport}>
            {reportBusy ? 'Generating…' : '📄 Download Weekly Report (Punjabi)'}
          </button>
          <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
            Covers the most recent Friday + Saturday
          </span>
        </div>
      )}

      {reportData && (
        <div ref={reportRef} style={{
          position: 'fixed', top: 0, left: -9999, width: 800, background: '#ffffff',
          padding: 40, fontFamily: 'Arial, Helvetica, sans-serif', color: '#1a1a2e',
          boxSizing: 'border-box',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 24, borderBottom: '3px solid #1e1a6e', paddingBottom: 16 }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>Weekly Report — Punjabi Classes</div>
            <div style={{ fontSize: '.95rem', color: '#64748b', marginTop: 4 }}>
              {fmtDate(reportData.friday)} – {fmtDate(reportData.saturday)}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 60, marginBottom: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#1e1a6e' }}>
                {reportData.overallPct === null ? '—' : `${reportData.overallPct}%`}
              </div>
              <div style={{ fontSize: '.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Overall Attendance
              </div>
            </div>
            {reportData.best && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.4rem', fontWeight: 800, color: '#16a34a' }}>{reportData.best.pct}%</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Best — {reportData.best.name}
                </div>
              </div>
            )}
          </div>

          {reportData.missing.length > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
              padding: '10px 14px', marginBottom: 20, fontSize: '.85rem', color: '#991b1b' }}>
              ⚠ Register not submitted: {reportData.missing.map(g => g.name).join(', ')}
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                <th style={{ padding: '8px 10px' }}>Group</th>
                <th style={{ padding: '8px 10px' }}>Teacher</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Present</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Late</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Absent</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {reportData.groupSummaries.map((g, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{g.name}</td>
                  <td style={{ padding: '7px 10px', color: '#64748b' }}>{g.teacherNames.join(', ') || '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>{g.present}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>{g.late}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>{g.absent}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>
                    {g.pct === null ? '—' : `${g.pct}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 24, textAlign: 'center', fontSize: '.72rem', color: '#94a3b8' }}>
            Generated {fmtDate(new Date().toISOString())}
          </div>
        </div>
      )}

      {/* Live attendance widget */}
      <LiveAttendanceWidget />

      {/* Group health grid */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: '.67rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.08em', color: 'var(--muted)' }}>Group Overview</span>
          <span style={{ fontSize: '.67rem', color: 'var(--muted)' }}>top border = register · ring = attendance</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))', gap: 10 }}>
          {enrichedGroups.map(g => {
            const c      = attColor(g.attPct)
            const angle  = g.attPct !== null ? `${g.attPct * 3.6}deg` : '0deg'
            const ringBg = `conic-gradient(${c} ${angle}, #e2e8f0 0)`
            const topBorder = g.doneToday ? '#16a34a' : classDay ? '#dc2626' : '#cbd5e1'
            return (
              <div key={g.id}
                className="group-health-card"
                onClick={() => setTab('groups')}
                style={{ background: 'white', borderRadius: 10, padding: '12px 13px',
                  border: '1px solid var(--border)', borderTop: `3px solid ${topBorder}`,
                  cursor: 'pointer', boxShadow: '0 1px 4px rgba(30,26,110,.06)',
                  display: 'flex', flexDirection: 'column', gap: 7,
                  transition: 'box-shadow .15s, transform .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ fontSize: '.79rem', fontWeight: 700, lineHeight: 1.3, flex: 1, color: '#0f1229' }}>
                    {g.name}
                  </div>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: ringBg,
                    flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 27, height: 27, borderRadius: '50%', background: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '.58rem', fontWeight: 800, color: c }}>
                      {g.attPct !== null ? `${g.attPct}%` : '—'}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '.69rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  <strong style={{ color: '#334155' }}>{g.studentCount}</strong> students
                  {g.teacherNames.length > 0 && (
                    <>
                      {' · '}
                      <span
                        onClick={e => { e.stopPropagation(); setTab('users') }}
                        style={{ color: '#1e1a6e', fontWeight: 600, textDecoration: 'underline',
                          textDecorationStyle: 'dotted', cursor: 'pointer' }}
                        title="View teachers">
                        {g.teacherNames[0]}
                        {g.teacherNames.length > 1 ? ` +${g.teacherNames.length - 1}` : ''}
                      </span>
                    </>
                  )}
                </div>
                <div style={{ fontSize: '.64rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  display: 'inline-block', alignSelf: 'flex-start',
                  background: g.doneToday ? '#f0fdf4' : classDay ? '#fef2f2' : '#f8fafc',
                  color: g.doneToday ? '#16a34a' : classDay ? '#dc2626' : '#94a3b8' }}>
                  {g.doneToday ? '✓ Done' : classDay ? '⚠ Missing' : '— Not submitted'}
                </div>
              </div>
            )
          })}
          {enrichedGroups.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--muted)', padding: 32 }}>
              No groups found
            </div>
          )}
        </div>
      </div>

      {/* Students needing attention */}
      {lowestStudents.length > 0 && (
        <div className="card">
          <div className="card-title">Students Needing Attention
            <span style={{ fontSize: '.73rem', fontWeight: 400, color: 'var(--muted)' }}>
              last 90 days · min 3 sessions · lowest first
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Student</th>
                  <th>Group</th>
                  <th>Sessions</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {lowestStudents.map((s, i) => {
                  const c = attColor(s.attPct)
                  return (
                    <tr key={s.id}>
                      <td style={{ color: 'var(--muted)', fontWeight: 700, width: 32 }}>{i + 1}</td>
                      <td style={{ fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => setTab('students')}>{s.name}</td>
                      <td style={{ fontSize: '.82rem', cursor: 'pointer' }}
                        onClick={() => setTab('groups')}>
                        <span style={{ color: '#1e1a6e', fontWeight: 600 }}>{s.groupName}</span>
                      </td>
                      <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{s.sessions}</td>
                      <td><span style={{ fontWeight: 700, color: c }}>{s.attPct}%</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Teacher app activity */}
      <div className="card">
        <div className="card-title">Teacher App Activity
          <span style={{ fontSize: '.73rem', fontWeight: 400, color: 'var(--muted)' }}>least active first</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>#</th><th>Teacher</th><th>Last Seen</th><th>Last Login</th></tr>
            </thead>
            <tbody>
              {leastActive.map((t, i) => {
                const activityRef = t.last_seen || t.last_login
                const daysSince = activityRef
                  ? Math.floor((Date.now() - new Date(activityRef).getTime()) / 86400000)
                  : null
                const chip = !activityRef || daysSince > 14
                  ? { bg: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
                  : daysSince > 7
                  ? { bg: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }
                  : { bg: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }
                return (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--muted)', fontWeight: 700, width: 32 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, cursor: 'pointer' }}
                      onClick={() => setTab('users')}>{t.name}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 10px', borderRadius: 12, fontSize: '.69rem', fontWeight: 700,
                        background: chip.bg, color: chip.color, border: chip.border }}>
                        ● {t.last_seen ? fmtDate(t.last_seen) : 'Never'}
                      </span>
                    </td>
                    <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                      {t.last_login ? fmtDate(t.last_login) : 'Never logged in'}
                    </td>
                  </tr>
                )
              })}
              {leastActive.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)' }}>No teachers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
