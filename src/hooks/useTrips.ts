import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Trip, RoutePoint } from '../lib/database.types'

export interface TripWithDriver extends Trip {
  driver: { full_name: string; email: string }
}

export function useTrips() {
  const [trips, setTrips] = useState<TripWithDriver[]>([])
  const [loading, setLoading] = useState(true)

  // RLS already filters: admin only sees trips from their drivers
  useEffect(() => {
    const fetchTrips = async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*, driver:profiles!inner(full_name, email)')
        .order('started_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('Error fetching trips:', error)
        setLoading(false)
        return
      }

      const mapped = ((data ?? []) as Record<string, unknown>[]).map((t) => ({
        ...t,
        driver: Array.isArray(t.driver) ? t.driver[0] : t.driver,
      })) as TripWithDriver[]

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

    return data ?? []
  }, [])

  return { trips, loading, fetchRoutePoints }
}
