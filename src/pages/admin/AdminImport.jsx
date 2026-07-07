import { useState } from 'react'
import { supabase } from '../../lib/supabase'

const TEMPLATE_HEADERS = 'group_name,first_name,middle_name,last_name,date_of_birth,medical_notes,house_no,street_name,town,postcode,parent_name,relationship,phone,secondary_phone,email,photo_consent'
const TEMPLATE_EXAMPLE = 'Sikhi Group,Amrit,Kaur,Singh,2015-04-12,,12,High Street,Southall,UB1 1AA,Gurpreet Singh,Father,+447700000000,,amrit@example.com,yes'

export default function AdminImport() {
  const [csv, setCsv]     = useState(null)
  const [rows, setRows]   = useState([])
  const [errors, setErrors] = useState([])
  const [busy, setBusy]   = useState(false)
  const [result, setResult] = useState(null)

  function downloadTemplate() {
    const content = TEMPLATE_HEADERS + '\n' + TEMPLATE_EXAMPLE
    const blob = new Blob([content], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'akaal_sahai_import_template.csv'
    a.click(); URL.revokeObjectURL(url)
  }

  function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setCsv(file)
    const reader = new FileReader()
    reader.onload = (ev) => parseCSV(ev.target.result)
    reader.readAsText(file)
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n')
    if (lines.length < 2) { setErrors(['File is empty or has no data rows']); return }
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''))
    const required = ['group_name', 'first_name', 'last_name']
    const missing = required.filter(r => !headers.includes(r))
    if (missing.length) { setErrors(['Missing required columns: ' + missing.join(', ')]); return }

    const parsed = []; const errs = []
    lines.slice(1).forEach((line, i) => {
      if (!line.trim()) return
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''))
      const row = {}
      headers.forEach((h, j) => { row[h] = vals[j] || '' })
      if (!row.group_name) errs.push(`Row ${i + 2}: missing group_name`)
      if (!row.first_name) errs.push(`Row ${i + 2}: missing first_name`)
      if (!row.last_name)  errs.push(`Row ${i + 2}: missing last_name`)
      if (row.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth))
        errs.push(`Row ${i + 2}: date_of_birth must be YYYY-MM-DD`)
      parsed.push(row)
    })
    setRows(parsed); setErrors(errs); setResult(null)
  }

  async function doImport() {
    if (errors.length) { alert('Fix errors before importing'); return }
    setBusy(true); setResult(null)
    try {
      // Get or create groups
      const groupNames = [...new Set(rows.map(r => r.group_name.trim()))]
      const { data: existingGroups } = await supabase.from('groups').select('id, name').in('name', groupNames)
      const groupMap = {}
      existingGroups.forEach(g => { groupMap[g.name] = g.id })

      // Create missing groups
      for (const gname of groupNames) {
        if (!groupMap[gname]) {
          const { data: ng } = await supabase.from('groups').insert({ name: gname }).select('id').single()
          groupMap[gname] = ng.id
        }
      }

      // Insert students
      const students = rows.map(r => ({
        group_id: groupMap[r.group_name.trim()],
        first_name: r.first_name.trim(),
        middle_name: r.middle_name?.trim() || null,
        last_name: r.last_name.trim(),
        date_of_birth: r.date_of_birth?.trim() || null,
        medical_notes: r.medical_notes?.trim() || null,
        house_no: r.house_no?.trim() || null,
        street_name: r.street_name?.trim() || null,
        town: r.town?.trim() || null,
        postcode: r.postcode?.trim() || null,
        parent_name: r.parent_name?.trim() || null,
        relationship: r.relationship?.trim() || null,
        phone: r.phone?.trim() || null,
        secondary_phone: r.secondary_phone?.trim() || null,
        email: r.email?.trim() || null,
        photo_consent: ['yes','true','1'].includes(r.photo_consent?.trim().toLowerCase()),
        date_joined: new Date().toISOString().split('T')[0],
        active: true,
      }))

      const { data: inserted, error } = await supabase.from('students').insert(students).select('id')
      if (error) throw error
      setResult({ success: true, count: inserted.length, groups: Object.keys(groupMap).length })
      setRows([]); setCsv(null)
    } catch (err) {
      setResult({ success: false, message: err.message })
    } finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="card-title">Import Students from CSV</div>

      <div className="alert alert-info">
        Upload a CSV file with student data. Download the template to see the required format.
        Groups will be created automatically if they don't exist yet.
      </div>

      <button className="btn btn-outline" style={{ marginBottom: 16 }} onClick={downloadTemplate}>
        Download CSV Template
      </button>

      <div className="form-group">
        <label>Upload CSV File</label>
        <input type="file" accept=".csv" onChange={handleFile} style={{ padding: '8px', background: 'white' }} />
      </div>

      {errors.length > 0 && (
        <div className="alert alert-danger">
          <strong>Validation errors:</strong>
          <ul style={{ margin: '6px 0 0 16px', fontSize: '.82rem' }}>
            {errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {rows.length > 0 && errors.length === 0 && (
        <>
          <div className="alert alert-success">
            {rows.length} students ready to import across {new Set(rows.map(r => r.group_name)).size} groups.
          </div>
          <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 12 }}>
            <table>
              <thead>
                <tr><th>Group</th><th>Name</th><th>DOB</th><th>Parent</th><th>Phone</th><th>Address</th><th>Medical</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.group_name}</td>
                    <td>{[r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')}</td>
                    <td>{r.date_of_birth || '—'}</td>
                    <td>{r.parent_name || '—'}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{[r.house_no, r.street_name, r.town, r.postcode].filter(Boolean).join(', ') || '—'}</td>
                    <td>{r.medical_notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-success" disabled={busy} onClick={doImport}>
            {busy ? 'Importing…' : `Import ${rows.length} Students`}
          </button>
        </>
      )}

      {result?.success && (
        <div className="alert alert-success" style={{ marginTop: 12 }}>
          Successfully imported {result.count} students across {result.groups} groups.
        </div>
      )}
      {result?.success === false && (
        <div className="alert alert-danger" style={{ marginTop: 12 }}>Import failed: {result.message}</div>
      )}
    </div>
  )
}
