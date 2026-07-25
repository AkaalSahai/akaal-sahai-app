import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'
import { fmtDate } from '../../lib/dates'
import { notifyTeachersOfGroup } from '../../lib/notifications'

function calcAgeRange(students) {
  if (!students?.length) return null
  const now = new Date()
  const ages = students.map(s => {
    if (!s.date_of_birth) return null
    const d = new Date(s.date_of_birth)
    let a = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
    return a
  }).filter(a => a !== null)
  if (!ages.length) return null
  const min = Math.min(...ages), max = Math.max(...ages)
  return min === max ? `${min}y` : `${min}–${max}y`
}

export default function AdminApplications({ readOnly }) {
  const { profile } = useAuth()
  const [tab, setTab]               = useState('students')
  const [studentApps, setStudentApps] = useState([])
  const [teacherApps, setTeacherApps] = useState([])
  const [transfers, setTransfers]   = useState([])
  const [groups, setGroups]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [busy, setBusy]             = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const [{ data: sa }, { data: ta }, { data: gr }, { data: tr }, { data: us }] = await Promise.all([
        supabase.from('parent_applications').select('*').order('created_at', { ascending: false }),
        supabase.from('teacher_applications').select('*').order('created_at', { ascending: false }),
        supabase.from('groups').select('id, name, teacher_id, students(date_of_birth)').order('name'),
        supabase.from('transfer_requests').select('*, students(date_of_birth, medical_notes)').order('created_at', { ascending: false }),
        supabase.from('users').select('id, name').eq('role', 'teacher'),
      ])
      const teacherMap = Object.fromEntries((us || []).map(u => [u.id, u.name]))
      setStudentApps(sa || [])
      setTeacherApps(ta || [])
      setGroups((gr || []).map(g => ({ ...g, teacherName: teacherMap[g.teacher_id] || null })))
      setTransfers(tr || [])
    } catch (err) {
      console.error('Applications load error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function approveStudent(app, groupId) {
    if (readOnly) return
    setBusy(app.id)
    try {
      const { error } = await supabase.from('students').insert({
        first_name: app.first_name, middle_name: app.middle_name, last_name: app.last_name,
        date_of_birth: app.date_of_birth, medical_notes: app.medical_notes,
        house_no: app.house_no, street_name: app.street_name, town: app.town, postcode: app.postcode,
        parent_name: app.parent_name, relationship: app.relationship,
        phone: app.phone, secondary_phone: app.secondary_phone, email: app.email,
        photo_consent: app.photo_consent, date_joined: new Date().toISOString().split('T')[0],
        active: true, group_id: groupId || null,
      })
      if (error) throw error
      await supabase.from('parent_applications').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', app.id)
      const studentName = [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')
      const grp = groups.find(g => g.id === groupId)
      logAction(profile, 'Approved student application', grp ? `${studentName} → ${grp.name}` : studentName).catch(() => {})
      if (groupId) notifyTeachersOfGroup(groupId, `New student added to your group: ${studentName}`).catch(() => {})
      alert(grp
        ? `✓ ${studentName} has been approved and added to ${grp.name}.`
        : `✓ ${studentName} has been approved. No group assigned — remember to assign them later.`
      )
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function rejectStudent(app) {
    if (readOnly) return
    setBusy(app.id)
    await supabase.from('parent_applications').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', app.id)
    logAction(profile, 'Rejected student application', [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')).catch(() => {})
    setBusy(null); load()
  }

  async function approveTeacher(app, groupId) {
    if (readOnly) return
    setBusy(app.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-teacher`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ email: app.email, name: app.full_name, group_id: groupId || null, application_id: app.id, auth_user_id: app.auth_user_id || null }),
        }
      )
      const result = await res.json()
      if (result.error) throw new Error(result.error)
      const grpMsg = result.groupName ? '\nGroup: ' + result.groupName : '\nNo group assigned yet.'
      alert('Teacher approved!\n\nAn email has been sent to ' + app.email + grpMsg + '\n\nThey can now log in using the password they set during registration.')
      logAction(profile, 'Approved teacher application', result.groupName ? `${app.full_name} → ${result.groupName}` : app.full_name).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function rejectTeacher(app) {
    if (readOnly) return
    setBusy(app.id)
    await supabase.from('teacher_applications').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', app.id)
    logAction(profile, 'Rejected teacher application', app.full_name).catch(() => {})
    setBusy(null); load()
  }

  async function approveTransfer(tr, toGroupId) {
    if (readOnly) return
    if (!toGroupId) { alert('Please select a destination group'); return }
    setBusy(tr.id)
    try {
      await supabase.from('students').update({ group_id: toGroupId }).eq('id', tr.student_id)
      const grp = groups.find(g => g.id === toGroupId)
      await supabase.from('transfer_requests').update({
        status: 'approved', to_group_id: toGroupId, reviewed_at: new Date().toISOString(),
      }).eq('id', tr.id)
      alert(`${tr.student_name} has been moved to ${grp?.name || 'the selected group'}.`)
      logAction(profile, 'Approved transfer request', `${tr.student_name} → ${grp?.name || 'new group'}`).catch(() => {})
      notifyTeachersOfGroup(toGroupId, `New student transferred to your group: ${tr.student_name}`).catch(() => {})
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function clearApp(table, id) {
    if (!confirm('Permanently delete this application? This cannot be undone.')) return
    setBusy(id)
    try {
      // For teacher applications, also remove the orphaned auth account so they can re-register
      if (table === 'teacher_applications') {
        const app = teacherApps.find(a => a.id === id)
        if (app?.auth_user_id) {
          const { data: { session } } = await supabase.auth.getSession()
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-user-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ action: 'delete', userId: app.auth_user_id }),
          })
        }
      }
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
      const clearAction = table === 'parent_applications' ? 'Cleared student application'
        : table === 'teacher_applications' ? 'Cleared teacher application'
        : 'Cleared transfer request'
      const clearDetail = table === 'parent_applications'
        ? [studentApps.find(a => a.id === id)].filter(Boolean).map(a => [a.first_name, a.last_name].filter(Boolean).join(' '))[0]
        : table === 'teacher_applications'
        ? teacherApps.find(a => a.id === id)?.full_name
        : transfers.find(a => a.id === id)?.student_name
      logAction(profile, clearAction, clearDetail || null).catch(() => {})
      load()
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setBusy(null)
    }
  }

  async function rejectTransfer(tr) {
    if (readOnly) return
    setBusy(tr.id)
    await supabase.from('transfer_requests').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', tr.id)
    setBusy(null); load()
  }

  function calcAge(dob) {
    if (!dob) return null
    const d = new Date(dob), now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
    return a
  }

  const pending = {
    students:  studentApps.filter(a => a.status === 'pending').length,
    teachers:  teacherApps.filter(a => a.status === 'pending').length,
    transfers: transfers.filter(a => a.status === 'pending').length,
  }

  if (loading) return <div className="spinner" />

  return (
    <>
      <div className="screen-toggle">
        <button className={`toggle-btn ${tab === 'students' ? 'active' : ''}`} onClick={() => setTab('students')}>
          Student Applications {pending.students > 0 && <span className="badge">{pending.students}</span>}
        </button>
        <button className={`toggle-btn ${tab === 'teachers' ? 'active' : ''}`} onClick={() => setTab('teachers')}>
          Teacher Applications {pending.teachers > 0 && <span className="badge">{pending.teachers}</span>}
        </button>
        <button className={`toggle-btn ${tab === 'transfers' ? 'active' : ''}`} onClick={() => setTab('transfers')}>
          Transfer Requests {pending.transfers > 0 && <span className="badge">{pending.transfers}</span>}
        </button>
      </div>

      {tab === 'students' && (
        <>
          {studentApps.length === 0 && <div className="empty-state"><div className="icon">📝</div>No student applications</div>}
          {studentApps.map(app => {
            const age = calcAge(app.date_of_birth)
            return (
            <ApplicationCard key={app.id} status={app.status}>
              <div className="app-header">
                <div>
                  <div className="app-name">{[app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')}</div>
                  <div className="app-meta">
                    {age !== null && <span>Age: {age}y · </span>}
                    DOB: {fmtDate(app.date_of_birth)} · Applied: {fmtDate(app.created_at)}
                  </div>
                </div>
                <span className={`tag tag-${app.status}`}>{app.status}</span>
              </div>
              <div className="app-details">
                <Detail label="Parent/Guardian" value={app.parent_name} />
                <Detail label="Relationship" value={app.relationship} />
                <Detail label="Phone" value={app.phone} />
                <Detail label="Secondary Phone" value={app.secondary_phone || '—'} />
                <Detail label="Email" value={app.email || '—'} />
                <Detail label="Address" value={[app.house_no, app.street_name, app.town, app.postcode].filter(Boolean).join(', ')} />
                {app.medical_notes && <Detail label="Medical Notes" value={app.medical_notes} />}
                <Detail label="Photo Consent" value={app.photo_consent ? 'Yes' : 'No'} />
              </div>
              {!readOnly && (
                <div>
                  {app.status === 'pending' && (
                    <StudentApproveForm app={app} groups={groups} onApprove={approveStudent} onReject={rejectStudent} busy={busy} />
                  )}
                  <div style={{ marginTop: app.status === 'pending' ? 8 : 0 }}>
                    <button className="btn btn-outline btn-sm" disabled={busy === app.id}
                      onClick={() => clearApp('parent_applications', app.id)}
                      style={{ color: '#94a3b8', borderColor: '#cbd5e1' }}>
                      {busy === app.id ? '…' : 'Clear'}
                    </button>
                  </div>
                </div>
              )}
            </ApplicationCard>
          )})}

        </>
      )}

      {tab === 'teachers' && (
        <>
          {teacherApps.length === 0 && <div className="empty-state"><div className="icon">👩‍🏫</div>No teacher applications</div>}
          {teacherApps.map(app => (
            <ApplicationCard key={app.id} status={app.status}>
              <div className="app-header">
                <div>
                  <div className="app-name">{app.full_name}</div>
                  <div className="app-meta">Applied: {fmtDate(app.created_at)}</div>
                </div>
                <span className={`tag tag-${app.status}`}>{app.status}</span>
              </div>
              <div className="app-details">
                <Detail label="Email" value={app.email} />
                <Detail label="Phone" value={app.phone} />
                <Detail label="Preferred Group" value={app.preferred_group || '—'} />
                <Detail label="DBS Number" value={app.dbs_number || '—'} />
                <Detail label="Experience" value={app.experience || '—'} />
              </div>
              {!readOnly && (
                <div>
                  {app.status === 'pending' && (
                    <TeacherApproveForm app={app} groups={groups} onApprove={approveTeacher} onReject={rejectTeacher} busy={busy} />
                  )}
                  <div style={{ marginTop: app.status === 'pending' ? 8 : 0 }}>
                    <button className="btn btn-outline btn-sm" disabled={busy === app.id}
                      onClick={() => clearApp('teacher_applications', app.id)}
                      style={{ color: '#94a3b8', borderColor: '#cbd5e1' }}>
                      {busy === app.id ? '…' : 'Clear Application'}
                    </button>
                  </div>
                </div>
              )}
            </ApplicationCard>
          ))}
        </>
      )}

      {tab === 'transfers' && (
        <>
          {transfers.length === 0 && <div className="empty-state"><div className="icon">↔️</div>No transfer requests</div>}
          {transfers.map(tr => (
            <ApplicationCard key={tr.id} status={tr.status}>
              <div className="app-header">
                <div>
                  <div className="app-name">{tr.student_name}</div>
                  <div className="app-meta">
                    {calcAge(tr.students?.date_of_birth) !== null && <span>Age: {calcAge(tr.students?.date_of_birth)}y · </span>}
                    From: {tr.from_group_name || '—'} · Requested: {fmtDate(tr.created_at)}
                  </div>
                </div>
                <span className={`tag tag-${tr.status}`}>{tr.status}</span>
              </div>
              <div className="app-details">
                <Detail label="Reason for Transfer" value={tr.reason} />
                {tr.to_group_id && <Detail label="Moved To" value={groups.find(g => g.id === tr.to_group_id)?.name || '—'} />}
                {tr.students?.medical_notes && (
                  <Detail label="Medical Notes" value={tr.students.medical_notes} />
                )}
              </div>
              {!readOnly && (
                <div>
                  {tr.status === 'pending' && (
                    <TransferApproveForm tr={tr} groups={groups} onApprove={approveTransfer} onReject={rejectTransfer} busy={busy} />
                  )}
                  <div style={{ marginTop: tr.status === 'pending' ? 8 : 0 }}>
                    <button className="btn btn-outline btn-sm" disabled={busy === tr.id}
                      onClick={() => clearApp('transfer_requests', tr.id)}
                      style={{ color: '#94a3b8', borderColor: '#cbd5e1' }}>
                      {busy === tr.id ? '…' : 'Clear'}
                    </button>
                  </div>
                </div>
              )}
            </ApplicationCard>
          ))}
        </>
      )}
    </>
  )
}

function ApplicationCard({ status, children }) {
  return <div className={`application-card ${status}`}>{children}</div>
}

function Detail({ label, value }) {
  return (
    <div className="app-detail-item">
      <div className="app-detail-label">{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function GroupPanel({ groups, selectedId, onSelect, onClose }) {
  const panelRef = useRef(null)

  useEffect(() => {
    function handle(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500 }}>
      <div ref={panelRef} style={{ position: 'fixed', top: 16, right: 16, background: 'white', borderRadius: 14,
        boxShadow: '0 12px 40px rgba(30,26,110,.18), 0 2px 8px rgba(0,0,0,.08)',
        width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border)', zIndex: 501 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: '.95rem', color: 'var(--primary)' }}>All Groups</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--muted)', fontSize: '1.2rem', lineHeight: 1, padding: '2px 6px', borderRadius: 6 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)',
                  fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>Group</th>
                <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)',
                  fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>Teacher</th>
                <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--muted)',
                  fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>Students</th>
                <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--muted)',
                  fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--border)' }}>Age Range</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => {
                const range = calcAgeRange(g.students)
                const count = g.students?.length ?? 0
                const isSelected = g.id === selectedId
                return (
                  <tr key={g.id} onClick={() => { onSelect(g.id); onClose() }}
                    style={{ cursor: 'pointer', background: isSelected ? '#eff6ff' : 'white',
                      borderBottom: '1px solid #f1f5f9', transition: 'background .1s' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#f8fafc' }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'white' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isSelected
                        ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, display: 'inline-block' }} />
                        : <span style={{ width: 8, height: 8, flexShrink: 0, display: 'inline-block' }} />}
                      {g.name}
                    </td>
                    <td style={{ padding: '10px 12px', color: g.teacherName ? 'var(--text)' : 'var(--muted)' }}>
                      {g.teacherName || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700,
                      color: count >= 30 ? '#dc2626' : count >= 25 ? '#d97706' : 'var(--text)' }}>
                      {count}
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--muted)' }}>
                      {range || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', fontSize: '.72rem', color: 'var(--muted)' }}>
          Click a row to select that group
        </div>
      </div>
    </div>
  )
}

function StudentApproveForm({ app, groups, onApprove, onReject, busy }) {
  const [groupId, setGroupId] = useState('')
  const [showPanel, setShowPanel] = useState(false)
  const closePanel = () => setShowPanel(false)

  return (
    <div className="app-actions" style={{ flexWrap: 'wrap', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0, alignItems: 'center' }}>
        <select value={groupId} onChange={e => setGroupId(e.target.value)}
          style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.84rem', minWidth: 0 }}>
          <option value="">Assign to group (optional)</option>
          {groups.map(g => {
            const range = calcAgeRange(g.students)
            return <option key={g.id} value={g.id}>{g.name}{g.teacherName ? ` — ${g.teacherName}` : ''}{range ? ` (${range})` : ''}</option>
          })}
        </select>
        <button onClick={() => setShowPanel(true)} title="View all groups"
          style={{ flexShrink: 0, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'white', cursor: 'pointer', fontSize: '.82rem', color: 'var(--primary)', fontWeight: 600,
            whiteSpace: 'nowrap' }}>
          Groups ▦
        </button>
      </div>
      <button className="btn btn-success btn-sm" disabled={busy === app.id} onClick={() => onApprove(app, groupId || null)}>
        {busy === app.id ? '…' : 'Approve & Add'}
      </button>
      <button className="btn btn-danger btn-sm" disabled={busy === app.id} onClick={() => onReject(app)}>Reject</button>
      {showPanel && <GroupPanel groups={groups} selectedId={groupId} onSelect={setGroupId} onClose={closePanel} />}
    </div>
  )
}

function TeacherApproveForm({ app, groups, onApprove, onReject, busy }) {
  const [groupId, setGroupId] = useState('')
  return (
    <div className="app-actions">
      <select value={groupId} onChange={e => setGroupId(e.target.value)}
        style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.84rem' }}>
        <option value="">Assign group (optional)</option>
        {groups.map(g => {
          const range = calcAgeRange(g.students)
          return <option key={g.id} value={g.id}>{g.name}{g.teacherName ? ` — ${g.teacherName}` : ''}{range ? ` (${range})` : ''}</option>
        })}
      </select>
      <button className="btn btn-success btn-sm" disabled={busy === app.id} onClick={() => onApprove(app, groupId || null)}>
        {busy === app.id ? '…' : 'Approve'}
      </button>
      <button className="btn btn-danger btn-sm" disabled={busy === app.id} onClick={() => onReject(app)}>Reject</button>
    </div>
  )
}

function TransferApproveForm({ tr, groups, onApprove, onReject, busy }) {
  const [toGroupId, setToGroupId] = useState('')
  return (
    <div className="app-actions">
      <select value={toGroupId} onChange={e => setToGroupId(e.target.value)}
        style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.84rem' }}>
        <option value="">Select destination group…</option>
        {groups.filter(g => g.id !== tr.from_group_id).map(g => {
          const range = calcAgeRange(g.students)
          return <option key={g.id} value={g.id}>{g.name}{g.teacherName ? ` — ${g.teacherName}` : ''}{range ? ` (${range})` : ''}</option>
        })}
      </select>
      <button className="btn btn-success btn-sm" disabled={busy === tr.id} onClick={() => onApprove(tr, toGroupId)}>
        {busy === tr.id ? '…' : 'Approve & Move'}
      </button>
      <button className="btn btn-danger btn-sm" disabled={busy === tr.id} onClick={() => onReject(tr)}>Reject</button>
    </div>
  )
}
