import { useState } from 'react'
import Topbar from '../../components/Topbar'
import AdminDashboard from '../admin/AdminDashboard'
import AdminApplications from '../admin/AdminApplications'
import AdminStudents from '../admin/AdminStudents'
import AdminGroups from '../admin/AdminGroups'

const TABS = [
  { id: 'dashboard',    label: 'Dashboard' },
  { id: 'applications', label: 'Applications' },
  { id: 'students',     label: 'Students' },
  { id: 'groups',       label: 'Groups' },
]

export default function RegistrarLayout() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div>
      <Topbar title="Registrar — Akaal Sahai Southall" />
      <div className="nav-tabs">
        {TABS.map(t => (
          <button key={t.id} className={`nav-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="content">
        {tab === 'dashboard'    && <AdminDashboard />}
        {tab === 'applications' && <AdminApplications />}
        {tab === 'students'     && <AdminStudents />}
        {tab === 'groups'       && <AdminGroups />}
      </div>
    </div>
  )
}
