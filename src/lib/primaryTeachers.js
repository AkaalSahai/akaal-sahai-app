import { supabase } from './supabase'

// A group can have more than one primary teacher (teacher_groups.role =
// 'primary', agreed 30-10-2026). groups.teacher_id is kept pointing at one of
// them - the "lead" - because older checks (RLS, notifications) still read
// that single field. Every group with teachers keeps at least one primary.
//
// The group objects passed in are the shape AdminGroups/AdminClasses build:
// { id, name, teacher_id, teacherIds: [...], teacherRoles: { id: role } }.

// "Harpreet Kaur Sandhu" -> "Harpreet S.", "Harpreet" -> "Harpreet"
export function shortName(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length < 2) return words[0] || ''
  return `${words[0]} ${words[words.length - 1][0]}.`
}

// One teacher -> full name; several -> "Harpreet S., Jaspreet K. & Simran K."
// Same format as primary_teacher_label() on the projector.
export function primaryTeacherLabel(names) {
  const list = (names || []).filter(Boolean)
  if (list.length === 0) return null
  if (list.length === 1) return list[0]
  const short = list.map(shortName)
  return short.slice(0, -1).join(', ') + ' & ' + short[short.length - 1]
}

// { groupId: label } for screens that show a group with its teacher(s).
// Primary teachers, lead first; a group with no primary falls back to any
// one of its teachers, as before.
export function groupTeacherLabels(groups, tgRows, nameOf) {
  const byGroup = {}
  ;(tgRows || []).forEach(r => { (byGroup[r.group_id] ||= []).push(r) })
  const out = {}
  ;(groups || []).forEach(g => {
    const rows = byGroup[g.id] || []
    const others = rows.filter(r => r.role === 'primary' && r.teacher_id !== g.teacher_id)
      .map(r => nameOf(r.teacher_id)).filter(Boolean).sort((a, b) => a.localeCompare(b))
    const names = [nameOf(g.teacher_id), ...others].filter(Boolean)
    if (!names.length) {
      const any = rows.map(r => nameOf(r.teacher_id)).find(Boolean)
      if (any) names.push(any)
    }
    out[g.id] = primaryTeacherLabel(names)
  })
  return out
}

const primariesOf = g => (g?.teacherIds || []).filter(id => g.teacherRoles?.[id] === 'primary')

// A group's first teacher becomes primary; anyone added after is covering
// until made primary.
export async function addTeacher(g, teacherId) {
  const role = primariesOf(g).length ? 'covering' : 'primary'
  const { error } = await supabase.from('teacher_groups').insert({ teacher_id: teacherId, group_id: g.id, role })
  if (error) throw error
  if (role === 'primary') await setLead(g.id, teacherId)
  return role
}

// Adds a primary alongside the existing one(s) - nobody is demoted.
export async function makePrimary(g, teacherId) {
  const { error } = await supabase.from('teacher_groups').update({ role: 'primary' })
    .eq('group_id', g.id).eq('teacher_id', teacherId)
  if (error) throw error
  if (!g.teacher_id) await setLead(g.id, teacherId)
}

// Moves a primary back to covering. Not allowed for the last primary.
export async function makeCovering(g, teacherId) {
  const others = primariesOf(g).filter(id => id !== teacherId)
  if (!others.length) throw new Error('A group needs at least one primary teacher. Make someone else primary first.')
  const { error } = await supabase.from('teacher_groups').update({ role: 'covering' })
    .eq('group_id', g.id).eq('teacher_id', teacherId)
  if (error) throw error
  if (g.teacher_id === teacherId) await setLead(g.id, others[0])
}

// Removing the last primary promotes a remaining covering teacher rather
// than leaving the group with no primary. A removed teacher never stays
// the lead, or they'd keep access despite being "removed".
export async function removeTeacher(g, teacherId) {
  const { error } = await supabase.from('teacher_groups').delete()
    .eq('teacher_id', teacherId).eq('group_id', g.id)
  if (error) throw error
  const remaining = (g.teacherIds || []).filter(id => id !== teacherId)
  const primaries = primariesOf(g).filter(id => id !== teacherId)
  if (!primaries.length && remaining.length) {
    await supabase.from('teacher_groups').update({ role: 'primary' })
      .eq('group_id', g.id).eq('teacher_id', remaining[0])
    primaries.push(remaining[0])
  }
  if (g.teacher_id === teacherId) await setLead(g.id, primaries[0] || null)
}

async function setLead(groupId, teacherId) {
  const { error } = await supabase.from('groups').update({ teacher_id: teacherId }).eq('id', groupId)
  if (error) throw error
}
