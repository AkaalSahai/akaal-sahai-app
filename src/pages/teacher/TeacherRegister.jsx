import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const AVATARS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6']
const color = (i) => AVATARS[i % AVATARS.length]

function todayISO() {
  const d = new Date()
  return d.toISOString().split('T')[0]
}

export default function TeacherRegister() {
  const { profile } = useAuth()
  const [students, setStudents]     = useState([])
  const [attendance, setAttendance] = useState({})  // { studentId: 'present'|'absent'|'late' }
  const [date, setDate]             = useState(todayISO())
  const [loading, setLoading]       = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [existingRecord, setExisting] = useState(null)
  const [history, setHistory]       = useState(false)
  const [historyData, setHistoryData] = useState([])

  useEffect(() => { if (profile?.group_id) loadStudents() }, [profile])
  useEffect(() => { if (profile?.group_id) checkSubmitted() }, [date, profile])

  async function loadStudents() {
    const { data } = await supabase
      .from('students')
      .select('id, first_name, middle_name, last_name, date_of_birth, medical_notes')
      .eq('group_id', profile.group_id)
      .eq('active', true)
      .order('last_name')
    setStudents(data || [])
    setLoading(false)
  }

  async function checkSubmitted() {
    if (!profile?.group_id) return
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id, submitted_at, records:attendance_records(*)')
      .eq('group_id', profile.group_id)
      .eq('session_date', date)
      .maybeSingle()
    if (data) {
      setExisting(data)
      setSubmitted(true)
      const map = {}
      ;(data.records || []).forEach(r => { map[r.student_id] = r.status })
      setAttendance(map)
    } else {
      setExisting(null)
      setSubmitted(false)
      setAttendance({})
    }
  }

  function mark(studentId, status) {
    if (submitted) return
    setAttendance(prev => ({ ...prev, [studentId]: status }))
  }

  async function submitRegister() {
    const unmarked = students.filter(s => !attendance[s.id])
    if (unmarked.length > 0) {
      alert(`Please mark all students before submitting.\n\nUnmarked: ${unmarked.map(s => s.first_name + ' ' + s.last_name).join(', ')}`)
      return
    }
    setSubmitting(true)
    try {
      // Create session
      const { data: session, error: sErr } = await supabase
        .from('attendance_sessions')
        .insert({ group_id: profile.group_id, session_date: date, teacher_id: profile.id })
        .select()
        .single()
      if (sErr) throw sErr

      // Insert records
      const records = students.map(s => ({
        session_id: session.id,
        student_id: s.id,
        group_id: profile.group_id,
        session_date: date,
        status: attendance[s.id],
      }))
      const { error: rErr } = await supabase.from('attendance_records').insert(records)
      if (rErr) throw rErr
      setSubmitted(true)
      setExisting(session)
    } catch (err) {
      alert('Error submitting register: ' + err.message)
    } finally { setSubmitting(false) }
  }

  async function loadHistory() {
    setHistory(true)
    const { data } = await supabase
      .from('attendance_sessions')
      .select('id, session_date, submitted_at, records:attendance_records(student_id, status)')
      .eq('group_id', profile.group_id)
      .order('session_date', { ascending: false })
      .limit(20)
    setHistoryData(data || [])
  }

  if (!profile?.group_id) return (
    <div className="card">
      <div className="alert alert-warning">You have not been assigned to a group yet. Please contact the admin or registrar.</div>
    </div>
  )

  if (loading) return <div className="spinner" />

  const present = Object.values(attendance).filter(v => v === 'present').length
  const late    = Object.values(attendance).filter(v => v === 'late').length
  const absent  = Object.values(attendance).filter(v => v === 'absent').length

  return (
    <>
      <div className="card">
        <div className="card-title">
          <span>Daily Register</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: 'auto', padding: '7px 10px', fontSize: '.85rem' }} />
            <button className="btn btn-outline btn-sm" onClick={loadHistory}>History</button>
          </div>
        </div>

        {submitted && (
          <div className="alert alert-success">
            Register submitted for {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
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
                    {s.first_name[0]}{s.last_name[0]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="student-name">{fullName}</div>
                    {s.medical_notes && (
                      <div style={{ fontSize: '.72rem', color: 'var(--danger)', marginTop: 2 }}>
                        Medical: {s.medical_notes}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['present','late','absent'].map(st => (
                      <button key={st}
                        className={`att-btn att-${st}${status === st ? ' active' : ''}`}
                        onClick={() => mark(s.id, st)}
                        disabled={submitted}>
                        {st.charAt(0).toUpperCase() + st.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {!submitted && (
          <button className="btn btn-success btn-block" style={{ marginTop: 16 }}
            onClick={submitRegister} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit Register'}
          </button>
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
