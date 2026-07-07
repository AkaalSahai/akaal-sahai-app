import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'

// Public pages
import LoginPage from './pages/LoginPage'
import StudentRegistration from './pages/public/StudentRegistration'
import TeacherRegistration from './pages/public/TeacherRegistration'
import ResetPassword from './pages/ResetPassword'

// Layouts
import AdminLayout from './pages/admin/AdminLayout'
import RegistrarLayout from './pages/registrar/RegistrarLayout'
import TeacherLayout from './pages/teacher/TeacherLayout'

function RequireAuth({ role, children }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="spinner" style={{ marginTop: 100 }} />
  if (!user || !profile) return <Navigate to="/login" replace />
  if (role && profile.role !== role && !(Array.isArray(role) && role.includes(profile.role)))
    return <Navigate to="/login" replace />
  return children
}

function RootRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="spinner" style={{ marginTop: 100 }} />
  if (!user || !profile) return <Navigate to="/login" replace />
  if (profile.role === 'admin')     return <Navigate to="/admin" replace />
  if (profile.role === 'registrar') return <Navigate to="/registrar" replace />
  if (profile.role === 'teacher')   return <Navigate to="/teacher" replace />
  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register/student" element={<StudentRegistration />} />
      <Route path="/register/teacher" element={<TeacherRegistration />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/admin/*" element={
        <RequireAuth role="admin"><AdminLayout /></RequireAuth>
      } />
      <Route path="/registrar/*" element={
        <RequireAuth role="registrar"><RegistrarLayout /></RequireAuth>
      } />
      <Route path="/teacher/*" element={
        <RequireAuth role="teacher"><TeacherLayout /></RequireAuth>
      } />

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
