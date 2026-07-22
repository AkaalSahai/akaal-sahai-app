import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import MedicalBadge from '../../components/MedicalBadge'
import { fmtDate } from '../../lib/dates'

const AVATARS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6']
const color = (i) => AVATARS[i % AVATARS.length]

function todayISO() { return new Date().toISOString().split('T')[0] }

function calcAge(dob) {
  if (!dob) return null
  const d = new Date(dob), now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
  return a
}

export default function TeacherRegister() {
  const { profile }               = useAuth()
  const [myGroups, setMyGroups]   = useState([])
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [groupName, setGroupName] = useState(null)
  const [students, setStudents]   = useState([])
  const [attendance, setAttendance] = useState({})
  const [notes, setNotes]         = useState({})
  const [date, setDate]           = useState(todayISO())
  const [loading, setLoading]     = useState(true)
  const [groupsLoading, setGroupsLoading] = useState(true)
  const [sessionId, setSessionId] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [history, setHistory]     = useState(false)
  const [historyData, setHistoryData] = useState([])
  const [transferOpen, setTransferOpen] = useState({})
  const [transferBusy, setTransferBusy] = useState(null)
  const [removeOpen, setRemoveOpen]     = useState({})
  const [removeBusy, setRemoveBusy]     = useState(null)
  const savingRef    = useRef(null)
  const creatingRef  = useRef(false)
  const notesRef     = useRef({})

  useEffect(() => { notesRef.current = notes }, [notes])
  useEffect(() => { if (profile?.id) loadMyGroups() }, [profile])
  useEffect(() => { if (selectedGroupId) loadStudents() }, [selectedGroupId])
  useEffect(() => { if (selectedGroupId) loadSession()  }, [selectedGroupId, date])

  const isReadOnly = date < todayISO()
  const isToday    = date === todayISO()
  const dayOfWeek  = new Date(date + 'T12:00:00').getDay()
  const isClassDay = dayOfWeek === 5 || dayOfWeek === 6

  async function loadMyGroups() {
    const { data: tg } = await supabase
      .from('teacher_groups')
      .select('group_id, groups(id, name)')
      .eq('teacher_id', profile.id)

    if (tg && tg.length > 0) {
      const grps = tg.map(r => r.groups).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name))
      setMyGroups(grps)
      const defaultGrp = grps.find(g => g.id === profile.group_id) || grps[0]
      setSelectedGroupId(defaultGrp.id)
      setGroupName(defaultGrp.name)
    } else if (profile.group_id) {
      const { data: g } = await supabase.from('groups').select('id, name').eq('id', profile.group_id).single()
      const grps = g ? [g] : []
      setMyGroups(grps)
      setSelectedGroupId(profile.group_id)
      setGroupName(g?.name || null)
    } else {
      setMyGroups([])
      setGroupsLoading(false)
      setLoading(false)
    }
    setGroupsLoading(false)
  }

  function selectGroup(groupId) {
    const grp = myGroups.find(g => g.id === groupId)
    setSelectedGroupId(groupId)
    setGroupName(grp?.name || null)
    setAttendance({})
    setNotes({})
    setSessionId(null)
    setTransferOpen({})
    setRemoveOpen({})
    setSaveState('idle')
    setHistory(false)
    setHistoryData([])
  }

  async function loadStudents() {
    setLoading(true)
    const { data: studentData } = await supabase
      .from('students')
      .select('id, first_name, middle_name, last_name, date_of_birth, medical_notes')
      .eq('group_id', selectedGroupId)
      .eq('active', true)
      .order('first_name')
      .order('last_name')
    setStudents(studentData || [])
    setLoading(false)
  }

  async function loadSession() {
    if (!selectedGroupId) return
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id, records:attendance_records(student_id, status, notes)')
      .eq('group_id', selectedGroupId)
      .eq('session_date', date)
      .maybeSingle()
    if (data) {
      setSessionId(data.id)
      const attMap = {}, noteMap = {}
      ;(data.records || []).forEach(r => {
        attMap[r.student_id]  = r.status
        noteMap[r.student_id] = r.notes || ''
      })
      setAttendance(attMap)
      setNotes(noteMap)
    } else {
      setSessionId(null)
      setAttendance({})
      setNotes({})
    }
    setSaveState('idle')
  }

  async function ensureSession() {
    if (sessionId) return sessionId
    if (creatingRef.current) return null
    creatingRef.current = true
    try {
      const { data, error } = await supabase
        .from('attendance_sessions')
        .insert({ group_id: selectedGroupId, session_date: date, teacher_id: profile.id })
        .select('id').single()
      if (error) throw error
      setSessionId(data.id)
      return data.id
    } finally { creatingRef.current = false }
  }

  async function mark(studentId, status) {
    if (isReadOnly) return
    const current   = attendance[studentId]
    const newStatus = current === status ? null : status

    setAttendance(prev => {
      const next = { ...prev }
      if (newStatus === null) delete next[studentId]
      else next[studentId] = newStatus
      return next
    })
    setSaveState('saving')
    clearTimeout(savingRef.current)
    try {
      if (newStatus === null) {
        if (sessionId) {
          const { error } = await supabase.from('attendance_records')
            .delete().eq('session_id', sessionId).eq('student_id', studentId)
          if (error) throw error
        }
      } else {
        const sid = await ensureSession()
        if (!sid) return
        const { error } = await supabase.from('attendance_records').upsert({
          session_id:   sid,
          student_id:   studentId,
          group_id:     selectedGroupId,
          session_date: date,
          status:       newStatus,
          notes:        notesRef.current[studentId] || null,
        }, { onConflict: 'session_id,student_id' })
        if (error) throw error
      }
      setSaveState('saved')
      savingRef.current = setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      setSaveState('error')
      alert('Could not save: ' + err.message)
    }
  }

  async function saveNote(studentId, text) {
    if (isReadOnly) return
    const currentStatus = attendance[studentId]
    if (!currentStatus) return
    const sid = sessionId || await ensureSession()
    if (!sid) return
    await supabase.from('attendance_records').upsert({
      session_id:   sid,
      student_id:   studentId,
      group_id:     selectedGroupId,
      session_date: date,
      status:       currentStatus,
      notes:        text || null,
    }, { onConflict: 'session_id,student_id' })
  }

  function toggleTransfer(studentId) {
    setTransferOpen(prev => {
      const next = { ...prev }
      if (next[studentId] !== undefined) delete next[studentId]
      else next[studentId] = ''
      return next
    })
  }

  async function submitTransfer(student) {
    const reason = transferOpen[student.id]?.trim()
    if (!reason) { alert('Please explain why this student needs to be transferred.'); return }
    setTransferBusy(student.id)
    try {
      const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')
      const { error } = await supabase.from('transfer_requests').insert({
        student_id: student.id, student_name: fullName,
        from_group_id: selectedGroupId, from_group_name: groupName || null,
        requested_by: profile.id, reason, status: 'pending', request_type: 'transfer',
      })
      if (error) throw error
      alert(`Transfer request submitted for ${fullName}.`)
      setTransferOpen(prev => { const n = { ...prev }; delete n[student.id]; return n })
    } catch (err) { alert('Error: ' + err.message) }
    finally { setTransferBusy(null) }
  }

  function toggleRemove(studentId) {
    setRemoveOpen(prev => {
      const next = { ...prev }
      if (next[studentId] !== undefined) delete next[studentId]
      else next[studentId] = ''
      return next
    })
  }

  async function submitRemoval(student) {
    const reason = removeOpen[student.id]?.trim()
    if (!reason) { alert('Please explain why this student is leaving.'); return }
    setRemoveBusy(student.id)
    try {
      const fullName = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')
      const { error } = await supabase.from('transfer_requests').insert({
        student_id: student.id, student_name: fullName,
        from_group_id: selectedGroupId, from_group_name: groupName || null,
        requested_by: profile.id, reason, status: 'pending', request_type: 'removal',
      })
      if (error) throw error
      alert(`Removal request submitted for ${fullName}. Admin will review and approve.`)
      setRemoveOpen(prev => { const n = { ...prev }; delete n[student.id]; return n })
    } catch (err) { alert('Error: ' + err.message) }
    finally { setRemoveBusy(null) }
  }

  async function loadHistory() {
    setHistory(true)
    setHistoryData([])
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id, session_date, records:attendance_records(student_id, status)')
      .eq('group_id', selectedGroupId)
      .order('session_date', { ascending: false })
      .limit(20)
    setHistoryData(data || [])
  }

  if (groupsLoading) return <div className="spinner" />

  if (!selectedGroupId && myGroups.length === 0) return (
    <div className="card">
      <div className="alert alert-warning">You have not been assigned to a group yet. Please contact the admin.</div>
    </div>
  )

  const present = Object.values(attendance).filter(v => v === 'present').length
  const late    = Object.values(attendance).filter(v => v === 'late').length
  const absent  = Object.values(attendance).filter(v => v === 'absent').length

  const saveLabel = saveState === 'saving' ? '⏳ Saving…'
                  : saveState === 'saved'   ? '✓ Saved'
                  : saveState === 'error'   ? '⚠ Error'
                  : ''

  return (
    <>
      <div className="card">
        <div className="card-title">
          <span>Daily Register</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {saveLabel && (
              <span style={{ fontSize: '.78rem', color: saveState === 'error' ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                {saveLabel}
              </span>
            )}
            <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)}
              style={{ width: 'auto', padding: '7px 10px', fontSize: '.85rem' }} />
            <button className="btn btn-outline btn-sm" onClick={loadHistory}>History</button>
          </div>
        </div>

        {/* Group selector — only shown when teacher has multiple groups */}
        {myGroups.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {myGroups.map(g => (
              <button key={g.id} onClick={() => selectGroup(g.id)}
                style={{ padding: '8px 18px', borderRadius: 8, fontWeight: 600, fontSize: '.85rem',
                  cursor: 'pointer', transition: 'all .15s',
                  border: `2px solid ${selectedGroupId === g.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedGroupId === g.id ? 'var(--primary)' : 'white',
                  color: selectedGroupId === g.id ? 'white' : '#475569' }}>
                {g.name}
              </button>
            ))}
          </div>
        )}

        {isReadOnly && (
          <div className="alert" style={{ background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}>
            Past register — read only. Showing record for {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })} {fmtDate(date)}.
          </div>
        )}

        {isToday && !isClassDay && (
          <div className="alert" style={{ background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }}>
            No class scheduled today — Punjabi classes are on Fridays and Saturdays, 6:30pm – 8:30pm.
          </div>
        )}

        {isToday && sessionId && (
          <div className="alert alert-success">
            Register in progress for {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' })} {fmtDate(date)} — changes save automatically.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          {[['present','#16a34a'], ['late','#d97706'], ['absent','#dc2626']].map(([s,c]) => (
            <div key={s} style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: c }}>
                {s === 'present' ? present : s === 'late' ? late : absent}
              </div>
              <div style={{ fontSize: '.7rem', color: 'var(--muted)', textTransform: 'capitalize' }}>{s}</div>
            </div>
          ))}
          <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{students.length}</div>
            <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Total</div>
          </div>
        </div>

        {loading ? <div className="spinner" /> : (
          <ul className="student-list">
            {students.map((s, i) => {
              const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
              const status   = attendance[s.id]
              const age      = calcAge(s.date_of_birth)
              return (
                <li key={s.id} className="student-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', flexWrap: 'wrap' }}>

                    <div className="student-avatar" style={{ background: color(i), flexShrink: 0 }}>
                      {s.first_name?.[0] ?? '?'}{s.last_name?.[0] ?? '?'}
                    </div>

                    <div style={{ flex: '1 1 100px', minWidth: 80 }}>
                      <div className="student-name" style={{ fontSize: '.88rem' }}>{fullName}</div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
                        {age !== null && (
                          <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#475569',
                            background: '#f1f5f9', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                            {age}y
                          </span>
                        )}
                        <MedicalBadge notes={s.medical_notes} studentName={fullName} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {[['present','Present'],['late','Late'],['absent','Absent']].map(([st, lbl]) => (
                        <button key={st}
                          className={`att-btn att-${st}${status === st ? ' active' : ''}`}
                          style={{ padding: '4px 10px', fontSize: '.76rem' }}
                          onClick={() => mark(s.id, st)}
                          disabled={isReadOnly}>
                          {lbl}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={notes[s.id] || ''}
                      placeholder="Notes"
                      disabled={isReadOnly || !status}
                      style={{ flex: '0 1 110px', minWidth: 60, maxWidth: 110, fontSize: '.76rem',
                        padding: '5px 8px', borderRadius: 8, border: '1.5px solid var(--border)',
                        background: status ? 'white' : '#f8fafc', color: '#374151', outline: 'none' }}
                      onChange={e => setNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                      onBlur={e => saveNote(s.id, e.target.value)}
                    />

                    {!isReadOnly && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button onClick={() => toggleTransfer(s.id)}
                          style={{ padding: '4px 10px', fontSize: '.76rem', borderRadius: 8,
                            border: '1px solid #94a3b8',
                            background: transferOpen[s.id] !== undefined ? '#e0e7ff' : 'white',
                            color: '#475569', cursor: 'pointer' }}>
                          Transfer
                        </button>
                        <button onClick={() => toggleRemove(s.id)}
                          style={{ padding: '4px 10px', fontSize: '.76rem', borderRadius: 8,
                            border: '1px solid #fca5a5',
                            background: removeOpen[s.id] !== undefined ? '#fee2e2' : 'white',
                            color: '#dc2626', cursor: 'pointer' }}>
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {transferOpen[s.id] !== undefined && (
                    <div style={{ marginBottom: 10, padding: '12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                        Transfer request — {[s.first_name, s.last_name].join(' ')}
                      </div>
                      <textarea value={transferOpen[s.id]}
                        onChange={e => setTransferOpen(prev => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="Explain why this student needs to be moved to a different group…"
                        rows={2} style={{ width: '100%', fontSize: '.83rem', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary btn-sm" disabled={transferBusy === s.id} onClick={() => submitTransfer(s)}>
                          {transferBusy === s.id ? 'Submitting…' : 'Submit Transfer Request'}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => toggleTransfer(s.id)}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {removeOpen[s.id] !== undefined && (
                    <div style={{ marginBottom: 10, padding: '12px', background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
                        Removal request — {[s.first_name, s.last_name].join(' ')}
                      </div>
                      <textarea value={removeOpen[s.id]}
                        onChange={e => setRemoveOpen(prev => ({ ...prev, [s.id]: e.target.value }))}
                        placeholder="Explain why this student is leaving (e.g. moved away, no longer attending)…"
                        rows={2} style={{ width: '100%', fontSize: '.83rem', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-danger btn-sm" disabled={removeBusy === s.id} onClick={() => submitRemoval(s)}>
                          {removeBusy === s.id ? 'Submitting…' : 'Submit Removal Request'}
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => toggleRemove(s.id)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {isToday && !loading && students.length > 0 && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 8,
            fontSize: '.78rem', color: 'var(--muted)', textAlign: 'center' }}>
            {present + late + absent} of {students.length} marked · Unmarked students auto-marked absent at 10pm
          </div>
        )}
      </div>

      {history && (
        <div className="card">
          <div className="card-title">
            Attendance History {myGroups.length > 1 ? `— ${groupName}` : ''}
            <button className="btn btn-outline btn-sm" onClick={() => setHistory(false)}>Close</button>
          </div>
          {historyData.length === 0 ? (
            <div className="empty-state"><div className="icon">📋</div>No past registers found</div>
          ) : historyData.map(session => {
            const recs = session.records || []
            const p = recs.filter(r => r.status === 'present').length
            const l = recs.filter(r => r.status === 'late').length
            const a = recs.filter(r => r.status === 'absent').length
            return (
              <div key={session.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                borderBottom: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '.9rem' }}>
                  {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })} {fmtDate(session.session_date)}
                </span>
                <div style={{ display: 'flex', gap: 8, fontSize: '.8rem' }}>
                  <span style={{ color: '#16a34a', fontWeight: 700 }}>{p}P</span>
                  <span style={{ color: '#d97706', fontWeight: 700 }}>{l}L</span>
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>{a}A</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
