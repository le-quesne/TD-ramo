import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { Driver, Profile } from '../lib/database.types'

export interface DriverWithProfile extends Driver {
  profile: Pick<Profile, 'full_name' | 'email'>
}

export function useRealtimeDrivers() {
  const { user } = useAuth()
  const [drivers, setDrivers] = useState<DriverWithProfile[]>([])
  const [loading, setLoading] = useState(true)

  // Initial fetch - RLS already filters by admin_id
  useEffect(() => {
    const fetchDrivers = async () => {
      const { data, error } = await supabase
        .from('drivers')
        .select('*, profile:profiles!inner(full_name, email)')

      if (error) {
        console.error('Error fetching drivers:', error)
        setLoading(false)
        return
      }

      const mapped = ((data ?? []) as Record<string, unknown>[]).map((d) => ({
        ...d,
        profile: Array.isArray(d.profile) ? d.profile[0] : d.profile,
      })) as DriverWithProfile[]

      setDrivers(mapped)
      setLoading(false)
    }

    fetchDrivers()
  }, [])

  // Realtime subscription - filter by admin_id on client side
  useEffect(() => {
    const channel = supabase
      .channel('drivers-realtime')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'drivers',
        },
        (payload) => {
          const updated = payload.new as Driver
          // Only process updates for drivers that belong to this admin
          if (user && updated.admin_id === user.id) {
            setDrivers((prev) =>
              prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d))
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  return { drivers, loading }
}
