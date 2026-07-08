import { useState } from 'react'
import Topbar from '../../components/Topbar'
import TeacherRegister from './TeacherRegister'
import TeacherReports from './TeacherReports'
import AdminApplications from '../admin/AdminApplications'
import AdminStudents from '../admin/AdminStudents'
import AdminGroups from '../admin/AdminGroups'
import AdminUsers from '../admin/AdminUsers'
import TeacherStudents from './TeacherStudents'
import { useAuth } from '../../hooks/useAuth'

export default function TeacherLayout() {
  const [tab, setTab] = useState('register')
  const { hasRole }   = useAuth()

  const isAdmin     = hasRole('admin')
  const isRegistrar = hasRole('registrar') || isAdmin

  const tabs = [
    { id: 'register',    label: 'Daily Register' },
    { id: 'reports',     label: 'Reports'        },
    { id: 'mystudents',  label: 'My Students'    },
    ...(isRegistrar ? [{ id: 'applications', label: 'Applications' }] : []),
    ...(isRegistrar ? [{ id: 'students',     label: 'All Students' }] : []),
    ...(isRegistrar ? [{ id: 'groups',       label: 'Groups'       }] : []),
    ...(isAdmin     ? [{ id: 'users',        label: 'Teachers'     }] : []),
  ]

  return (
    <div>
      <Topbar title="Akaal Sahai Southall" />
      <div className="nav-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`nav-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="content">
        {tab === 'register'    && <TeacherRegister />}
        {tab === 'reports'     && <TeacherReports />}
        {tab === 'mystudents'  && <TeacherStudents />}
        {tab === 'applications'&& <AdminApplications />}
        {tab === 'students'    && <AdminStudents />}
        {tab === 'groups'      && <AdminGroups />}
        {tab === 'users'       && <AdminUsers />}
      </div>
    </div>
  )
}
