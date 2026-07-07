import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Topbar from '../../components/Topbar'
import TeacherRegister from './TeacherRegister'

export default function TeacherLayout() {
  const [tab, setTab] = useState('register')

  return (
    <div>
      <Topbar title="Akaal Sahai Southall" />
      <div className="nav-tabs">
        <button className={`nav-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>
          Daily Register
        </button>
      </div>
      <div className="content">
        <TeacherRegister />
      </div>
    </div>
  )
}
