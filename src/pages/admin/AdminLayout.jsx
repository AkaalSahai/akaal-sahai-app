import { useState, useEffect } from 'react'
import Topbar from '../../components/Topbar'
import AdminDashboard from './AdminDashboard'
import AdminApplications from './AdminApplications'
import AdminStudents from './AdminStudents'
import AdminUsers from './AdminUsers'
import AdminGroups from './AdminGroups'
import AdminClasses from './AdminClasses'
import AdminImport from './AdminImport'
import TeacherRegister from '../teacher/TeacherRegister'
import TeacherReports from '../teacher/TeacherReports'
import TeacherStudents from '../teacher/TeacherStudents'
import AdminActivity from './AdminActivity'
import AdminArchive from './AdminArchive'
import AdminMessages from './AdminMessages'
import AdminSettings from './AdminSettings'
import AdminRegisterStatus from './AdminRegisterStatus'
import AdminTeacherRegister from './AdminTeacherRegister'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function AdminLayout() {
  const [tab, setTab]   = useState('dashboard')
  const { hasRole } = useAuth()
  // hasRole() checks primary role OR extra_roles, so this correctly covers
  // someone who reaches /admin via adminView as an EXTRA role (e.g. a
  // teacher who's also a trustee) - not just adminView as their primary
  // role. Checking profile.role alone would wrongly give such a person
  // full write access instead of the read-only view they were granted.
  const isFullAdmin     = hasRole('admin')
  const readOnly        = !isFullAdmin
  const isTeacher       = hasRole('teacher')
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    let mounted = true
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count }) => { if (mounted) setUnread(count || 0) })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  const TABS = [
    { id: 'dashboard',    label: 'Dashboard'    },
    { id: 'applications', label: 'Applications' },
    { id: 'students',     label: 'Students'     },
    { id: 'groups',       label: 'Groups'       },
    { id: 'classes',      label: 'Classes'      },
    ...(!readOnly ? [{ id: 'users', label: 'Teachers' }] : []),
    ...(isTeacher ? [{ id: 'register',    label: 'My Register'  }] : []),
    ...(isTeacher ? [{ id: 'myreports',   label: 'My Reports'   }] : []),
    ...(isTeacher ? [{ id: 'mystudents',  label: 'My Students'  }] : []),
    ...(!readOnly ? [{ id: 'registerstatus',  label: 'Register Status'  }] : []),
    ...(!readOnly ? [{ id: 'teacherregister', label: 'Teacher Register' }] : []),
    ...(!readOnly  ? [{ id: 'import',   label: 'Import Data' }] : []),
    ...(isFullAdmin ? [{ id: 'activity', label: 'Activity'    }] : []),
    ...(isFullAdmin ? [{ id: 'archive',  label: 'Archive'     }] : []),
    ...(!readOnly ? [{ id: 'messages', label: unread > 0 ? `Messages (${unread})` : 'Messages' }] : []),
    ...(isFullAdmin ? [{ id: 'settings', label: 'Settings'    }] : []),
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
        {tab === 'classes'      && <AdminClasses readOnly={readOnly} />}
        {tab === 'users'        && !readOnly && <AdminUsers readOnly={readOnly} />}
        {tab === 'import'       && <AdminImport readOnly={readOnly} />}
        {tab === 'register'     && <TeacherRegister />}
        {tab === 'myreports'    && <TeacherReports />}
        {tab === 'mystudents'   && <TeacherStudents />}
        {tab === 'registerstatus'  && !readOnly && <AdminRegisterStatus />}
        {tab === 'teacherregister' && !readOnly && <AdminTeacherRegister readOnly={readOnly} />}
        {tab === 'activity'     && isFullAdmin && <AdminActivity />}
        {tab === 'archive'      && isFullAdmin && <AdminArchive />}
        {tab === 'messages'     && !readOnly && <AdminMessages onRead={() => setUnread(c => Math.max(0, c - 1))} />}
        {tab === 'settings'     && isFullAdmin && <AdminSettings />}
      </div>
    </div>
  )
}
