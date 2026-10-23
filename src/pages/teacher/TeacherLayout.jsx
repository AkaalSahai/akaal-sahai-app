import { useState } from 'react'
import Topbar from '../../components/Topbar'
import TeacherRegister from './TeacherRegister'
import TeacherReports from './TeacherReports'
import TeacherMessage from './TeacherMessage'
import AdminApplications from '../admin/AdminApplications'
import AdminStudents from '../admin/AdminStudents'
import AdminGroups from '../admin/AdminGroups'
import AdminUsers from '../admin/AdminUsers'
import AdminTeacherRegister from '../admin/AdminTeacherRegister'
import TeacherStudents from './TeacherStudents'
import { useAuth } from '../../hooks/useAuth'
import BroadcastBanner from '../../components/BroadcastBanner'
import NotificationBell from '../../components/NotificationBell'

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
  const canManageTeacherRegister = !!myProfile?.can_manage_teacher_register

  const tabs = [
    { id: 'register',    label: 'Daily Register' },
    { id: 'reports',     label: 'Reports'        },
    { id: 'mystudents',  label: 'My Students'    },
    ...(showAdminTabs ? [{ id: 'applications', label: 'Applications' }] : []),
    ...(showAdminTabs ? [{ id: 'students',     label: 'All Students' }] : []),
    ...(showAdminTabs ? [{ id: 'groups',       label: 'Groups'       }] : []),
    ...(showUserTab   ? [{ id: 'users',        label: 'Teachers'     }] : []),
    ...(canManageTeacherRegister ? [{ id: 'teacherregister', label: 'Teacher Register' }] : []),
    { id: 'message', label: 'Message Admin' },
  ]

  return (
    <div>
      <Topbar title="Akaal Sahai Southall" onLogoClick={() => setTab('register')} />
      {isAdminView && !isAdmin && !isRegistrar && (
        <div style={{ background: '#fef3c7', borderBottom: '2px solid #f59e0b', padding: '6px 20px',
          fontSize: '.8rem', fontWeight: 600, color: '#92400e', textAlign: 'center' }}>
          Admin View
        </div>
      )}
      <div className="nav-tabs nav-tabs-main" style={{ alignItems: 'center' }}>
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
      <BroadcastBanner />
      <div className="content">
        {tab === 'register'     && <TeacherRegister />}
        {tab === 'reports'      && <TeacherReports />}
        {tab === 'mystudents'   && <TeacherStudents />}
        {tab === 'applications' && <AdminApplications readOnly={adminReadOnly} />}
        {tab === 'students'     && <AdminStudents readOnly={adminReadOnly} />}
        {tab === 'groups'       && <AdminGroups readOnly={adminReadOnly} />}
        {tab === 'users'        && <AdminUsers readOnly={usersReadOnly} />}
        {tab === 'teacherregister' && <AdminTeacherRegister />}
        {tab === 'message'      && <TeacherMessage />}
      </div>
    </div>
  )
}
