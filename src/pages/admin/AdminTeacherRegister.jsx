import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { fmtDate } from '../../lib/dates'

function todayISO() { return new Date().toISOString().split('T')[0] }

const STATUS_LABEL = { present: 'Present', absent: 'Absent', late: 'Late' }
const STATUS_COLOR  = { present: '#16a34a', absent: '#dc2626', late: '#d97706' }
const STATUS_BG     = { present: '#f0fdf4', absent: '#fef2f2', late: '#fffbeb' }
const STATUS_BORDER = { present: '#bbf7d0', absent: '#fecaca', late: '#fde68a' }

export default function AdminTeacherRegister({ readOnly }) {
  const { profile } = useAuth()
  const [date, setDate]       = useState(todayISO)
  const [teachers, setTeachers] = useState([])
  const [attendance, setAttendance] = useState({})   // teacher_id → { id, status, notes }
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState({})
  const [noteOpen, setNoteOpen] = useState({})
  const [history, setHistory] = useState(null)
  const [histLoading, setHistLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: teacherRows }, { data: tgRows }, { data: attRows }] = await Promise.all([
      supabase.from('users').select('id, name, group_id').eq('role', 'teacher').order('name'),
      supabase.from('teacher_groups').select('teacher_id, groups(id, name)'),
      supabase.from('teacher_attendance').select('id, teacher_id, status, notes').eq('session_date', date),
    ])

    // Build group map per teacher
    const tgMap = {}
    ;(tgRows || []).forEach(r => {
      if (!tgMap[r.teacher_id]) tgMap[r.teacher_id] = []
      if (r.groups) tgMap[r.teacher_id].push(r.groups.name)
    })

    // For teachers only in groups.teacher_id (not teacher_groups), fetch their group name
    const primaryGroupIds = (teacherRows || [])
      .filter(t => t.group_id && !tgMap[t.id])
      .map(t => t.group_id)

    let primaryGroupMap = {}
    if (primaryGroupIds.length > 0) {
      const { data: pGroups } = await supabase
        .from('groups').select('id, name').in('id', primaryGroupIds)
      ;(pGroups || []).forEach(g => { primaryGroupMap[g.id] = g.name })
    }

    const enriched = (teacherRows || []).map(t => ({
      ...t,
      groupNames: tgMap[t.id] || (t.group_id && primaryGroupMap[t.group_id] ? [primaryGroupMap[t.group_id]] : []),
    }))

    const attMap = {}
    ;(attRows || []).forEach(r => { attMap[r.teacher_id] = { id: r.id, status: r.status, notes: r.notes || '' } })

    setTeachers(enriched)
    setAttendance(attMap)
    setLoading(false)
  }, [date])

  useEffect(() => { load() }, [load])

  async function markStatus(teacher, status) {
    if (readOnly) return
    const existing = attendance[teacher.id]
    setBusy(b => ({ ...b, [teacher.id]: true }))
    try {
      if (existing?.id) {
        if (existing.status === status) {
          // Tap same status → clear
          await supabase.from('teacher_attendance').delete().eq('id', existing.id)
          setAttendance(prev => { const n = { ...prev }; delete n[teacher.id]; return n })
        } else {
          await supabase.from('teacher_attendance').update({ status, marked_by: profile.id }).eq('id', existing.id)
          setAttendance(prev => ({ ...prev, [teacher.id]: { ...prev[teacher.id], status } }))
        }
      } else {
        const { data, error } = await supabase.from('teacher_attendance').insert({
          teacher_id: teacher.id, session_date: date, status, marked_by: profile.id,
        }).select('id').single()
        if (error) throw error
        setAttendance(prev => ({ ...prev, [teacher.id]: { id: data.id, status, notes: '' } }))
      }
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(b => ({ ...b, [teacher.id]: false })) }
  }

  async function saveNote(teacher) {
    if (readOnly) return
    const existing = attendance[teacher.id]
    const notes = noteOpen[teacher.id] ?? ''
    if (!existing?.id) { alert('Mark attendance first, then add a note.'); return }
    setBusy(b => ({ ...b, [teacher.id]: true }))
    try {
      await supabase.from('teacher_attendance').update({ notes }).eq('id', existing.id)
      setAttendance(prev => ({ ...prev, [teacher.id]: { ...prev[teacher.id], notes } }))
      setNoteOpen(prev => { const n = { ...prev }; delete n[teacher.id]; return n })
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(b => ({ ...b, [teacher.id]: false })) }
  }

  async function loadHistory() {
    setHistLoading(true)
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - 60)
    const { data } = await supabase
      .from('teacher_attendance')
      .select('teacher_id, session_date, status')
      .gte('session_date', fromDate.toISOString().split('T')[0])
      .order('session_date', { ascending: false })
    setHistory(data || [])
    setHistLoading(false)
  }

  const present  = teachers.filter(t => attendance[t.id]?.status === 'present').length
  const absent   = teachers.filter(t => attendance[t.id]?.status === 'absent').length
  const late     = teachers.filter(t => attendance[t.id]?.status === 'late').length
  const unmarked = teachers.length - present - absent - late

  if (loading) return <div className="spinner" />

  return (
    <>
      {/* Date selector + summary tiles */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 16 }}>
        <div className="card" style={{ flex: '0 0 auto', margin: 0, padding: '14px 16px' }}>
          <label style={{ fontSize: '.72rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.06em', color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            Date
          </label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            style={{ fontSize: '.9rem', fontWeight: 600, padding: '6px 10px', borderRadius: 8,
              border: '1px solid var(--border)' }} />
        </div>

        {[
          { value: present,  label: 'Present', color: '#16a34a' },
          { value: absent,   label: 'Absent',  color: '#dc2626' },
          { value: late,     label: 'Late',    color: '#d97706' },
          { value: unmarked, label: 'Not marked', color: '#94a3b8' },
        ].map(({ value, label, color }) => (
          <div key={label} className="card" style={{ flex: 1, minWidth: 100, margin: 0,
            padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '.72rem', fontWeight: 700, color, textTransform: 'uppercase',
              letterSpacing: '.06em', marginTop: 4, opacity: .85 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Register table */}
      <div className="card">
        <div className="card-title">
          Teacher Register — {date === todayISO() ? 'Today' : fmtDate(date)}
          {readOnly && (
            <span style={{ fontSize: '.75rem', fontWeight: 400, color: '#94a3b8' }}>View only</span>
          )}
        </div>

        {teachers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            No teachers found. Add teacher accounts first.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Teacher</th>
                  <th>Group(s)</th>
                  <th style={{ width: '280px' }}>Attendance</th>
                  <th style={{ width: '120px' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map(t => {
                  const att     = attendance[t.id]
                  const isBusy  = !!busy[t.id]
                  const noteVal = noteOpen[t.id] ?? att?.notes ?? ''
                  const hasNote = att?.notes?.trim()

                  return (
                    <tr key={t.id}
                      style={{ background: att ? STATUS_BG[att.status] : 'white',
                        borderBottom: `1px solid ${att ? STATUS_BORDER[att.status] : 'var(--border)'}` }}>

                      {/* Teacher name + avatar */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%',
                            background: att ? STATUS_COLOR[att.status] : '#94a3b8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'white', fontWeight: 700, fontSize: '.75rem', flexShrink: 0 }}>
                            {t.name?.split(' ').map(w => w[0]).slice(0, 2).join('')}
                          </div>
                          <span style={{ fontWeight: 600, fontSize: '.88rem' }}>{t.name}</span>
                        </div>
                      </td>

                      {/* Groups */}
                      <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                        {t.groupNames.length > 0 ? t.groupNames.join(', ') : <span style={{ fontStyle: 'italic' }}>No group</span>}
                      </td>

                      {/* Status buttons */}
                      <td>
                        {!readOnly ? (
                          <div style={{ display: 'flex', gap: 5 }}>
                            {['present', 'absent', 'late'].map(s => (
                              <button key={s}
                                disabled={isBusy}
                                onClick={() => markStatus(t, s)}
                                style={{
                                  padding: '5px 11px', borderRadius: 7,
                                  fontSize: '.74rem', fontWeight: 700,
                                  fontFamily: 'inherit',
                                  cursor: isBusy ? 'not-allowed' : 'pointer',
                                  transition: 'all .12s',
                                  border: `1px solid ${att?.status === s ? STATUS_COLOR[s] : '#e2e8f0'}`,
                                  background: att?.status === s ? STATUS_COLOR[s] : 'white',
                                  color: att?.status === s ? 'white' : '#94a3b8',
                                }}>
                                {STATUS_LABEL[s]}
                              </button>
                            ))}
                          </div>
                        ) : att?.status ? (
                          <span style={{ fontWeight: 700, color: STATUS_COLOR[att.status], fontSize: '.83rem' }}>
                            {STATUS_LABEL[att.status]}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)', fontSize: '.82rem' }}>—</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td>
                        {noteOpen[t.id] !== undefined ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <input value={noteVal}
                              onChange={e => setNoteOpen(prev => ({ ...prev, [t.id]: e.target.value }))}
                              placeholder="Add note…"
                              style={{ fontSize: '.78rem', padding: '4px 8px', borderRadius: 6,
                                border: '1px solid var(--border)', fontFamily: 'inherit', width: 110 }} />
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => saveNote(t)} disabled={isBusy}
                                style={{ fontSize: '.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 5,
                                  background: 'var(--primary)', color: 'white', border: 'none',
                                  cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                              <button onClick={() => setNoteOpen(prev => { const n = { ...prev }; delete n[t.id]; return n })}
                                style={{ fontSize: '.7rem', padding: '3px 6px', borderRadius: 5,
                                  background: '#f1f5f9', color: '#64748b', border: 'none',
                                  cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setNoteOpen(prev => ({ ...prev, [t.id]: att?.notes || '' }))}
                            disabled={readOnly}
                            style={{ fontSize: '.74rem', padding: '4px 8px', borderRadius: 6,
                              border: '1px solid var(--border)', background: 'white',
                              color: hasNote ? '#1e1a6e' : '#94a3b8',
                              fontWeight: hasNote ? 700 : 400,
                              cursor: readOnly ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                            {hasNote ? '📝 ' + att.notes.substring(0, 18) + (att.notes.length > 18 ? '…' : '') : 'Add note'}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attendance history */}
      <div className="card">
        <div className="card-title">
          Attendance History — Last 60 Days
          {history === null && (
            <button onClick={loadHistory} disabled={histLoading}
              style={{ fontSize: '.75rem', fontWeight: 700, padding: '5px 12px', borderRadius: 7,
                border: '1px solid var(--border)', background: 'white', color: 'var(--muted)',
                cursor: 'pointer', fontFamily: 'inherit' }}>
              {histLoading ? 'Loading…' : 'Load History'}
            </button>
          )}
        </div>

        {history !== null && (
          history.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '.85rem', padding: '8px 0' }}>No records in the last 60 days.</div>
          ) : (() => {
            // Group records by session_date, summarise
            const byDate = {}
            history.forEach(r => {
              if (!byDate[r.session_date]) byDate[r.session_date] = { present: 0, absent: 0, late: 0 }
              byDate[r.session_date][r.status] = (byDate[r.session_date][r.status] || 0) + 1
            })
            const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
            return (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Present</th>
                      <th>Absent</th>
                      <th>Late</th>
                      <th>Total Marked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dates.map(d => {
                      const row = byDate[d]
                      const total = (row.present || 0) + (row.absent || 0) + (row.late || 0)
                      return (
                        <tr key={d} style={{ cursor: 'pointer' }} onClick={() => setDate(d)}>
                          <td style={{ fontWeight: 600 }}>{fmtDate(d)}</td>
                          <td style={{ color: '#16a34a', fontWeight: 700 }}>{row.present || 0}</td>
                          <td style={{ color: '#dc2626', fontWeight: 700 }}>{row.absent || 0}</td>
                          <td style={{ color: '#d97706', fontWeight: 700 }}>{row.late || 0}</td>
                          <td style={{ color: 'var(--muted)' }}>{total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()
        )}
      </div>
    </>
  )
}
