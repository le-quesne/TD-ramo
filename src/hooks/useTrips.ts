import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Trip, RoutePoint } from '../lib/database.types'

export interface TripWithDriver extends Trip {
  driver: { full_name: string; email: string }
}

export function useTrips() {
  const [trips, setTrips] = useState<TripWithDriver[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTrips = async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*, driver_record:drivers!inner(profile:profiles!drivers_id_fkey(full_name, email))')
        .order('started_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching trips:', error)
        setLoading(false)
        return
      }

      const mapped = ((data ?? []) as Record<string, unknown>[]).map((t) => {
        const rec = t.driver_record as Record<string, unknown> | Record<string, unknown>[]
        const driverRec = Array.isArray(rec) ? rec[0] : rec
        const profile = driverRec?.profile as Record<string, unknown> | Record<string, unknown>[]
        const driverProfile = Array.isArray(profile) ? profile[0] : profile
        return { ...t, driver_record: undefined, driver: driverProfile }
      }) as TripWithDriver[]

      setTrips(mapped)
      setLoading(false)
    }

    fetchTrips()
  }, [])

  const fetchRoutePoints = useCallback(async (tripId: string): Promise<RoutePoint[]> => {
    const { data, error } = await supabase
      .from('route_points')
      .select('*')
      .eq('trip_id', tripId)
      .order('recorded_at', { ascending: true })

    if (error) {
      console.error('Error fetching route points:', error)
      return []
    }

    return (data ?? []) as RoutePoint[]
  }, [])

  return { trips, loading, fetchRoutePoints }
}
