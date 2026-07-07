import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const AVATARS = ['#6366f1','#ec4899','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ef4444','#14b8a6']
const color = (i) => AVATARS[i % AVATARS.length]

export default function AdminStudents() {
  const [students, setStudents] = useState([])
  const [groups, setGroups]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [groupFilter, setGroupFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [editing, setEditing]   = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: g }] = await Promise.all([
      supabase.from('students').select('*, groups(id, name)').eq('active', true).order('last_name'),
      supabase.from('groups').select('id, name').order('name'),
    ])
    setStudents(s || [])
    setGroups(g || [])
    setLoading(false)
  }

  async function moveGroup(studentId, newGroupId) {
    await supabase.from('students').update({ group_id: newGroupId }).eq('id', studentId)
    load()
  }

  async function deactivate(studentId) {
    if (!confirm('Remove this student from the system? This cannot be undone.')) return
    await supabase.from('students').update({ active: false }).eq('id', studentId)
    load()
  }

  const filtered = students.filter(s => {
    const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ').toLowerCase()
    const matchSearch = !search || name.includes(search.toLowerCase())
    const matchGroup  = !groupFilter || s.group_id === groupFilter
    return matchSearch && matchGroup
  })

  if (loading) return <div className="spinner" />

  return (
    <div className="card">
      <div className="card-title">
        Students ({filtered.length})
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search by name…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: 170, padding: '7px 10px', fontSize: '.84rem' }} />
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)}
            style={{ padding: '7px 10px', fontSize: '.84rem' }}>
            <option value="">All groups</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>DOB</th>
              <th>Group</th>
              <th>Phone</th>
              <th>Date Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s, i) => {
              const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(' ')
              return (
                <>
                  <tr key={s.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="student-avatar" style={{ background: color(i) }}>
                          {s.first_name[0]}{s.last_name[0]}
                        </div>
                        <div>
                          <div className="student-name">{fullName}</div>
                        </div>
                      </div>
                    </td>
                    <td>{s.date_of_birth || '—'}</td>
                    <td>{s.groups?.name || <span style={{ color: 'var(--muted)' }}>No group</span>}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.date_joined || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-outline btn-xs" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                          {expanded === s.id ? 'Less' : 'Details'}
                        </button>
                        <button className="btn btn-danger btn-xs" onClick={() => deactivate(s.id)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={s.id + '-exp'}>
                      <td colSpan={6} style={{ background: '#f8fafc', padding: '12px 16px' }}>
                        <div className="app-details">
                          <Detail label="Parent/Guardian" value={s.parent_name} />
                          <Detail label="Relationship" value={s.relationship} />
                          <Detail label="Phone" value={s.phone} />
                          <Detail label="Secondary Phone" value={s.secondary_phone || '—'} />
                          <Detail label="Email" value={s.email || '—'} />
                          <Detail label="Address" value={[s.house_no, s.street_name, s.town, s.postcode].filter(Boolean).join(', ')} />
                          {s.medical_notes && <Detail label="Medical Notes" value={s.medical_notes} />}
                          <Detail label="Photo Consent" value={s.photo_consent ? 'Yes' : 'No'} />
                        </div>
                        <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                          <label style={{ fontSize: '.8rem', marginBottom: 0 }}>Move to group:</label>
                          <select defaultValue={s.group_id || ''} onChange={e => e.target.value && moveGroup(s.id, e.target.value)}
                            style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.83rem' }}>
                            <option value="">— select —</option>
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: 30 }}>No students found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div className="app-detail-item">
      <div className="app-detail-label">{label}</div>
      <div style={{ fontWeight: 600 }}>{value}</div>
    </div>
  )
}
