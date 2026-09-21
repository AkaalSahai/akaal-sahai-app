import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { logAction } from '../../lib/audit'
import { fmtDate } from '../../lib/dates'
import { getVerificationStatus, VERIFICATION_REASON_LABEL } from '../../lib/verification'

export default function AdminVerificationStatus() {
  const { profile, hasRole } = useAuth()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [requiredSince, setRequiredSince]   = useState(null)
  const [requiredReason, setRequiredReason] = useState(null)
  // Defaults to showing every group, not just outstanding ones - a group
  // that just became fully verified should show up as a positive "all
  // done" confirmation, not silently disappear from the page. Admin can
  // still switch to outstanding-only when specifically chasing people.
  const [showOnlyOutstanding, setShowOnlyOutstanding] = useState(false)
  const [triggerOpen, setTriggerOpen] = useState(false)
  const [triggerReason, setTriggerReason] = useState('')
  const [triggerBusy, setTriggerBusy] = useState(false)

  const load = useCallback(async () => {
    const [
      { data: groups },
      { data: students },
      { data: teachers },
      { data: tgRows },
      { data: settingsRows },
    ] = await Promise.all([
      supabase.from('groups').select('id, name, teacher_id, class_type').order('name'),
      supabase.from('students').select('*').eq('active', true),
      supabase.from('users').select('id, name').eq('role', 'teacher'),
      supabase.from('teacher_groups').select('teacher_id, group_id'),
      supabase.from('site_settings').select('key, value')
        .in('key', ['verification_required_since', 'verification_required_reason']),
    ])

    // Deliberately unfiltered by student_id (unlike TeacherStudents.jsx's
    // small per-teacher-roster version of this same query) - this is
    // admin-only data, RLS already grants full access, and an .in() filter
    // listing every active student's id (800+) produces a URL well past
    // what the API gateway accepts, failing with a 400 that was silently
    // swallowed here - every count on this page read 0 because of it. This
    // matches the working, unfiltered query AdminDashboard.jsx already uses.
    const { data: verRows, error: verErr } = await supabase
      .from('student_verifications').select('*').order('verified_at', { ascending: false })
    if (verErr) {
      setLoadError(verErr.message)
      setLoading(false)
      return
    }
    setLoadError(null)

    const latestByStudent = {}
    ;(verRows || []).forEach(v => { if (!latestByStudent[v.student_id]) latestByStudent[v.student_id] = v })

    const settingsMap = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]))
    const since = settingsMap.verification_required_since || null
    setRequiredSince(since)
    setRequiredReason(settingsMap.verification_required_reason || null)

    const teacherMap = Object.fromEntries((teachers || []).map(t => [t.id, t.name]))
    const tgMap = {}
    ;(tgRows || []).forEach(r => {
      if (!tgMap[r.group_id]) tgMap[r.group_id] = []
      if (teacherMap[r.teacher_id]) tgMap[r.group_id].push(teacherMap[r.teacher_id])
    })

    const studentsByGroup = {}
    ;(students || []).forEach(s => {
      if (!s.group_id) return
      if (!studentsByGroup[s.group_id]) studentsByGroup[s.group_id] = []
      studentsByGroup[s.group_id].push(s)
    })

    const groupSummaries = (groups || [])
      .map(g => {
        const groupStudents = studentsByGroup[g.id] || []
        const withStatus = groupStudents.map(s => ({
          student: s,
          status: getVerificationStatus(s, latestByStudent[s.id], since),
        }))
        const unverified = withStatus.filter(x => !x.status.verified)
        const verified = withStatus.filter(x => x.status.verified)
        const teacherNames = tgMap[g.id] || (g.teacher_id && teacherMap[g.teacher_id] ? [teacherMap[g.teacher_id]] : [])
        return {
          id: g.id, name: g.name, teacherNames,
          total: groupStudents.length,
          verifiedCount: groupStudents.length - unverified.length,
          unverified,
          verified,
        }
      })

    setData(groupSummaries)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function submitTrigger() {
    if (!triggerReason.trim()) { alert('Please give a reason so teachers understand why.'); return }
    if (!confirm('This will mark every student\'s current verification as outstanding, requiring every teacher to re-check every student. Continue?')) return
    setTriggerBusy(true)
    try {
      const now = new Date().toISOString()
      const { error: e1 } = await supabase.from('site_settings')
        .upsert({ key: 'verification_required_since', value: now })
      if (e1) throw e1
      const { error: e2 } = await supabase.from('site_settings')
        .upsert({ key: 'verification_required_reason', value: triggerReason.trim() })
      if (e2) throw e2
      logAction(profile, 'Required student re-verification', triggerReason.trim()).catch(() => {})
      setTriggerOpen(false)
      setTriggerReason('')
      await load()
    } catch (err) {
      logAction(profile, 'Required student re-verification', err.message, false).catch(() => {})
      alert('Error: ' + err.message)
    } finally {
      setTriggerBusy(false)
    }
  }

  if (loading) return <div className="spinner" />

  if (loadError) {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
        padding: '14px 18px', color: '#991b1b', fontSize: '.85rem' }}>
        <strong>Couldn't load verification data:</strong> {loadError}
        <button className="btn btn-outline btn-sm" style={{ marginLeft: 12 }} onClick={load}>Retry</button>
      </div>
    )
  }

  const groups = data || []
  const totalStudents  = groups.reduce((s, g) => s + g.total, 0)
  const totalVerified  = groups.reduce((s, g) => s + g.verifiedCount, 0)
  const groupsFullyDone = groups.filter(g => g.total > 0 && g.unverified.length === 0).length
  const groupsWithData  = groups.filter(g => g.total > 0).length

  return (
    <>
      {/* Summary tiles */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 140, background: 'white', borderRadius: 10,
          padding: '14px 18px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>
            {groupsFullyDone}/{groupsWithData}
          </div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase',
            letterSpacing: '.06em', marginTop: 4, opacity: .85 }}>Groups Fully Verified</div>
        </div>
        <div style={{ flex: 1, minWidth: 140, background: 'white', borderRadius: 10,
          padding: '14px 18px', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(0,0,0,.05)' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>
            {totalVerified}/{totalStudents}
          </div>
          <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase',
            letterSpacing: '.06em', marginTop: 4, opacity: .85 }}>Students Verified</div>
        </div>
      </div>

      {requiredReason && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, fontSize: '.85rem', color: '#92400e' }}>
          Active re-verification request: "{requiredReason}" (since {fmtDate(requiredSince)})
        </div>
      )}

      <div className="card">
        <div className="card-title">
          Student Detail Verification — by Group
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={() => setShowOnlyOutstanding(v => !v)}
              style={{ fontSize: '.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                border: `1px solid ${showOnlyOutstanding ? '#fecaca' : 'var(--border)'}`,
                background: showOnlyOutstanding ? '#fef2f2' : 'white',
                color: showOnlyOutstanding ? '#dc2626' : 'var(--muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
              {showOnlyOutstanding ? 'Show all groups' : 'Outstanding only'}
            </button>
            {hasRole('admin') && (
              <button onClick={() => setTriggerOpen(v => !v)}
                style={{ fontSize: '.74rem', fontWeight: 700, padding: '4px 10px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'white', color: 'var(--primary)',
                  cursor: 'pointer', fontFamily: 'inherit' }}>
                Require re-verification…
              </button>
            )}
          </div>
        </div>

        {triggerOpen && (
          <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8,
            padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 700, marginBottom: 8 }}>
              Require every student to be re-verified
            </div>
            <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 10 }}>
              This immediately marks every existing sign-off as outstanding, regardless of how recent it was —
              use this ahead of an event (e.g. a trip or camp) where you need fresh confirmation now.
            </div>
            <input type="text" value={triggerReason} onChange={e => setTriggerReason(e.target.value)}
              placeholder="e.g. Sikhi Camp — please confirm medical/contact details are current"
              style={{ width: '100%', marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-danger btn-sm" disabled={triggerBusy} onClick={submitTrigger}>
                {triggerBusy ? 'Submitting…' : 'Require Re-Verification'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setTriggerOpen(false)}>Cancel</button>
            </div>
          </div>
        )}

        {groups
          .filter(g => g.total > 0 && (!showOnlyOutstanding || g.unverified.length > 0))
          // Outstanding groups first - with every group visible by default,
          // the ones needing attention shouldn't be buried alphabetically
          // behind groups that are already fully done.
          .sort((a, b) => (a.unverified.length > 0 ? 0 : 1) - (b.unverified.length > 0 ? 0 : 1))
          .map(g => (
          <div key={g.id} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 700 }}>{g.name}</span>
                <span style={{ fontSize: '.78rem', color: 'var(--muted)', marginLeft: 8 }}>
                  {g.teacherNames.join(', ') || 'No teacher'}
                </span>
              </div>
              <span style={{ fontSize: '.8rem', fontWeight: 700,
                color: g.unverified.length === 0 ? '#16a34a' : '#d97706' }}>
                {g.verifiedCount}/{g.total} verified
              </span>
            </div>
            {g.verified.length > 0 && (
              <details style={{ marginBottom: g.unverified.length > 0 ? 10 : 0 }}>
                <summary style={{ cursor: 'pointer', fontSize: '.78rem', fontWeight: 700, color: '#16a34a' }}>
                  ✓ {g.verified.length} verified
                </summary>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {g.verified.map(({ student: s, status }) => (
                    <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6,
                      padding: '3px 9px', fontSize: '.76rem' }}>
                      <strong>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</strong>
                      <span style={{ color: '#16a34a' }}>✓ {fmtDate(status.verifiedAt)}</span>
                    </span>
                  ))}
                </div>
              </details>
            )}
            {g.unverified.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {g.unverified.map(({ student: s, status }) => (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6,
                    padding: '3px 9px', fontSize: '.76rem' }}>
                    <strong>{[s.first_name, s.last_name].filter(Boolean).join(' ')}</strong>
                    <span style={{ color: '#92400e' }}>— {VERIFICATION_REASON_LABEL[status.reason]}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '.8rem', color: '#16a34a', fontWeight: 600 }}>All students verified ✓</div>
            )}
          </div>
        ))}
        {groups.filter(g => g.total > 0).length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>No groups with students found</div>
        )}
      </div>
    </>
  )
}
