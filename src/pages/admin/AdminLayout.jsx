import { useState } from 'react'
import Topbar from '../../components/Topbar'
import AdminDashboard from './AdminDashboard'
import AdminApplications from './AdminApplications'
import AdminStudents from './AdminStudents'
import AdminUsers from './AdminUsers'
import AdminGroups from './AdminGroups'
import AdminImport from './AdminImport'
import { useAuth } from '../../hooks/useAuth'

const TABS = [
  { id: 'dashboard',    label: 'Dashboard'    },
  { id: 'applications', label: 'Applications' },
  { id: 'students',     label: 'Students'     },
  { id: 'groups',       label: 'Groups'       },
  { id: 'users',        label: 'Teachers'     },
  { id: 'import',       label: 'Import Data'  },
]

export default function AdminLayout() {
  const [tab, setTab]   = useState('dashboard')
  const { profile }     = useAuth()
  const readOnly        = profile?.role === 'adminView'

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
      </div>
    </div>
  )
}
