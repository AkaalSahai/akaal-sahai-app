import { useState, useEffect } from 'react'
import Topbar from '../../components/Topbar'
import AdminDashboard from './AdminDashboard'
import AdminApplications from './AdminApplications'
import AdminStudents from './AdminStudents'
import AdminUsers from './AdminUsers'
import AdminGroups from './AdminGroups'
import AdminImport from './AdminImport'
import TeacherRegister from '../teacher/TeacherRegister'
import TeacherReports from '../teacher/TeacherReports'
import TeacherStudents from '../teacher/TeacherStudents'
import AdminActivity from './AdminActivity'
import AdminMessages from './AdminMessages'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function AdminLayout() {
  const [tab, setTab]   = useState('dashboard')
  const { profile, hasRole } = useAuth()
  const readOnly        = profile?.role === 'adminView'
  const isPrimaryAdmin  = profile?.role === 'admin'
  const isTeacher       = hasRole('teacher')
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count }) => setUnread(count || 0))
  }, [])

  const TABS = [
    { id: 'dashboard',    label: 'Dashboard'    },
    { id: 'applications', label: 'Applications' },
    { id: 'students',     label: 'Students'     },
    { id: 'groups',       label: 'Groups'       },
    { id: 'users',        label: 'Teachers'     },
    ...(isTeacher ? [{ id: 'register',    label: 'My Register'  }] : []),
    ...(isTeacher ? [{ id: 'myreports',   label: 'My Reports'   }] : []),
    ...(isTeacher ? [{ id: 'mystudents',  label: 'My Students'  }] : []),
    ...(!readOnly       ? [{ id: 'import',   label: 'Import Data' }] : []),
    ...(isPrimaryAdmin  ? [{ id: 'activity', label: 'Activity'    }] : []),
    { id: 'messages', label: unread > 0 ? `Messages (${unread})` : 'Messages' },
  ]

  return (
    <div>
      <Topbar title="Admin — Akaal Sahai Southall" />
      {readOnly && (
        <div style={{ background: '#fef3c7', borderBottom: '2px solid #f59e0b', padding: '6px 20px',
          fontSize: '.8rem', fontWeight: 600, color: '#92400e', textAlign: 'center' }}>
          View Only — you can see all data but cannot make changes
        </div>
      )}
      <div className="nav-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`nav-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="content">
        {tab === 'dashboard'    && <AdminDashboard setTab={setTab} />}
        {tab === 'applications' && <AdminApplications readOnly={readOnly} />}
        {tab === 'students'     && <AdminStudents readOnly={readOnly} />}
        {tab === 'groups'       && <AdminGroups readOnly={readOnly} />}
        {tab === 'users'        && <AdminUsers readOnly={readOnly} />}
        {tab === 'import'       && <AdminImport readOnly={readOnly} />}
        {tab === 'register'     && <TeacherRegister />}
        {tab === 'myreports'    && <TeacherReports />}
        {tab === 'mystudents'   && <TeacherStudents />}
        {tab === 'activity'     && <AdminActivity />}
        {tab === 'messages'     && <AdminMessages onRead={() => setUnread(c => Math.max(0, c - 1))} />}
      </div>
    </div>
  )
}
