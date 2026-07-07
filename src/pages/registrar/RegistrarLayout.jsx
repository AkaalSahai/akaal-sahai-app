import { useState } from 'react'
import Topbar from '../../components/Topbar'
import AdminDashboard from '../admin/AdminDashboard'
import AdminApplications from '../admin/AdminApplications'
import AdminStudents from '../admin/AdminStudents'
import AdminGroups from '../admin/AdminGroups'
import TeacherRegister from '../teacher/TeacherRegister'
import TeacherReports from '../teacher/TeacherReports'
import { useAuth } from '../../hooks/useAuth'

export default function RegistrarLayout() {
  const [tab, setTab] = useState('dashboard')
  const { hasRole }   = useAuth()
  const isTeacher     = hasRole('teacher')

  const tabs = [
    { id: 'dashboard',    label: 'Dashboard'    },
    { id: 'applications', label: 'Applications' },
    { id: 'students',     label: 'Students'     },
    { id: 'groups',       label: 'Groups'       },
    ...(isTeacher ? [{ id: 'register', label: 'My Register' }] : []),
    ...(isTeacher ? [{ id: 'reports',  label: 'My Reports'  }] : []),
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
        {tab === 'register'     && <TeacherRegister />}
        {tab === 'reports'      && <TeacherReports />}
      </div>
    </div>
  )
}
