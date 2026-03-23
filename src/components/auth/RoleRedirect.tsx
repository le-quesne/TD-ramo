import { Navigate } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { Loader2 } from 'lucide-react'

export function RoleRedirect() {
  const { profile, loading, user } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (profile?.role === 'admin') return <Navigate to="/dashboard" replace />
  return <Navigate to="/driver" replace />
}
