import { fmtDate } from './dates'

// Attendance % = (present + late) / (present + late + absent + unmarked).
// Holidays are excluded. A class day is any date at least one teacher was
// marked; a teacher only "owes" class days on/after their joining date
// (account created_at), and - if they've left - on/before their leaving date.
// Unmarked owed days count as absent but are flagged separately.

export const STATUS_COLOR = { present: '#16a34a', absent: '#dc2626', late: '#d97706', holiday: '#0284c7', unmarked: '#dc2626' }
export const STATUS_BG    = { present: '#f0fdf4', absent: '#fef2f2', late: '#fffbeb', holiday: '#f0f9ff', unmarked: '#fff7ed' }
export const STATUS_LABEL = { present: 'Present', absent: 'Absent', late: 'Late', holiday: 'Holiday', unmarked: 'Not marked — counted as absent' }
export const STATUS_CODE  = { present: 'P', absent: 'A', late: 'L', holiday: 'H', unmarked: 'A*' }
export const LOW_PCT = 75

export function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function todayISO() { return localISO(new Date()) }
export function daysAgoISO(n) { const d = new Date(); d.setDate(d.getDate() - n); return localISO(d) }
export function tsToISO(ts) { return ts ? localISO(new Date(ts)) : null }
export function shortDate(iso) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export function pctText(p) { return p === null ? '—' : `${p}%` }
export function pctColor(p) { return p === null ? 'var(--muted)' : p < LOW_PCT ? '#dc2626' : '#16a34a' }

export function statusTag(r) {
  if (r.left) return r.leftDate ? `Left ${fmtDate(r.leftDate)}` : 'Left'
  if (r.otherRole) return `Now ${r.otherRole}`
  return ''
}

export function buildReport(people, records) {
  const classDays = [...new Set(records.map(r => r.session_date))].sort()
  const byPerson = {}
  records.forEach(r => {
    if (!byPerson[r.teacher_id]) byPerson[r.teacher_id] = {}
    byPerson[r.teacher_id][r.session_date] = r
  })

  const rows = Object.values(people).map(p => {
    const recs = byPerson[p.id] || {}
    const recDates = Object.keys(recs).sort()
    // Window of days this person was expected to attend
    let start = p.joined
    let end = null
    if (p.left || p.otherRole) {
      start = start || recDates[0] || null
      end = p.leftDate || recDates[recDates.length - 1] || null
    }
    const days = {}
    const counts = { present: 0, late: 0, absent: 0, holiday: 0, unmarked: 0 }
    classDays.forEach(d => {
      const rec = recs[d]
      const owed = (!start || d >= start) && (!end || d <= end)
      if (rec) {
        days[d] = { status: rec.status, notes: rec.notes || '' }
        if (counts[rec.status] !== undefined) counts[rec.status]++
      } else if (owed && (p.left || p.otherRole ? recDates.length > 0 : true)) {
        days[d] = { status: 'unmarked', notes: '' }
        counts.unmarked++
      }
    })
    const denom = counts.present + counts.late + counts.absent + counts.unmarked
    const pct = denom ? Math.round(((counts.present + counts.late) / denom) * 100) : null
    return { ...p, days, counts, pct, owedDays: Object.keys(days).length }
  })
  // Former staff with nothing in range are noise
    .filter(r => !(r.left || r.otherRole) || r.owedDays > 0)
  return { classDays, rows }
}

// Fills a landscape A4 jsPDF doc: summary table, then the register grid.
export function buildPdf(doc, autoTable, { classDays, rows, rangeLabel }) {
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('Teacher Attendance Report', 14, 15)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
  doc.text(`${rangeLabel}  ·  ${classDays.length} class days  ·  Generated ${fmtDate(new Date())}`, 14, 21)
  doc.text('Attendance % = (Present + Late) / (Present + Late + Absent + Not marked). Holidays excluded. Days count from each teacher\'s joining date.', 14, 26)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 30,
    head: [['Teacher', 'Primary group', 'Joined', 'Present', 'Late', 'Absent', 'Not marked*', 'Holiday', 'Attendance %']],
    body: rows.map(r => [
      r.name + (statusTag(r) ? ` (${statusTag(r)})` : ''),
      r.groups.join(', '),
      r.joined ? fmtDate(r.joined) : '',
      r.counts.present, r.counts.late, r.counts.absent, r.counts.unmarked, r.counts.holiday, pctText(r.pct),
    ]),
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: { fillColor: [30, 26, 110] },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 55 }, 2: { cellWidth: 22 } },
    didParseCell: h => {
      if (h.section !== 'body') return
      const r = rows[h.row.index]
      if (h.column.index === 8) { h.cell.styles.textColor = rgb(r.pct !== null && r.pct < LOW_PCT ? '#dc2626' : '#16a34a'); h.cell.styles.fontStyle = 'bold' }
      if (h.column.index === 6 && r.counts.unmarked > 0) h.cell.styles.textColor = rgb('#ea580c')
      if (h.column.index === 0 && r.left) h.cell.styles.textColor = rgb('#64748b')
    },
  })

  doc.setFontSize(8); doc.setTextColor(100)
  doc.text('* Not marked: no attendance was recorded for that day — counted as absent.', 14, doc.lastAutoTable.finalY + 5)
  doc.setTextColor(0)

  doc.addPage()
  doc.setFontSize(13); doc.setFont('helvetica', 'bold')
  doc.text('Register grid', 14, 15)
  doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
  doc.text('P = Present   L = Late   A = Absent   A* = Not marked (counted as absent)   H = Holiday   blank = before joining / after leaving', 14, 20)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: 24,
    head: [['Teacher', ...classDays.map(shortDate), '%']],
    body: rows.map(r => [
      r.name + (r.left ? ' (Left)' : ''),
      ...classDays.map(d => r.days[d] ? STATUS_CODE[r.days[d].status] : ''),
      pctText(r.pct),
    ]),
    styles: { fontSize: 7, cellPadding: 1.2, halign: 'center' },
    headStyles: { fillColor: [30, 26, 110], fontSize: 6.5 },
    columnStyles: { 0: { halign: 'left', cellWidth: 48 } },
    horizontalPageBreak: true,
    horizontalPageBreakRepeat: 0,
    didParseCell: h => {
      if (h.section !== 'body' || h.column.index === 0) return
      const r = rows[h.row.index]
      if (h.column.index === classDays.length + 1) {
        h.cell.styles.textColor = rgb(r.pct !== null && r.pct < LOW_PCT ? '#dc2626' : '#16a34a')
        h.cell.styles.fontStyle = 'bold'
        return
      }
      const st = r.days[classDays[h.column.index - 1]]?.status
      if (!st) return
      h.cell.styles.textColor = rgb(STATUS_COLOR[st])
      h.cell.styles.fillColor = rgb(STATUS_BG[st])
      h.cell.styles.fontStyle = 'bold'
    },
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150)
    doc.text(`Page ${i} of ${pages}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 6, { align: 'right' })
  }
}
