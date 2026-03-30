import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { RoleRedirect } from './components/auth/RoleRedirect'
import { LoginPage } from './pages/LoginPage'
import { DriverPage } from './pages/DriverPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'
import { TripHistoryPage } from './pages/TripHistoryPage'
import { DemoPage } from './pages/DemoPage'
import { RouteOptimizerPage } from './pages/RouteOptimizerPage'
import { useAuth } from './contexts/AuthContext'

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  if (!isAdmin) return <Navigate to="/driver" replace />
  return <>{children}</>
}

function DriverRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading } = useAuth()
  if (loading) return null
  if (isAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/demo" element={<DemoPage />} />
          <Route path="/optimizar" element={<RouteOptimizerPage />} />
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/driver"
            element={
              <ProtectedRoute>
                <DriverRoute>
                  <DriverPage />
                </DriverRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <AdminDashboardPage />
                </AdminRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/trips"
            element={
              <ProtectedRoute>
                <AdminRoute>
                  <TripHistoryPage />
                </AdminRoute>
              </ProtectedRoute>
            }
          />

          <Route
            path="/"
            element={
              <ProtectedRoute>
                <RoleRedirect />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
