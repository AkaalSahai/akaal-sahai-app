import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import { AuthProvider } from './components/AuthProvider'
import OfflineBanner from './components/OfflineBanner'
import InstallPrompt from './components/InstallPrompt'
import MfaChallenge from './components/MfaChallenge'
import MfaRequiredSetup from './components/MfaRequiredSetup'

// Each page is loaded only when it's opened, so the parent sign-up form and
// the projector no longer download the whole admin app first (it was one
// 1.1 MB file - Batch C, 27-11-2026). The app's offline cache still keeps
// every piece once it's installed.
// Public pages
const LoginPage           = lazy(() => import('./pages/LoginPage'))
const StudentRegistration = lazy(() => import('./pages/public/StudentRegistration'))
const TeacherRegistration = lazy(() => import('./pages/public/TeacherRegistration'))
const ResetPassword       = lazy(() => import('./pages/ResetPassword'))

// Layouts
const AdminLayout        = lazy(() => import('./pages/admin/AdminLayout'))
const RegistrarLayout    = lazy(() => import('./pages/registrar/RegistrarLayout'))
const TeacherLayout      = lazy(() => import('./pages/teacher/TeacherLayout'))
const ProjectorDashboard = lazy(() => import('./pages/projector/ProjectorDashboard'))

// A profile matches an allowed role if it's their primary role OR one of
// their extra_roles — same rule as hasRole() elsewhere in the app, so e.g.
// a teacher who's also been given "adminView" as an extra role can reach
// /admin (read-only) without it replacing their normal /teacher access.
function matchesRole(profile, role) {
  const allowed = Array.isArray(role) ? role : [role]
  return allowed.some(r => profile.role === r || (profile.extra_roles || []).includes(r))
}

function RequireAuth({ role, allowProjectorManager, children }) {
  const { user, profile, loading, mfaKnown, mfaChallengePending, mfaEnrollmentRequired } = useAuth()
  if (loading) return <div className="spinner" style={{ marginTop: 100 }} />
  if (!user || !profile) return <Navigate to="/login" replace />
  // Don't show any page until we know whether the 2-step code is still needed
  if (!mfaKnown) return <div className="spinner" style={{ marginTop: 100 }} />
  // A verified authenticator is enrolled but hasn't been cleared this
  // session yet - password sign-in alone only gets someone to aal1, and
  // nothing past this point should render until that's resolved.
  if (mfaChallengePending) return <MfaChallenge />
  // Admin has switched on requiring 2FA and this account hasn't enrolled a
  // factor at all yet - distinct from the challenge case above.
  if (mfaEnrollmentRequired) return <MfaRequiredSetup />
  // Projector Managers may open the projector screen to check their changes
  if (role && !matchesRole(profile, role) && !(allowProjectorManager && profile.can_manage_projector))
    return <Navigate to="/login" replace />
  return children
}

function RootRedirect() {
  const { user, profile, loading } = useAuth()
  if (loading) return <div className="spinner" style={{ marginTop: 100 }} />
  if (!user || !profile) return <Navigate to="/login" replace />
  if (profile.role === 'admin')     return <Navigate to="/admin" replace />
  if (profile.role === 'adminView') return <Navigate to="/admin" replace />
  if (profile.role === 'registrar') return <Navigate to="/registrar" replace />
  if (profile.role === 'teacher')   return <Navigate to="/teacher" replace />
  if (profile.role === 'dashboard') return <Navigate to="/projector" replace />
  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Suspense fallback={<div className="spinner" style={{ marginTop: 100 }} />}>
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register/student" element={<StudentRegistration />} />
      <Route path="/register/teacher" element={<TeacherRegistration />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route path="/admin/*" element={
        <RequireAuth role={['admin','adminView']}><AdminLayout /></RequireAuth>
      } />
      <Route path="/registrar/*" element={
        <RequireAuth role="registrar"><RegistrarLayout /></RequireAuth>
      } />
      <Route path="/teacher/*" element={
        <RequireAuth role="teacher"><TeacherLayout /></RequireAuth>
      } />
      <Route path="/projector" element={
        <RequireAuth role={['dashboard','admin']} allowProjectorManager><ProjectorDashboard /></RequireAuth>
      } />

      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OfflineBanner />
        <InstallPrompt />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
