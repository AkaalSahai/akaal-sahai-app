import { useState } from 'react'
import Topbar from '../../components/Topbar'
import AdminDashboard from './AdminDashboard'
import AdminApplications from './AdminApplications'
import AdminStudents from './AdminStudents'
import AdminUsers from './AdminUsers'
import AdminGroups from './AdminGroups'
import AdminImport from './AdminImport'

const TABS = [
  { id: 'dashboard',     label: 'Dashboard' },
  { id: 'applications',  label: 'Applications' },
  { id: 'students',      label: 'Students' },
  { id: 'groups',        label: 'Groups' },
  { id: 'users',         label: 'Teachers' },
  { id: 'import',        label: 'Import Data' },
]

export default function AdminLayout() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div>
      <Topbar title="Admin — Akaal Sahai Southall" />
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
        {tab === 'users'        && <AdminUsers />}
        {tab === 'import'       && <AdminImport />}
      </div>
    </div>
  )
}
