export function exportCSV(rows, cols, filename) {
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
