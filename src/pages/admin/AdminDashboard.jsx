import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fmtDate } from '../../lib/dates'

function todayISO() { return new Date().toISOString().split('T')[0] }

function calcAge(dob) {
  if (!dob) return null
  const d = new Date(dob), now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
  return a
}

function ageRange(students) {
  const ages = (students || []).map(s => calcAge(s.date_of_birth)).filter(a => a !== null)
  if (ages.length === 0) return null
  const mn = Math.min(...ages), mx = Math.max(...ages)
  return mn === mx ? `${mn} yrs` : `${mn}–${mx} yrs`
}

function pct(n, d) { return d === 0 ? null : Math.round((n / d) * 100) }

function PctBadge({ value }) {
  if (value === null) return <span style={{ color: 'var(--muted)' }}>—</span>
  const c = value >= 80 ? '#16a34a' : value >= 60 ? '#d97706' : '#dc2626'
  return <span style={{ fontWeight: 700, color: c }}>{value}%</span>
}

export default function AdminDashboard({ setTab }) {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function loadData() {
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
      { data: groupRows },
      { data: teacherRows },
      { data: todaySessions },
      { data: attRecords },
      { data: studentRows },
      { data: tgRows },
    ] = await Promise.all([
      supabase.from('students').select('*', { count: 'exact', head: true }).eq('active', true),
      supabase.from('groups').select('*', { count: 'exact', head: true }),
      supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
      supabase.from('parent_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('teacher_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('groups').select('id, name, teacher_id, students(date_of_birth)').order('name'),
      supabase.from('users').select('id, name, last_login').eq('role', 'teacher').order('name'),
      supabase.from('attendance_sessions').select('id, group_id').eq('session_date', today),
      supabase.from('attendance_records').select('student_id, group_id, status').gte('session_date', fromDate).limit(100000),
      supabase.from('students').select('id, first_name, last_name, group_id').eq('active', true),
      supabase.from('teacher_groups').select('teacher_id, group_id'),
    ])

    // Teacher lookup
    const teacherMap = {}
    ;(teacherRows || []).forEach(t => { teacherMap[t.id] = t })

    // Group → teacher names from teacher_groups
    const tgGroupMap = {}
    ;(tgRows || []).forEach(r => {
      if (!tgGroupMap[r.group_id]) tgGroupMap[r.group_id] = []
      const t = teacherMap[r.teacher_id]
      if (t) tgGroupMap[r.group_id].push(t.name)
    })

    // Groups that submitted today
    const doneGroupIds = new Set((todaySessions || []).map(s => s.group_id))

    // Attendance stats by group & student
    const groupAtt = {}, studentAtt = {}
    ;(attRecords || []).forEach(r => {
      if (!groupAtt[r.group_id])    groupAtt[r.group_id]    = { total: 0, attended: 0 }
      if (!studentAtt[r.student_id]) studentAtt[r.student_id] = { total: 0, attended: 0 }
      const attended = r.status === 'present' || r.status === 'late'
      groupAtt[r.group_id].total++;    if (attended) groupAtt[r.group_id].attended++
      studentAtt[r.student_id].total++; if (attended) studentAtt[r.student_id].attended++
    })

    // Student name/group lookup
    const studentMap = {}
    ;(studentRows || []).forEach(s => { studentMap[s.id] = s })

    // Enriched groups
    const enrichedGroups = (groupRows || []).map(g => {
      const ga = groupAtt[g.id] || { total: 0, attended: 0 }
      const teacherNames = tgGroupMap[g.id]
        || (g.teacher_id && teacherMap[g.teacher_id] ? [teacherMap[g.teacher_id].name] : [])
      return {
        ...g,
        teacherNames,
        doneToday:    doneGroupIds.has(g.id),
        studentCount: (g.students || []).length,
        ageRange:     ageRange(g.students),
        attPct:       pct(ga.attended, ga.total),
      }
    })

    // Lowest attendance groups (only ones with recorded sessions)
    const groupsByAtt = [...enrichedGroups]
      .filter(g => (groupAtt[g.id]?.total || 0) > 0)
      .sort((a, b) => (a.attPct ?? 100) - (b.attPct ?? 100))

    // Lowest attendance students (min 3 sessions to be meaningful)
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

    // Least active teachers — never logged in first, then oldest login
    const leastActive = [...(teacherRows || [])].sort((a, b) => {
      if (!a.last_login && !b.last_login) return a.name.localeCompare(b.name)
      if (!a.last_login) return -1
      if (!b.last_login) return 1
      return new Date(a.last_login) - new Date(b.last_login)
    })

    setData({
      totalStudents, totalGroups, totalTeachers,
      pendingStudents, pendingTeachers,
      enrichedGroups, groupsByAtt, lowestStudents, leastActive,
      todayCount: doneGroupIds.size,
    })
  }

  async function load() {
    try {
      await loadData()
    } catch (err) {
      console.error('Dashboard load error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="spinner" />
  if (!data)   return (
    <div className="card">
      <div className="alert alert-danger">Dashboard failed to load. Check your connection and refresh.</div>
    </div>
  )

  const { totalStudents, totalGroups, totalTeachers,
    pendingStudents, pendingTeachers,
    enrichedGroups, groupsByAtt, lowestStudents, leastActive, todayCount } = data

  const doneGroups   = enrichedGroups.filter(g => g.doneToday)
  const notDoneGroups = enrichedGroups.filter(g => !g.doneToday)

  return (
    <>
      {/* Stat cards */}
      <div className="stats-grid">
        {[
          { label: 'Students',          value: totalStudents,  tab: 'students' },
          { label: 'Groups',            value: totalGroups,    tab: 'groups'   },
          { label: 'Teachers',          value: totalTeachers,  tab: 'users'    },
          { label: "Today's Registers", value: todayCount,     tab: 'students' },
        ].map(({ label, value, tab }) => (
          <div key={label} className="stat-card" onClick={() => setTab(tab)}
            style={{ cursor: 'pointer', transition: 'box-shadow .15s, transform .15s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(30,26,110,.15)'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = '' }}>
            <div className="stat-number">{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      {/* Pending applications */}
      {(pendingStudents > 0 || pendingTeachers > 0) && (
        <div className="alert alert-warning" style={{ cursor: 'pointer' }} onClick={() => setTab('applications')}>
          {pendingStudents > 0 && <span>{pendingStudents} student application{pendingStudents > 1 ? 's' : ''} awaiting approval. </span>}
          {pendingTeachers > 0 && <span>{pendingTeachers} teacher application{pendingTeachers > 1 ? 's' : ''} awaiting approval.</span>}
          <span style={{ fontWeight: 700, marginLeft: 8 }}>Review →</span>
        </div>
      )}

      {/* Today's register status */}
      <div className="card">
        <div className="card-title">Today's Register Status</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.06em', color: '#16a34a', marginBottom: 8 }}>
              ✓ Submitted ({doneGroups.length})
            </div>
            {doneGroups.length === 0
              ? <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>None yet today</div>
              : doneGroups.map(g => (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', marginBottom: 4, borderRadius: 7,
                    background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                    <span style={{ fontWeight: 600, fontSize: '.83rem' }}>{g.name}</span>
                    <span style={{ fontSize: '.73rem', color: '#16a34a', fontWeight: 600 }}>
                      {g.teacherNames.join(', ') || '—'}
                    </span>
                  </div>
                ))}
          </div>
          <div>
            <div style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '.06em', color: '#dc2626', marginBottom: 8 }}>
              ✗ Not Submitted ({notDoneGroups.length})
            </div>
            {notDoneGroups.length === 0
              ? <div style={{ fontSize: '.82rem', color: '#16a34a', fontWeight: 600 }}>All registers submitted today!</div>
              : notDoneGroups.map(g => (
                  <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '6px 10px', marginBottom: 4, borderRadius: 7,
                    background: '#fef2f2', border: '1px solid #fecaca' }}>
                    <span style={{ fontWeight: 600, fontSize: '.83rem' }}>{g.name}</span>
                    <span style={{ fontSize: '.73rem', color: '#dc2626', fontWeight: 600 }}>
                      {g.teacherNames.join(', ') || 'No teacher'}
                    </span>
                  </div>
                ))}
          </div>
        </div>
      </div>

      {/* Group overview */}
      <div className="card">
        <div className="card-title">Group Overview</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Teacher(s)</th>
                <th>Students</th>
                <th>Age Range</th>
                <th>Attendance (90 days)</th>
              </tr>
            </thead>
            <tbody>
              {enrichedGroups.map(g => (
                <tr key={g.id} style={{ cursor: 'pointer' }} onClick={() => setTab('groups')}>
                  <td style={{ fontWeight: 600 }}>{g.name}</td>
                  <td style={{ fontSize: '.82rem' }}>
                    {g.teacherNames.length > 0
                      ? g.teacherNames.join(', ')
                      : <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td>{g.studentCount}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '.85rem', color: '#475569' }}>
                    {g.ageRange ?? <span style={{ color: 'var(--muted)' }}>—</span>}
                  </td>
                  <td><PctBadge value={g.attPct} /></td>
                </tr>
              ))}
              {enrichedGroups.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)' }}>No groups found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lowest attendance — groups */}
      {groupsByAtt.length > 0 && (
        <div className="card">
          <div className="card-title">Lowest Attendance — Groups
            <span style={{ fontSize: '.75rem', fontWeight: 400, color: 'var(--muted)' }}>last 90 days</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Group</th>
                  <th>Teacher(s)</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {groupsByAtt.map((g, i) => (
                  <tr key={g.id}>
                    <td style={{ color: 'var(--muted)', fontWeight: 700, width: 32 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{g.name}</td>
                    <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{g.teacherNames.join(', ') || '—'}</td>
                    <td><PctBadge value={g.attPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lowest attendance — students */}
      {lowestStudents.length > 0 && (
        <div className="card">
          <div className="card-title">Lowest Attendance — Students
            <span style={{ fontSize: '.75rem', fontWeight: 400, color: 'var(--muted)' }}>last 90 days · min 3 sessions</span>
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
                {lowestStudents.map((s, i) => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setTab('students')}>
                    <td style={{ color: 'var(--muted)', fontWeight: 700, width: 32 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{s.groupName}</td>
                    <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{s.sessions}</td>
                    <td><PctBadge value={s.attPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Teacher app activity — least active first */}
      <div className="card">
        <div className="card-title">Teacher App Activity
          <span style={{ fontSize: '.75rem', fontWeight: 400, color: 'var(--muted)' }}>least active first</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Teacher</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {leastActive.map((t, i) => (
                <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => setTab('users')}>
                  <td style={{ color: 'var(--muted)', fontWeight: 700, width: 32 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td>
                    {t.last_login
                      ? <span style={{ fontSize: '.83rem', color: 'var(--muted)' }}>{fmtDate(t.last_login)}</span>
                      : <span style={{ fontSize: '.83rem', fontWeight: 700, color: '#dc2626' }}>Never logged in</span>}
                  </td>
                </tr>
              ))}
              {leastActive.length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--muted)' }}>No teachers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
