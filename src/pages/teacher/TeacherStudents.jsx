import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import MedicalBadge from '../../components/MedicalBadge'
import { fmtDate } from '../../lib/dates'

const EMPTY_FORM = {
  first_name: '', middle_name: '', last_name: '', date_of_birth: '',
  parent_name: '', relationship: '', phone: '', secondary_phone: '',
  email: '', house_no: '', street_name: '', town: '', postcode: '',
  medical_notes: '', photo_consent: false,
}

export default function TeacherStudents() {
  const { user, profile } = useAuth()
  const canEdit = profile?.can_edit_students === true
  const [myGroups, setMyGroups] = useState([])
  const [students, setStudents] = useState([])
  const [groupId, setGroupId]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(null)   // student id or 'new'
  const [form, setForm]         = useState(EMPTY_FORM)
  const [busy, setBusy]         = useState(false)
  const [search, setSearch]     = useState('')
  const [sortCol, setSortCol]   = useState('name')
  const [sortDir, setSortDir]   = useState('asc')

  useEffect(() => { load() }, [user])

  async function load() {
    if (!user) return
    try {
      // Query both assignment methods and merge to handle all teacher setups
      const [{ data: tgRows }, { data: primaryRows }] = await Promise.all([
        supabase.from('teacher_groups').select('group_id, groups(id, name)').eq('teacher_id', user.id),
        supabase.from('groups').select('id, name').eq('teacher_id', user.id),
      ])

      const grpMap = new Map()
      ;(tgRows || []).forEach(r => { if (r.groups) grpMap.set(r.groups.id, r.groups) })
      ;(primaryRows || []).forEach(g => { if (!grpMap.has(g.id)) grpMap.set(g.id, g) })

      let grps = [...grpMap.values()].sort((a, b) => a.name.localeCompare(b.name))

      if (grps.length === 0 && profile?.group_id) {
        const { data: g } = await supabase.from('groups').select('id, name').eq('id', profile.group_id).single()
        if (g) grps = [g]
      }

      setMyGroups(grps)
      if (grps.length > 0) {
        const gid = grps[0].id
        setGroupId(gid)
        await loadStudentsForGroup(gid)
      }
    } catch (err) {
      console.error('TeacherStudents load error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadStudentsForGroup(gid) {
    const { data } = await supabase
      .from('students').select('*')
      .eq('group_id', gid).eq('active', true)
      .order('last_name').order('first_name')
    setStudents(data || [])
  }

  async function switchGroup(gid) {
    setGroupId(gid)
    setEditing(null)
    setSearch('')
    setLoading(true)
    try { await loadStudentsForGroup(gid) }
    finally { setLoading(false) }
  }

  function startEdit(s) {
    setForm({
      first_name: s.first_name || '', middle_name: s.middle_name || '',
      last_name: s.last_name || '', date_of_birth: s.date_of_birth || '',
      parent_name: s.parent_name || '', relationship: s.relationship || '',
      phone: s.phone || '', secondary_phone: s.secondary_phone || '',
      email: s.email || '', house_no: s.house_no || '',
      street_name: s.street_name || '', town: s.town || '',
      postcode: s.postcode || '', medical_notes: s.medical_notes || '',
      photo_consent: s.photo_consent || false,
    })
    setEditing(s.id)
  }

  function startNew() {
    setForm(EMPTY_FORM)
    setEditing('new')
  }

  function cancel() { setEditing(null); setForm(EMPTY_FORM) }

  function set(k) { return e => setForm(f => ({ ...f, [k]: e.target.value })) }
  function setCheck(k) { return e => setForm(f => ({ ...f, [k]: e.target.checked })) }

  async function save() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      alert('First name and last name are required'); return
    }
    setBusy(true)
    try {
      const payload = {
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim() || null,
        last_name: form.last_name.trim(),
        date_of_birth: form.date_of_birth || null,
        parent_name: form.parent_name.trim() || null,
        relationship: form.relationship.trim() || null,
        phone: form.phone.trim() || null,
        secondary_phone: form.secondary_phone.trim() || null,
        email: form.email.trim() || null,
        house_no: form.house_no.trim() || null,
        street_name: form.street_name.trim() || null,
        town: form.town.trim() || null,
        postcode: form.postcode.trim() || null,
        medical_notes: form.medical_notes.trim() || null,
        photo_consent: form.photo_consent,
      }

      if (editing === 'new') {
        const { error } = await supabase.from('students').insert({
          ...payload,
          group_id: groupId,
          date_joined: new Date().toISOString().split('T')[0],
          active: true,
        })
        if (error) throw error
      } else {
        const { error } = await supabase.from('students').update(payload).eq('id', editing)
        if (error) throw error
      }
      cancel(); load()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setBusy(false) }
  }

  function calcAge(dob) {
    if (!dob) return null
    const d = new Date(dob), now = new Date()
    let a = now.getFullYear() - d.getFullYear()
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) a--
    return a
  }

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  function sortIcon(col) {
    if (sortCol !== col) return <span style={{ marginLeft: 3, fontSize: '.6rem', color: '#cbd5e1' }}>⇅</span>
    return <span style={{ marginLeft: 3, fontSize: '.6rem', color: 'var(--primary)' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    return !q || [s.first_name, s.middle_name, s.last_name, s.parent_name]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    let va, vb
    if (sortCol === 'name') {
      va = [a.last_name, a.first_name].filter(Boolean).join(' ').toLowerCase()
      vb = [b.last_name, b.first_name].filter(Boolean).join(' ').toLowerCase()
    } else if (sortCol === 'age') {
      va = calcAge(a.date_of_birth) ?? -1
      vb = calcAge(b.date_of_birth) ?? -1
    } else if (sortCol === 'dob') {
      va = a.date_of_birth || ''
      vb = b.date_of_birth || ''
    } else if (sortCol === 'parent') {
      va = a.parent_name?.toLowerCase() || ''
      vb = b.parent_name?.toLowerCase() || ''
    } else if (sortCol === 'phone') {
      va = a.phone || ''
      vb = b.phone || ''
    } else { return 0 }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  if (loading) return <div className="spinner" />

  if (!groupId) return (
    <div className="card">
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        You are not assigned to a group yet. Contact an admin.
      </div>
    </div>
  )

  const filtered_count = students.filter(s => {
    if (!search) return true
    const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ').toLowerCase()
    return name.includes(search.toLowerCase())
  }).length

  return (
    <>
    {myGroups.length > 1 && (
      <div className="nav-tabs" style={{ marginBottom: 0 }}>
        {myGroups.map(g => (
          <button key={g.id} className={`nav-tab ${groupId === g.id ? 'active' : ''}`}
            onClick={() => switchGroup(g.id)}>{g.name}</button>
        ))}
      </div>
    )}
    <div className="card">
      <div className="card-title">
        My Students ({search ? filtered_count : students.length})
        {canEdit && <button className="btn btn-primary btn-sm" onClick={startNew}>+ Add Student</button>}
      </div>

      {!canEdit && (
        <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, fontSize: '.84rem', color: '#64748b' }}>
          Viewing only — your admin has not enabled student editing for your account.
        </div>
      )}

      {/* Add / Edit form */}
      {editing && canEdit && (
        <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 16, color: 'var(--primary)' }}>
            {editing === 'new' ? 'Add New Student' : 'Edit Student'}
          </div>

          <div style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Student Details</div>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label>First Name *</label>
              <input value={form.first_name} onChange={set('first_name')} placeholder="e.g. Amrit" />
            </div>
            <div className="form-group">
              <label>Middle Name</label>
              <input value={form.middle_name} onChange={set('middle_name')} placeholder="Optional" />
            </div>
            <div className="form-group">
              <label>Last Name *</label>
              <input value={form.last_name} onChange={set('last_name')} placeholder="e.g. Singh" />
            </div>
            <div className="form-group">
              <label>Date of Birth</label>
              <input type="date" value={form.date_of_birth} onChange={set('date_of_birth')} />
            </div>
          </div>

          <div style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Parent / Guardian</div>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label>Parent Name</label>
              <input value={form.parent_name} onChange={set('parent_name')} placeholder="e.g. Gurpreet Singh" />
            </div>
            <div className="form-group">
              <label>Relationship</label>
              <select value={form.relationship} onChange={set('relationship')}>
                <option value="">Select…</option>
                {['Mother','Father','Guardian','Grandparent','Sibling','Other'].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input value={form.phone} onChange={set('phone')} placeholder="+447700000000" />
            </div>
            <div className="form-group">
              <label>Secondary Phone</label>
              <input value={form.secondary_phone} onChange={set('secondary_phone')} placeholder="Optional" />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="parent@example.com" />
            </div>
          </div>

          <div style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Address</div>
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div className="form-group">
              <label>House No.</label>
              <input value={form.house_no} onChange={set('house_no')} placeholder="12" />
            </div>
            <div className="form-group">
              <label>Street</label>
              <input value={form.street_name} onChange={set('street_name')} placeholder="High Street" />
            </div>
            <div className="form-group">
              <label>Town</label>
              <input value={form.town} onChange={set('town')} placeholder="Southall" />
            </div>
            <div className="form-group">
              <label>Postcode</label>
              <input value={form.postcode} onChange={set('postcode')} placeholder="UB1 1AA" />
            </div>
          </div>

          <div style={{ fontWeight: 600, fontSize: '.8rem', color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.05em' }}>Medical & Consent</div>
          <div className="form-group" style={{ marginBottom: 10 }}>
            <label>Medical Notes / Conditions</label>
            <textarea value={form.medical_notes} onChange={set('medical_notes')}
              placeholder="Any allergies, conditions or medical information the teacher should be aware of…"
              rows={3} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', marginBottom: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.photo_consent} onChange={setCheck('photo_consent')} style={{ width: 'auto' }} />
            Photo consent given
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" disabled={busy} onClick={save}>
              {busy ? 'Saving…' : editing === 'new' ? 'Add Student' : 'Save Changes'}
            </button>
            <button className="btn btn-outline" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      {students.length > 5 && (
        <div className="form-group" style={{ marginBottom: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search students…" style={{ maxWidth: 280 }} />
        </div>
      )}

      {/* Student list */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th onClick={() => toggleSort('name')}   style={{ cursor: 'pointer', userSelect: 'none' }}>Student{sortIcon('name')}</th>
              <th onClick={() => toggleSort('age')}    style={{ cursor: 'pointer', userSelect: 'none' }}>Age{sortIcon('age')}</th>
              <th onClick={() => toggleSort('dob')}    style={{ cursor: 'pointer', userSelect: 'none' }}>Date of Birth{sortIcon('dob')}</th>
              <th onClick={() => toggleSort('parent')} style={{ cursor: 'pointer', userSelect: 'none' }}>Parent{sortIcon('parent')}</th>
              <th onClick={() => toggleSort('phone')}  style={{ cursor: 'pointer', userSelect: 'none' }}>Phone{sortIcon('phone')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => {
              const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
              return (
                <tr key={s.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>{fullName}</span>
                      <MedicalBadge notes={s.medical_notes} studentName={fullName} />
                    </div>
                  </td>
                  <td style={{ fontSize: '.85rem', fontWeight: 600 }}>{calcAge(s.date_of_birth) ?? '—'}</td>
                  <td className="date" style={{ fontSize: '.85rem' }}>{fmtDate(s.date_of_birth)}</td>
                  <td style={{ fontSize: '.85rem' }}>
                    {s.parent_name ? `${s.parent_name}${s.relationship ? ` (${s.relationship})` : ''}` : '—'}
                  </td>
                  <td style={{ fontSize: '.85rem' }}>{s.phone || '—'}</td>
                  <td>
                    {canEdit && (
                      <button className="btn btn-outline btn-xs" onClick={() => startEdit(s)}>Edit</button>
                    )}
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                {search ? 'No students match your search' : 'No students in your group yet'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
    </>
  )
}
