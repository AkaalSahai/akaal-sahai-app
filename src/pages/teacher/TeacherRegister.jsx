import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import MedicalBadge from '../../components/MedicalBadge'

const AVATARS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6']
const color = (i) => AVATARS[i % AVATARS.length]

function todayISO() { return new Date().toISOString().split('T')[0] }

export default function TeacherRegister() {
  const { profile }              = useAuth()
  const [students, setStudents]  = useState([])
  const [groupName, setGroupName] = useState(null)
  const [attendance, setAttendance] = useState({})
  const [date, setDate]          = useState(todayISO())
  const [loading, setLoading]    = useState(true)
  const [sessionId, setSessionId] = useState(null)
  const [saveState, setSaveState] = useState('idle')
  const [history, setHistory]    = useState(false)
  const [historyData, setHistoryData] = useState([])
  const [transferOpen, setTransferOpen] = useState({})
  const [transferBusy, setTransferBusy] = useState(null)
  const savingRef    = useRef(null)
  const creatingRef  = useRef(false)   // prevents duplicate session creation on rapid taps

  const isReadOnly = date < todayISO()
  const isToday    = date === todayISO()

  useEffect(() => { if (profile?.group_id) loadStudents() }, [profile])
  useEffect(() => { if (profile?.group_id) loadSession() }, [date, profile])

  async function loadStudents() {
    const [{ data: studentData }, { data: groupData }] = await Promise.all([
      supabase.from('students')
        .select('id, first_name, middle_name, last_name, medical_notes')
        .eq('group_id', profile.group_id)
        .eq('active', true)
        .order('last_name'),
      supabase.from('groups').select('name').eq('id', profile.group_id).single(),
    ])
    setStudents(studentData || [])
    setGroupName(groupData?.name || null)
    setLoading(false)
  }

  async function loadSession() {
    if (!profile?.group_id) return
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id, records:attendance_records(student_id, status)')
      .eq('group_id', profile.group_id)
      .eq('session_date', date)
      .maybeSingle()
    if (data) {
      setSessionId(data.id)
      const map = {}
      ;(data.records || []).forEach(r => { map[r.student_id] = r.status })
      setAttendance(map)
    } else {
      setSessionId(null)
      setAttendance({})
    }
    setSaveState('idle')
  }

  async function ensureSession() {
    if (sessionId) return sessionId
    if (creatingRef.current) return null   // already creating — caller should retry or skip
    creatingRef.current = true
    try {
      const { data, error } = await supabase
        .from('attendance_sessions')
        .insert({ group_id: profile.group_id, session_date: date, teacher_id: profile.id })
        .select('id')
        .single()
      if (error) throw error
      setSessionId(data.id)
      return data.id
    } finally {
      creatingRef.current = false
    }
  }

  async function mark(studentId, status) {
    if (isReadOnly) return
    setAttendance(prev => ({ ...prev, [studentId]: status }))
    setSaveState('saving')
    clearTimeout(savingRef.current)
    try {
      const sid = await ensureSession()
      if (!sid) return   // session creation in progress; the state update is already optimistic
      const { error } = await supabase.from('attendance_records').upsert({
        session_id: sid,
        student_id: studentId,
        group_id: profile.group_id,
        session_date: date,
        status,
      }, { onConflict: 'session_id,student_id' })
      if (error) throw error
      setSaveState('saved')
      savingRef.current = setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      setSaveState('error')
      alert('Could not save: ' + err.message)
    }
  }

  function toggleTransfer(studentId) {
    setTransferOpen(prev => {
      const next = { ...prev }
      if (next[studentId] !== undefined) { delete next[studentId] }
      else { next[studentId] = '' }
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
        student_id: student.id,
        student_name: fullName,
        from_group_id: profile.group_id,
        from_group_name: groupName || null,
        requested_by: profile.id,
        reason,
        status: 'pending',
      })
      if (error) throw error
      alert(`Transfer request submitted for ${fullName}.\n\nThe admin or registrar will review and move the student.`)
      setTransferOpen(prev => { const n = { ...prev }; delete n[student.id]; return n })
    } catch (err) { alert('Error: ' + err.message) }
    finally { setTransferBusy(null) }
  }

  async function loadHistory() {
    setHistory(true)
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id, session_date, records:attendance_records(student_id, status)')
      .eq('group_id', profile.group_id)
      .order('session_date', { ascending: false })
      .limit(20)
    setHistoryData(data || [])
  }

  if (!profile?.group_id) return (
    <div className="card">
      <div className="alert alert-warning">You have not been assigned to a group yet. Please contact the admin.</div>
    </div>
  )

  if (loading) return <div className="spinner" />

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

        {isReadOnly && (
          <div className="alert" style={{ background: '#f1f5f9', color: '#475569', borderColor: '#cbd5e1' }}>
            Past register — read only. Showing record for {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
          </div>
        )}

        {isToday && sessionId && (
          <div className="alert alert-success">
            Register in progress for {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} — changes save automatically.
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

        <ul className="student-list">
          {students.map((s, i) => {
            const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
            const status = attendance[s.id]
            return (
              <li key={s.id} className="student-row">
                <div className="student-row-main">
                  <div className="student-avatar" style={{ background: color(i) }}>
                    {s.first_name?.[0] ?? '?'}{s.last_name?.[0] ?? '?'}
                  </div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div className="student-name">{fullName}</div>
                    <MedicalBadge notes={s.medical_notes} studentName={fullName} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {['present','late','absent'].map(st => (
                      <button key={st}
                        className={`att-btn att-${st}${status === st ? ' active' : ''}`}
                        onClick={() => mark(s.id, st)}
                        disabled={isReadOnly}>
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </button>
                    ))}
                    <button
                      onClick={() => toggleTransfer(s.id)}
                      title="Request group transfer"
                      style={{ padding: '5px 10px', fontSize: '.75rem', borderRadius: 20, border: '1px solid #94a3b8',
                        background: transferOpen[s.id] !== undefined ? '#e0e7ff' : 'white',
                        color: '#475569', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      ↔ Transfer
                    </button>
                  </div>
                </div>

                {transferOpen[s.id] !== undefined && (
                  <div style={{ marginTop: 10, padding: '12px', background: '#f8fafc', borderRadius: 8,
                    border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                      Transfer request for {[s.first_name, s.last_name].join(' ')}
                    </div>
                    <textarea
                      value={transferOpen[s.id]}
                      onChange={e => setTransferOpen(prev => ({ ...prev, [s.id]: e.target.value }))}
                      placeholder="Explain why this student needs to be moved to a different group…"
                      rows={2}
                      style={{ width: '100%', fontSize: '.83rem', resize: 'vertical', marginBottom: 8, boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary btn-sm" disabled={transferBusy === s.id}
                        onClick={() => submitTransfer(s)}>
                        {transferBusy === s.id ? 'Submitting…' : 'Submit Request'}
                      </button>
                      <button className="btn btn-outline btn-sm" onClick={() => toggleTransfer(s.id)}>Cancel</button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {isToday && students.length > 0 && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, fontSize: '.78rem', color: 'var(--muted)', textAlign: 'center' }}>
            {present + late + absent} of {students.length} marked · Any unmarked students will be auto-marked absent at end of day
          </div>
        )}
      </div>

      {history && (
        <div className="card">
          <div className="card-title">
            Attendance History
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
              <div key={session.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '.9rem' }}>
                  {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
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
