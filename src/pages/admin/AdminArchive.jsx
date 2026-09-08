import { useEffect, useState, Fragment } from 'react'
import { supabase } from '../../lib/supabase'
import ConfirmDialog from '../../components/ConfirmDialog'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'
import { fmtDate } from '../../lib/dates'

function exportCSV(rows, cols, filename) {
  const header = cols.map(c => c.label)
  const body   = rows.map(r => cols.map(c => {
    const v = c.get(r) ?? ''
    return `"${String(v).replace(/"/g, '""')}"`
  }))
  const csv  = [header.join(','), ...body.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const STUDENT_COLS = [
  { label: 'First Name',       get: r => r.first_name },
  { label: 'Middle Name',      get: r => r.middle_name },
  { label: 'Last Name',        get: r => r.last_name },
  { label: 'Date of Birth',    get: r => fmtDate(r.date_of_birth) },
  { label: 'Parent/Guardian',  get: r => r.parent_name },
  { label: 'Relationship',     get: r => r.relationship },
  { label: 'Phone',            get: r => r.phone },
  { label: 'Secondary Phone',  get: r => r.secondary_phone },
  { label: 'Email',            get: r => r.email },
  { label: 'Address',          get: r => [r.house_no, r.street_name, r.town, r.postcode].filter(Boolean).join(', ') },
  { label: 'Medical Notes',    get: r => r.medical_notes },
  { label: 'Photo Consent',    get: r => r.photo_consent ? 'Yes' : 'No' },
  { label: 'Date Joined',      get: r => fmtDate(r.date_joined) },
  { label: 'Group',            get: r => r.groups?.name || '' },
  { label: 'Archived Date',    get: r => fmtDate(r.archived_at) },
  { label: 'Approved By',      get: r => r.archived_by_name || '' },
  { label: 'Requested By',     get: r => r.deletion_requested_by_name || 'Admin (direct removal)' },
  { label: 'Reason / Notes',   get: r => r.deletion_reason || '' },
]

const USER_COLS = [
  { label: 'Name',           get: r => r.name },
  { label: 'Email',          get: r => r.email },
  { label: 'Phone',          get: r => r.phone },
  { label: 'Role',           get: r => r.role },
  { label: 'Groups',         get: r => (r.group_names || []).join(', ') },
  { label: 'Last Login',     get: r => fmtDate(r.last_login) },
  { label: 'Deleted Date',   get: r => fmtDate(r.deleted_at) },
  { label: 'Deleted By',     get: r => r.deleted_by_name || '' },
  { label: 'Reason / Notes', get: r => r.deletion_reason || '' },
]

const ATT_STATUS_COLOR = { present: '#16a34a', absent: '#dc2626', late: '#d97706', holiday: '#0284c7' }
const ATT_STATUS_BG    = { present: '#f0fdf4', absent: '#fef2f2', late: '#fffbeb', holiday: '#f0f9ff' }

function DetailRow({ label, value }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: '.8rem', lineHeight: 1.5 }}>
      <span style={{ color: 'var(--muted)', minWidth: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}

function AttendanceSummary({ records }) {
  if (!records || !records.length) return (
    <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontStyle: 'italic', padding: '6px 0' }}>
      No attendance records found.
    </div>
  )
  const counts = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1
    return acc
  }, {})
  const total = records.length
  const nonHoliday = total - (counts.holiday || 0)
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        {Object.entries(counts).map(([status, n]) => {
          const denom = status === 'holiday' ? total : (nonHoliday || 1)
          return (
          <div key={status} style={{
            background: ATT_STATUS_BG[status] || '#f8fafc',
            border: `1px solid`,
            borderColor: ATT_STATUS_COLOR[status] || '#e2e8f0',
            borderRadius: 8, padding: '4px 12px',
            fontSize: '.75rem', fontWeight: 700, color: ATT_STATUS_COLOR[status] || '#64748b'
          }}>
            {status.charAt(0).toUpperCase() + status.slice(1)}: {n} ({Math.round(n / denom * 100)}%)
          </div>
          )
        })}
        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8,
          padding: '4px 12px', fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)' }}>
          Total sessions: {total}
        </div>
      </div>
      <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i}>
                <td style={{ fontSize: '.78rem' }}>{fmtDate(r.session_date)}</td>
                <td>
                  <span style={{
                    background: ATT_STATUS_BG[r.status] || '#f8fafc',
                    color: ATT_STATUS_COLOR[r.status] || '#64748b',
                    padding: '1px 8px', borderRadius: 20, fontSize: '.72rem', fontWeight: 700
                  }}>
                    {r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StudentDetailPanel({ s, onClose }) {
  const [attend, setAttend]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('attendance_records')
      .select('session_date, status')
      .eq('student_id', s.id)
      .order('session_date', { ascending: false })
      .then(({ data }) => { setAttend(data || []); setLoading(false) })
  }, [s.id])

  const address = [s.house_no, s.street_name, s.town, s.postcode].filter(Boolean).join(', ')

  return (
    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10,
      padding: 16, marginTop: 8, marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: '.88rem' }}>
          Full Record — {[s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: '.8rem', fontFamily: 'inherit' }}>Close ✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 4, marginBottom: 12 }}>
        <DetailRow label="First Name"       value={s.first_name} />
        <DetailRow label="Middle Name"      value={s.middle_name} />
        <DetailRow label="Last Name"        value={s.last_name} />
        <DetailRow label="Date of Birth"    value={fmtDate(s.date_of_birth)} />
        <DetailRow label="Parent/Guardian"  value={s.parent_name} />
        <DetailRow label="Relationship"     value={s.relationship} />
        <DetailRow label="Phone"            value={s.phone} />
        <DetailRow label="Secondary Phone"  value={s.secondary_phone} />
        <DetailRow label="Email"            value={s.email} />
        <DetailRow label="Address"          value={address} />
        <DetailRow label="Photo Consent"    value={s.photo_consent ? 'Yes' : 'No'} />
        <DetailRow label="Date Joined"      value={fmtDate(s.date_joined)} />
        <DetailRow label="Group"            value={s.groups?.name} />
        <DetailRow label="Medical Notes"    value={s.medical_notes} />
      </div>

      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
        padding: '10px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontWeight: 700, fontSize: '.75rem', color: '#9a3412', letterSpacing: '.03em',
          textTransform: 'uppercase', marginBottom: 2 }}>Deletion Record</div>
        <DetailRow label="Archived"         value={fmtDate(s.archived_at)} />
        <DetailRow label="Approved by"      value={s.archived_by_name} />
        <DetailRow label="Requested by"     value={s.deletion_requested_by_name || (s.archived_by_name ? 'Admin (direct removal)' : null)} />
        <DetailRow label="Reason / Notes"   value={s.deletion_reason} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '.82rem', marginBottom: 8 }}>Attendance History</div>
        {loading ? <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Loading…</div>
          : <AttendanceSummary records={attend} />}
      </div>
    </div>
  )
}

function TeacherDetailPanel({ u, onClose }) {
  const [attend, setAttend]   = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('teacher_attendance')
      .select('session_date, status, notes')
      .eq('teacher_id', u.original_id)
      .order('session_date', { ascending: false })
      .then(({ data }) => { setAttend(data || []); setLoading(false) })
  }, [u.original_id])

  return (
    <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10,
      padding: 16, marginTop: 8, marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: '.88rem' }}>Full Record — {u.name}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--muted)', fontSize: '.8rem', fontFamily: 'inherit' }}>Close ✕</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 4, marginBottom: 12 }}>
        <DetailRow label="Name"        value={u.name} />
        <DetailRow label="Email"       value={u.email} />
        <DetailRow label="Phone"       value={u.phone} />
        <DetailRow label="Role"        value={u.role} />
        <DetailRow label="Permissions" value={(u.extra_roles || []).join(', ')} />
        <DetailRow label="Group(s)"    value={(u.group_names || []).join(', ')} />
        <DetailRow label="Last Login"  value={fmtDate(u.last_login)} />
      </div>

      <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8,
        padding: '10px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ fontWeight: 700, fontSize: '.75rem', color: '#9a3412', letterSpacing: '.03em',
          textTransform: 'uppercase', marginBottom: 2 }}>Deletion Record</div>
        <DetailRow label="Deleted"        value={fmtDate(u.deleted_at)} />
        <DetailRow label="Deleted by"     value={u.deleted_by_name} />
        <DetailRow label="Reason / Notes" value={u.deletion_reason} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: '.82rem', marginBottom: 8 }}>Attendance History</div>
        {loading ? <div style={{ fontSize: '.78rem', color: 'var(--muted)' }}>Loading…</div> : (
          attend && attend.length ? (
            <div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                {['present','absent','late','holiday'].map(s => {
                  const n = attend.filter(r => r.status === s).length
                  if (!n) return null
                  return (
                    <div key={s} style={{
                      background: ATT_STATUS_BG[s], border: '1px solid',
                      borderColor: ATT_STATUS_COLOR[s], borderRadius: 8,
                      padding: '4px 12px', fontSize: '.75rem', fontWeight: 700, color: ATT_STATUS_COLOR[s]
                    }}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}: {n} ({Math.round(n / attend.length * 100)}%)
                    </div>
                  )
                })}
                <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '4px 12px', fontSize: '.75rem', fontWeight: 700, color: 'var(--muted)' }}>
                  Total sessions: {attend.length}
                </div>
              </div>
              <div className="table-wrap" style={{ maxHeight: 240, overflowY: 'auto' }}>
                <table>
                  <thead><tr><th>Date</th><th>Status</th><th>Notes</th></tr></thead>
                  <tbody>
                    {attend.map((r, i) => (
                      <tr key={i}>
                        <td style={{ fontSize: '.78rem' }}>{fmtDate(r.session_date)}</td>
                        <td>
                          <span style={{
                            background: ATT_STATUS_BG[r.status] || '#f8fafc',
                            color: ATT_STATUS_COLOR[r.status] || '#64748b',
                            padding: '1px 8px', borderRadius: 20, fontSize: '.72rem', fontWeight: 700
                          }}>
                            {r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : '—'}
                          </span>
                        </td>
                        <td style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{r.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', fontStyle: 'italic', padding: '6px 0' }}>
              No attendance records found.
            </div>
          )
        )}
      </div>
    </div>
  )
}

export default function AdminArchive() {
  const { profile } = useAuth()
  const [tab, setTab]           = useState('students')
  const [students, setStudents] = useState([])
  const [users, setUsers]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [search, setSearch]     = useState('')
  const [busy, setBusy]         = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [dialog, setDialog]     = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setLoadError(null)
    try {
      const [{ data: sa, error: sErr }, { data: ua, error: uErr }] = await Promise.all([
        supabase.from('students')
          .select('*, groups(name)')
          .eq('active', false)
          .order('archived_at', { ascending: false, nullsFirst: false }),
        supabase.from('users_archive')
          .select('*')
          .order('deleted_at', { ascending: false }),
      ])
      if (sErr) throw sErr
      if (uErr) throw uErr
      setStudents(sa || [])
      setUsers(ua || [])
    } catch (err) {
      setLoadError(err.message?.includes('archived_at') || err.message?.includes('users_archive')
        ? 'Run the add-archive-tracking.sql migration to enable this screen.'
        : 'Could not load archive: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  function toggleExpand(id) {
    setExpanded(prev => prev === id ? null : id)
  }

  function restoreStudent(s) {
    setDialog({
      message: `Restore ${s.first_name} ${s.last_name} to active students?`,
      confirmText: 'Restore',
      onConfirm: async () => {
        setDialog(null)
        setBusy(s.id)
        try {
          const { error } = await supabase.from('students').update({
            active: true, archived_at: null, archived_by_id: null, archived_by_name: null,
          }).eq('id', s.id)
          if (error) throw error
          logAction(profile, 'Restored student', `${s.first_name} ${s.last_name}`).catch(() => {})
          load()
        } catch (err) { alert('Error: ' + err.message) }
        finally { setBusy(null) }
      },
    })
  }

  function purgeStudent(s) {
    setDialog({
      message: `Permanently delete ALL data for ${s.first_name} ${s.last_name}? This includes attendance records and cannot be undone (GDPR erasure).`,
      confirmText: 'Permanently Erase',
      danger: true,
      onConfirm: async () => {
        setDialog(null)
        setBusy(s.id)
        try {
          const { error: attErr } = await supabase.from('attendance_records').delete().eq('student_id', s.id)
          if (attErr) throw attErr
          const { error } = await supabase.from('students').delete().eq('id', s.id)
          if (error) throw error
          logAction(profile, 'Permanently erased student', `${s.first_name} ${s.last_name}`).catch(() => {})
          setExpanded(null)
          load()
        } catch (err) { alert('Error: ' + err.message) }
        finally { setBusy(null) }
      },
    })
  }

  function purgeUser(u) {
    setDialog({
      message: `Permanently delete archive record and ALL attendance history for ${u.name}? This cannot be undone (GDPR erasure).`,
      confirmText: 'Permanently Erase',
      danger: true,
      onConfirm: async () => {
        setDialog(null)
        setBusy(u.id)
        try {
          await supabase.from('teacher_attendance').delete().eq('teacher_id', u.original_id)
          const { error } = await supabase.from('users_archive').delete().eq('id', u.id)
          if (error) throw error
          logAction(profile, 'Permanently erased teacher archive', u.name).catch(() => {})
          setExpanded(null)
          load()
        } catch (err) { alert('Error: ' + err.message) }
        finally { setBusy(null) }
      },
    })
  }

  const q = search.toLowerCase()
  const filteredStudents = students.filter(s =>
    [s.first_name, s.last_name, s.middle_name, s.parent_name, s.email, s.phone, s.groups?.name]
      .filter(Boolean).some(v => v.toLowerCase().includes(q))
  )
  const filteredUsers = users.filter(u =>
    [u.name, u.email, u.role, ...(u.group_names || [])]
      .filter(Boolean).some(v => v.toLowerCase().includes(q))
  )

  if (loading) return <div className="spinner" />

  if (loadError) return (
    <div className="card">
      <div className="alert alert-warning">⚠ {loadError}</div>
    </div>
  )

  return (
    <>
      {dialog && <ConfirmDialog {...dialog} onCancel={() => setDialog(null)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="screen-toggle" style={{ marginBottom: 0 }}>
          <button className={`toggle-btn ${tab === 'students' ? 'active' : ''}`} onClick={() => { setTab('students'); setExpanded(null) }}>
            Archived Students {students.length > 0 && <span className="badge">{students.length}</span>}
          </button>
          <button className={`toggle-btn ${tab === 'users' ? 'active' : ''}`} onClick={() => { setTab('users'); setExpanded(null) }}>
            Archived Teachers {users.length > 0 && <span className="badge">{users.length}</span>}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
              fontSize: '.84rem', fontFamily: 'inherit', width: 200 }}
          />
          <button
            onClick={() => tab === 'students'
              ? exportCSV(filteredStudents, STUDENT_COLS, 'archived-students.csv')
              : exportCSV(filteredUsers, USER_COLS, 'archived-teachers.csv')
            }
            style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'white', fontSize: '.82rem', fontWeight: 700, color: 'var(--primary)',
              cursor: 'pointer', fontFamily: 'inherit' }}>
            Export CSV
          </button>
        </div>
      </div>

      {tab === 'students' && (
        <div className="card">
          <div className="card-title">
            Archived Students
            <span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--muted)' }}>
              Click a row to view full record and attendance history
            </span>
          </div>
          {filteredStudents.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              {search ? 'No results matching your search.' : 'No archived students.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>DOB</th>
                    <th>Parent</th>
                    <th>Phone</th>
                    <th>Group</th>
                    <th>Archived</th>
                    <th>By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map(s => (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => toggleExpand(s.id)}
                        style={{ cursor: 'pointer', background: expanded === s.id ? '#f0f9ff' : undefined }}>
                        <td style={{ fontWeight: 600 }}>
                          {[s.first_name, s.last_name].filter(Boolean).join(' ')}
                          <span style={{ marginLeft: 6, fontSize: '.7rem', color: '#0284c7' }}>
                            {expanded === s.id ? '▲' : '▼'}
                          </span>
                        </td>
                        <td style={{ fontSize: '.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(s.date_of_birth)}</td>
                        <td style={{ fontSize: '.82rem' }}>{s.parent_name || '—'}</td>
                        <td style={{ fontSize: '.82rem' }}>{s.phone || '—'}</td>
                        <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{s.groups?.name || '—'}</td>
                        <td style={{ fontSize: '.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(s.archived_at)}</td>
                        <td style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{s.archived_by_name || '—'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-success btn-xs" disabled={busy === s.id}
                              onClick={() => restoreStudent(s)}>
                              {busy === s.id ? '…' : 'Restore'}
                            </button>
                            <button className="btn btn-danger btn-xs" disabled={busy === s.id}
                              onClick={() => purgeStudent(s)} style={{ fontSize: '.68rem' }}>
                              {busy === s.id ? '…' : 'Erase'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === s.id && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0 8px 8px' }}>
                            <StudentDetailPanel s={s} onClose={() => setExpanded(null)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'users' && (
        <div className="card">
          <div className="card-title">
            Archived Teachers & Staff
            <span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--muted)' }}>
              Click a row to view full record and attendance history
            </span>
          </div>
          {filteredUsers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
              {search ? 'No results matching your search.' : 'No archived teachers.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Group(s)</th>
                    <th>Last Login</th>
                    <th>Deleted</th>
                    <th>By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => (
                    <Fragment key={u.id}>
                      <tr
                        onClick={() => toggleExpand(u.id)}
                        style={{ cursor: 'pointer', background: expanded === u.id ? '#f0f9ff' : undefined }}>
                        <td style={{ fontWeight: 600 }}>
                          {u.name || '—'}
                          <span style={{ marginLeft: 6, fontSize: '.7rem', color: '#0284c7' }}>
                            {expanded === u.id ? '▲' : '▼'}
                          </span>
                        </td>
                        <td style={{ fontSize: '.82rem' }}>{u.email || '—'}</td>
                        <td><span className={`tag tag-${u.role}`}>{u.role}</span></td>
                        <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                          {(u.group_names || []).join(', ') || '—'}
                        </td>
                        <td style={{ fontSize: '.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {fmtDate(u.last_login)}
                        </td>
                        <td style={{ fontSize: '.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                          {fmtDate(u.deleted_at)}
                        </td>
                        <td style={{ fontSize: '.78rem', color: 'var(--muted)' }}>{u.deleted_by_name || '—'}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <button className="btn btn-danger btn-xs" disabled={busy === u.id}
                            onClick={() => purgeUser(u)} style={{ fontSize: '.68rem' }}>
                            {busy === u.id ? '…' : 'Erase'}
                          </button>
                        </td>
                      </tr>
                      {expanded === u.id && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0 8px 8px' }}>
                            <TeacherDetailPanel u={u} onClose={() => setExpanded(null)} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  )
}
