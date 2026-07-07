import { useState } from 'react'
import Topbar from '../../components/Topbar'
import TeacherRegister from './TeacherRegister'
import TeacherReports from './TeacherReports'
import AdminApplications from '../admin/AdminApplications'
import AdminStudents from '../admin/AdminStudents'
import AdminGroups from '../admin/AdminGroups'
import { useAuth } from '../../hooks/useAuth'

export default function TeacherLayout() {
  const [tab, setTab]   = useState('register')
  const { hasRole }     = useAuth()

  const canManageApps   = hasRole('registrar') || hasRole('admin')
  const canManageSystem = hasRole('admin')

  const tabs = [
    { id: 'register',     label: 'Daily Register' },
    { id: 'reports',      label: 'Reports' },
    ...(canManageApps   ? [{ id: 'applications', label: 'Applications' }] : []),
    ...(canManageSystem ? [{ id: 'students',     label: 'Students'     }] : []),
    ...(canManageSystem ? [{ id: 'groups',       label: 'Groups'       }] : []),
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
        {tab === 'register'     && <TeacherRegister />}
        {tab === 'reports'      && <TeacherReports />}
        {tab === 'applications' && <AdminApplications />}
        {tab === 'students'     && <AdminStudents />}
        {tab === 'groups'       && <AdminGroups />}
      </div>
    </div>
  )
}
