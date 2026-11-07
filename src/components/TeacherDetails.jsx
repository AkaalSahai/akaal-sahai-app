import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fmtDate } from '../lib/dates'
import { registerByKey } from '../lib/teacherRegisters'
import { STATUS_COLOR } from '../lib/teacherAttendanceReport'

// Everything about one member of staff in one place (Teachers page ->
// Details): their account, what they filled in on their teacher application
// (phone, DBS, experience...) and their Teacher Register this school year.
// Admins only (agreed 05-11-2026).

// School year starts 1 September
function schoolYearStart(today = new Date()) {
  const y = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1
  return `${y}-09-01`
}

const STATUSES = ['present', 'late', 'absent', 'holiday']

export default function TeacherDetails({ user, nameOf }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let cancelled = false
    const since = schoolYearStart()
    Promise.all([
      supabase.from('users').select('created_at').eq('id', user.id).maybeSingle(),
      supabase.from('teacher_applications')
        .select('created_at, phone, dbs_number, experience, preferred_group, status, reviewed_at, reviewed_by')
        .eq('auth_user_id', user.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('teacher_attendance').select('status, notes, class_type')
        .eq('teacher_id', user.id).gte('session_date', since),
    ]).then(([{ data: acc }, { data: apps }, { data: att }]) => {
      if (cancelled) return
      const attendance = {}
      ;(att || []).forEach(r => {
        const k = r.class_type || 'punjabi'
        if (!attendance[k]) attendance[k] = { present: 0, late: 0, absent: 0, holiday: 0, auto: 0 }
        if (attendance[k][r.status] !== undefined) attendance[k][r.status]++
        if (r.status === 'absent' && (r.notes || '').startsWith('Auto:')) attendance[k].auto++
      })
      setData({ joined: acc?.created_at, app: apps?.[0] || null, attendance, since })
    })
    return () => { cancelled = true }
  }, [user.id])

  if (!data) return <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Loading…</div>

  const { app, attendance } = data
  const permissions = [
    user.can_edit_students && 'Edit Students',
    user.can_manage_teacher_register && 'Register Manager',
    user.can_manage_projector && 'Projector Manager',
    ...(user.register_manager_classes || []).map(k => `Marks ${registerByKey(k).label} register`),
  ].filter(Boolean)
  const appPhone = app?.phone && app.phone !== user.phone ? app.phone : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
      <Section title="Account">
        <Row label="Email" value={user.email} />
        <Row label="Phone" value={user.phone} />
        <Row label="Role" value={[user.role, ...(user.extra_roles || [])].join(', ')} />
        <Row label="Groups" value={(user.groupNames || []).join(', ')} />
        <Row label="Permissions" value={permissions.join(', ') || 'None'} />
        <Row label="Other registers" value={(user.register_classes || []).map(k => registerByKey(k).label).join(', ')} />
        <Row label="Joined" value={data.joined && fmtDate(data.joined)} />
        <Row label="Last login" value={user.last_login ? fmtDate(user.last_login) : 'Never'} />
      </Section>

      <Section title="Teacher application">
        {app ? (
          <>
            <Row label="Applied" value={fmtDate(app.created_at)} />
            {appPhone && <Row label="Phone on application" value={appPhone} />}
            <Row label="DBS number" value={app.dbs_number} />
            <Row label="Preferred group" value={app.preferred_group} />
            <Row label="Experience" value={app.experience} />
            <Row label={app.status === 'rejected' ? 'Rejected by' : 'Approved by'}
              value={[nameOf(app.reviewed_by), app.reviewed_at && fmtDate(app.reviewed_at)].filter(Boolean).join(' · ')} />
          </>
        ) : (
          <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            No application on file - this account was added another way, or the application was cleared.
          </div>
        )}
      </Section>

      <Section title={`Teacher Register since ${fmtDate(data.since)}`}>
        {Object.keys(attendance).length === 0 && (
          <div style={{ fontSize: '.82rem', color: 'var(--muted)' }}>No marks yet.</div>
        )}
        {Object.entries(attendance).map(([k, c]) => (
          <div key={k} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: 3 }}>{registerByKey(k).label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: '.8rem' }}>
              {STATUSES.filter(s => c[s] > 0).map(s => (
                <span key={s} style={{ color: STATUS_COLOR[s], fontWeight: 600 }}>
                  {s[0].toUpperCase() + s.slice(1)} {c[s]}{s === 'absent' && c.auto > 0 ? ` (${c.auto} not marked)` : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
        letterSpacing: '.05em', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: '.82rem', marginBottom: 5 }}>
      <span style={{ color: 'var(--muted)', minWidth: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value || '—'}</span>
    </div>
  )
}
