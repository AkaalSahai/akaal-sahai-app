import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'

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
    const [{ data: sa }, { data: ta }, { data: gr }, { data: tr }] = await Promise.all([
      supabase.from('parent_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('teacher_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('groups').select('id, name').order('name'),
      supabase.from('transfer_requests').select('*').order('created_at', { ascending: false }),
    ])
    setStudentApps(sa || [])
    setTeacherApps(ta || [])
    setGroups(gr || [])
    setTransfers(tr || [])
    setLoading(false)
  }

  async function approveStudent(app) {
    if (readOnly) return
    setBusy(app.id)
    try {
      const { error } = await supabase.from('students').insert({
        first_name: app.first_name, middle_name: app.middle_name, last_name: app.last_name,
        date_of_birth: app.date_of_birth, medical_notes: app.medical_notes,
        house_no: app.house_no, street_name: app.street_name, town: app.town, postcode: app.postcode,
        parent_name: app.parent_name, relationship: app.relationship,
        phone: app.phone, secondary_phone: app.secondary_phone, email: app.email,
        photo_consent: app.photo_consent, date_joined: new Date().toISOString().split('T')[0], active: true,
      })
      if (error) throw error
      await supabase.from('parent_applications').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', app.id)
      logAction(profile, 'Approved student application', [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')).catch(() => {})
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
          {studentApps.map(app => (
            <ApplicationCard key={app.id} status={app.status}>
              <div className="app-header">
                <div>
                  <div className="app-name">{[app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')}</div>
                  <div className="app-meta">DOB: {app.date_of_birth} · Applied: {new Date(app.created_at).toLocaleDateString('en-GB')}</div>
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
                <div className="app-actions">
                  {app.status === 'pending' && <>
                    <button className="btn btn-success btn-sm" disabled={busy === app.id} onClick={() => approveStudent(app)}>
                      {busy === app.id ? '…' : 'Approve & Add Student'}
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={busy === app.id} onClick={() => rejectStudent(app)}>Reject</button>
                  </>}
                  <button className="btn btn-outline btn-sm" disabled={busy === app.id}
                    onClick={() => clearApp('parent_applications', app.id)}
                    style={{ marginLeft: 'auto', color: '#94a3b8', borderColor: '#cbd5e1' }}>
                    {busy === app.id ? '…' : 'Clear'}
                  </button>
                </div>
              )}
            </ApplicationCard>
          ))}
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
                  <div className="app-meta">Applied: {new Date(app.created_at).toLocaleDateString('en-GB')}</div>
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
                    From: {tr.from_group_name || '—'} · Requested: {new Date(tr.created_at).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <span className={`tag tag-${tr.status}`}>{tr.status}</span>
              </div>
              <div className="app-details">
                <Detail label="Reason for Transfer" value={tr.reason} />
                {tr.to_group_id && <Detail label="Moved To" value={groups.find(g => g.id === tr.to_group_id)?.name || '—'} />}
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

function TeacherApproveForm({ app, groups, onApprove, onReject, busy }) {
  const [groupId, setGroupId] = useState('')
  return (
    <div className="app-actions">
      <select value={groupId} onChange={e => setGroupId(e.target.value)}
        style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.84rem' }}>
        <option value="">Assign group (optional)</option>
        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
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
        {groups.filter(g => g.id !== tr.from_group_id).map(g => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      <button className="btn btn-success btn-sm" disabled={busy === tr.id} onClick={() => onApprove(tr, toGroupId)}>
        {busy === tr.id ? '…' : 'Approve & Move'}
      </button>
      <button className="btn btn-danger btn-sm" disabled={busy === tr.id} onClick={() => onReject(tr)}>Reject</button>
    </div>
  )
}
