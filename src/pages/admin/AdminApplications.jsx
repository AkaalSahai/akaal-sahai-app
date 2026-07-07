import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminApplications() {
  const [tab, setTab]               = useState('students')
  const [studentApps, setStudentApps] = useState([])
  const [teacherApps, setTeacherApps] = useState([])
  const [groups, setGroups]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [busy, setBusy]             = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: sa }, { data: ta }, { data: gr }] = await Promise.all([
      supabase.from('parent_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('teacher_applications').select('*').order('created_at', { ascending: false }),
      supabase.from('groups').select('id, name').order('name'),
    ])
    setStudentApps(sa || [])
    setTeacherApps(ta || [])
    setGroups(gr || [])
    setLoading(false)
  }

  async function approveStudent(app) {
    setBusy(app.id)
    try {
      // Create student record
      const { error } = await supabase.from('students').insert({
        first_name: app.first_name,
        middle_name: app.middle_name,
        last_name: app.last_name,
        date_of_birth: app.date_of_birth,
        medical_notes: app.medical_notes,
        house_no: app.house_no,
        street_name: app.street_name,
        town: app.town,
        postcode: app.postcode,
        parent_name: app.parent_name,
        relationship: app.relationship,
        phone: app.phone,
        secondary_phone: app.secondary_phone,
        email: app.email,
        photo_consent: app.photo_consent,
        date_joined: new Date().toISOString().split('T')[0],
        active: true,
      })
      if (error) throw error
      await supabase.from('parent_applications').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', app.id)
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function rejectStudent(app) {
    setBusy(app.id)
    await supabase.from('parent_applications').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', app.id)
    setBusy(null); load()
  }

  async function approveTeacher(app, groupId) {
    setBusy(app.id)
    try {
      // Create Supabase auth user then users row
      // Note: admin creates user via supabase admin API — for now, insert placeholder
      const tempPw = Math.random().toString(36).slice(-8) + 'A1!'
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email: app.email,
        password: tempPw,
        email_confirm: true,
      })
      if (authErr) throw authErr
      const { error: dbErr } = await supabase.from('users').insert({
        id: authData.user.id,
        name: app.full_name,
        email: app.email,
        role: 'teacher',
        group_id: groupId || null,
        phone: app.phone,
      })
      if (dbErr) throw dbErr
      await supabase.from('teacher_applications').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', app.id)
      alert('Teacher approved!\n\nEmail: ' + app.email + '\nTemp password: ' + tempPw + '\n\nAsk them to log in and change their password immediately.')
      load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(null) }
  }

  async function rejectTeacher(app) {
    setBusy(app.id)
    await supabase.from('teacher_applications').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', app.id)
    setBusy(null); load()
  }

  const pending = { students: studentApps.filter(a => a.status === 'pending'), teachers: teacherApps.filter(a => a.status === 'pending') }

  if (loading) return <div className="spinner" />

  return (
    <>
      <div className="screen-toggle">
        <button className={`toggle-btn ${tab === 'students' ? 'active' : ''}`} onClick={() => setTab('students')}>
          Student Applications {pending.students.length > 0 && <span className="badge">{pending.students.length}</span>}
        </button>
        <button className={`toggle-btn ${tab === 'teachers' ? 'active' : ''}`} onClick={() => setTab('teachers')}>
          Teacher Applications {pending.teachers.length > 0 && <span className="badge">{pending.teachers.length}</span>}
        </button>
      </div>

      {tab === 'students' && (
        <>
          {studentApps.length === 0 && <div className="empty-state"><div className="icon">📝</div>No student applications</div>}
          {studentApps.map(app => (
            <ApplicationCard key={app.id} app={app} status={app.status}>
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
              {app.status === 'pending' && (
                <div className="app-actions">
                  <button className="btn btn-success btn-sm" disabled={busy === app.id} onClick={() => approveStudent(app)}>
                    {busy === app.id ? '…' : 'Approve & Add Student'}
                  </button>
                  <button className="btn btn-danger btn-sm" disabled={busy === app.id} onClick={() => rejectStudent(app)}>
                    Reject
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
            <ApplicationCard key={app.id} app={app} status={app.status}>
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
                <Detail label="Experience" value={app.experience || '—'} />
              </div>
              {app.status === 'pending' && (
                <TeacherApproveForm app={app} groups={groups} onApprove={approveTeacher} onReject={rejectTeacher} busy={busy} />
              )}
            </ApplicationCard>
          ))}
        </>
      )}
    </>
  )
}

function ApplicationCard({ app, status, children }) {
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
      <button className="btn btn-danger btn-sm" disabled={busy === app.id} onClick={() => onReject(app)}>
        Reject
      </button>
    </div>
  )
}
