import { lazy, Suspense } from 'react'
import { Analytics } from '@vercel/analytics/react'
import { AuthProvider, useAuth } from './contexts/AuthContext'

const LoginPage = lazy(() => import('./components/LoginPage'))
const DashboardCMDB = lazy(() => import('./components/DashboardCMDB'))

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      {!user ? <LoginPage /> : <DashboardCMDB />}
    </Suspense>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Analytics />
    </AuthProvider>
  )
}
