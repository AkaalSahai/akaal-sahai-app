import { useState, useEffect, useRef } from 'react'
import Topbar from '../../components/Topbar'
import TeacherRegister from './TeacherRegister'
import TeacherReports from './TeacherReports'
import TeacherMessage from './TeacherMessage'
import AdminApplications from '../admin/AdminApplications'
import AdminStudents from '../admin/AdminStudents'
import AdminGroups from '../admin/AdminGroups'
import AdminUsers from '../admin/AdminUsers'
import TeacherStudents from './TeacherStudents'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

function NotificationBell({ userId }) {
  const [notes, setNotes]   = useState([])
  const [open, setOpen]     = useState(false)
  const panelRef            = useRef(null)

  useEffect(() => {
    if (!userId) return
    load()
    const interval = setInterval(load, 60000)
    return () => clearInterval(interval)
  }, [userId])

  async function load() {
    const { data } = await supabase
      .from('notifications')
      .select('id, message, read, created_at')
      .order('created_at', { ascending: false })
      .limit(30)
    setNotes(data || [])
  }

  async function markAllRead() {
    const ids = notes.filter(n => !n.read).map(n => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read: true }).in('id', ids)
    setNotes(prev => prev.map(n => ({ ...n, read: true })))
  }

  async function dismiss(id) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  function toggleOpen() {
    setOpen(o => {
      if (!o) setTimeout(markAllRead, 800)
      return !o
    })
  }

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const unread = notes.filter(n => !n.read).length

  function timeAgo(ts) {
    const diff = Math.floor((Date.now() - new Date(ts)) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff}m ago`
    const h = Math.floor(diff / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <div ref={panelRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <button onClick={toggleOpen} title="Notifications"
        style={{ position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
          padding: '8px 10px', borderRadius: 8, display: 'flex', alignItems: 'center',
          color: open ? 'var(--primary)' : 'var(--muted)', transition: 'color .15s' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%',
            background: '#ef4444', color: 'white', fontSize: '10px', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 320, maxHeight: 400,
          background: 'white', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: '0 8px 30px rgba(0,0,0,.14)', zIndex: 300, overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
            fontWeight: 700, fontSize: '.85rem', color: 'var(--text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Notifications
            {notes.length > 0 && (
              <button onClick={() => Promise.all(notes.map(n => supabase.from('notifications').delete().eq('id', n.id))).then(() => setNotes([]))}
                style={{ fontSize: '.72rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}>
                Clear all
              </button>
            )}
          </div>
          {notes.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '.83rem' }}>
              No notifications
            </div>
          ) : (
            notes.map(n => (
              <div key={n.id} style={{ padding: '11px 14px', borderBottom: '1px solid #f1f5f9',
                background: n.read ? 'white' : '#f0f4ff', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.83rem', color: 'var(--text)', lineHeight: 1.4, fontWeight: n.read ? 400 : 600 }}>
                    {n.message}
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 3 }}>
                    {timeAgo(n.created_at)}
                  </div>
                </div>
                <button onClick={() => dismiss(n.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1',
                    fontSize: '1rem', lineHeight: 1, padding: '2px 4px', flexShrink: 0 }}>
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function TeacherLayout() {
  const [tab, setTab] = useState('register')
  const { hasRole, profile: myProfile } = useAuth()

  const isAdmin     = hasRole('admin')
  const isRegistrar = hasRole('registrar') || isAdmin
  const isAdminView = hasRole('adminView')

  // readOnly for each section: full role overrides adminView
  const adminReadOnly = isAdminView && !isRegistrar
  const usersReadOnly = isAdminView && !isAdmin

  const showAdminTabs = isRegistrar || isAdminView
  const showUserTab   = isAdmin

  const tabs = [
    { id: 'register',    label: 'Daily Register' },
    { id: 'reports',     label: 'Reports'        },
    { id: 'mystudents',  label: 'My Students'    },
    ...(showAdminTabs ? [{ id: 'applications', label: 'Applications' }] : []),
    ...(showAdminTabs ? [{ id: 'students',     label: 'All Students' }] : []),
    ...(showAdminTabs ? [{ id: 'groups',       label: 'Groups'       }] : []),
    ...(showUserTab   ? [{ id: 'users',        label: 'Teachers'     }] : []),
    { id: 'message', label: 'Message Admin' },
  ]

  return (
    <div>
      <Topbar title="Akaal Sahai Southall" />
      {isAdminView && !isAdmin && !isRegistrar && (
        <div style={{ background: '#fef3c7', borderBottom: '2px solid #f59e0b', padding: '6px 20px',
          fontSize: '.8rem', fontWeight: 600, color: '#92400e', textAlign: 'center' }}>
          Admin View
        </div>
      )}
      <div className="nav-tabs" style={{ alignItems: 'center' }}>
        {tabs.map(t => {
          const isMessage = t.id === 'message'
          const isActive  = tab === t.id
          return (
            <button key={t.id}
              className={`nav-tab ${isActive ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
              style={isMessage ? {
                marginLeft:   8,
                borderLeft:   '2px solid #f59e0b',
                color:        isActive ? '#92400e' : '#b45309',
                background:   isActive ? '#fef3c7' : '#fffbeb',
                borderBottom: isActive ? '3px solid #f59e0b' : '3px solid transparent',
                borderRadius: '0 6px 0 0',
                padding:      '10px 14px',
              } : undefined}>
              {isMessage ? '✉ ' : ''}{t.label}
            </button>
          )
        })}
        <div style={{ marginLeft: 'auto', paddingRight: 4 }}>
          <NotificationBell userId={myProfile?.id} />
        </div>
      </div>
      <div className="content">
        {tab === 'register'     && <TeacherRegister />}
        {tab === 'reports'      && <TeacherReports />}
        {tab === 'mystudents'   && <TeacherStudents />}
        {tab === 'applications' && <AdminApplications readOnly={adminReadOnly} />}
        {tab === 'students'     && <AdminStudents readOnly={adminReadOnly} />}
        {tab === 'groups'       && <AdminGroups readOnly={adminReadOnly} />}
        {tab === 'users'        && <AdminUsers readOnly={usersReadOnly} />}
        {tab === 'message'      && <TeacherMessage />}
      </div>
    </div>
  )
}
