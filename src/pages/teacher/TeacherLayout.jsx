import { useState } from 'react'
import Topbar from '../../components/Topbar'
import TeacherRegister from './TeacherRegister'
import TeacherReports from './TeacherReports'

export default function TeacherLayout() {
  const [tab, setTab] = useState('register')

  return (
    <div>
      <Topbar title="Akaal Sahai Southall" />
      <div className="nav-tabs">
        <button className={`nav-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>
          Daily Register
        </button>
        <button className={`nav-tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>
          Reports
        </button>
      </div>
      <div className="content">
        {tab === 'register' && <TeacherRegister />}
        {tab === 'reports'  && <TeacherReports />}
      </div>
    </div>
  )
}
