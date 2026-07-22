import { useState, useEffect } from 'react'
import Topbar from '../../components/Topbar'
import AdminDashboard from '../admin/AdminDashboard'
import AdminApplications from '../admin/AdminApplications'
import AdminStudents from '../admin/AdminStudents'
import AdminGroups from '../admin/AdminGroups'
import AdminUsers from '../admin/AdminUsers'
import AdminMessages from '../admin/AdminMessages'
import TeacherRegister from '../teacher/TeacherRegister'
import TeacherReports from '../teacher/TeacherReports'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function RegistrarLayout() {
  const [tab, setTab] = useState('dashboard')
  const { hasRole }   = useAuth()
  const isTeacher     = hasRole('teacher')
  const isAdmin       = hasRole('admin')
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let mounted = true
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count }) => { if (mounted) setUnread(count || 0) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  const tabs = [
    { id: 'dashboard',    label: 'Dashboard'    },
    { id: 'applications', label: 'Applications' },
    { id: 'students',     label: 'Students'     },
    { id: 'groups',       label: 'Groups'       },
    ...(isAdmin   ? [{ id: 'users',     label: 'Teachers'    }] : []),
    ...(isTeacher ? [{ id: 'register',  label: 'My Register' }] : []),
    ...(isTeacher ? [{ id: 'reports',   label: 'My Reports'  }] : []),
    { id: 'messages', label: unread > 0 ? `Messages (${unread})` : 'Messages' },
  ]

  return (
    <div>
      <Topbar title="Registrar — Akaal Sahai Southall" />
      <div className="nav-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`nav-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="content">
        {tab === 'dashboard'    && <AdminDashboard setTab={setTab} />}
        {tab === 'applications' && <AdminApplications />}
        {tab === 'students'     && <AdminStudents />}
        {tab === 'groups'       && <AdminGroups />}
        {tab === 'users'        && <AdminUsers readOnly={true} />}
        {tab === 'register'     && <TeacherRegister />}
        {tab === 'reports'      && <TeacherReports />}
        {tab === 'messages'     && <AdminMessages onRead={() => setUnread(c => Math.max(0, c - 1))} />}
      </div>
    </div>
  )
}
