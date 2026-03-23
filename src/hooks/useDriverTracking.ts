import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useGeolocation } from './useGeolocation'

const SYNC_INTERVAL_MS = 5000

interface RoutePoint {
  lat: number
  lng: number
  recorded_at: string
}

export function useDriverTracking() {
  const { user } = useAuth()
  const geo = useGeolocation()
  const [activeTripId, setActiveTripId] = useState<string | null>(null)
  const [isDriving, setIsDriving] = useState(false)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([])
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const latRef = useRef<number | null>(null)
  const lngRef = useRef<number | null>(null)

  // Keep refs in sync with geo state
  useEffect(() => {
    latRef.current = geo.latitude
    lngRef.current = geo.longitude
  }, [geo.latitude, geo.longitude])

  // Check for existing active trip on mount
  useEffect(() => {
    if (!user) return
    supabase
      .from('trips')
      .select('*')
      .eq('driver_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setActiveTripId(data.id)
          setIsDriving(true)
          setStartedAt(new Date(data.started_at))
          geo.startTracking()
          startSyncInterval(data.id)
          // Load existing route points
          supabase
            .from('route_points')
            .select('lat, lng, recorded_at')
            .eq('trip_id', data.id)
            .order('recorded_at', { ascending: true })
            .then(({ data: points }) => {
              if (points) setRoutePoints(points)
            })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const startSyncInterval = useCallback(
    (tripId: string) => {
      if (intervalRef.current) clearInterval(intervalRef.current)

      intervalRef.current = setInterval(async () => {
        const lat = latRef.current
        const lng = lngRef.current
        if (!lat || !lng || !user) return

        const now = new Date().toISOString()

        // Update driver position
        await supabase.from('drivers').update({
          current_lat: lat,
          current_lng: lng,
          last_seen_at: now,
          updated_at: now,
        }).eq('id', user.id)

        // Insert route point
        await supabase.from('route_points').insert({
          trip_id: tripId,
          lat,
          lng,
          recorded_at: now,
        })

        setRoutePoints((prev) => [...prev, { lat, lng, recorded_at: now }])
      }, SYNC_INTERVAL_MS)
    },
    [user]
  )

  const startTrip = useCallback(
    async (destinationName: string) => {
      if (!user) return

      geo.startTracking()

      // Wait briefly for first position
      await new Promise((r) => setTimeout(r, 1000))

      const { data: trip, error } = await supabase
        .from('trips')
        .insert({
          driver_id: user.id,
          destination_name: destinationName,
          status: 'active',
        })
        .select()
        .single()

      if (error || !trip) {
        console.error('Error creating trip:', error)
        return
      }

      // Update driver status
      await supabase.from('drivers').update({
        status: 'driving',
        destination_name: destinationName,
        current_lat: latRef.current,
        current_lng: lngRef.current,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', user.id)

      setActiveTripId(trip.id)
      setIsDriving(true)
      setStartedAt(new Date())
      setRoutePoints([])
      startSyncInterval(trip.id)
    },
    [user, geo, startSyncInterval]
  )

  const stopTrip = useCallback(async () => {
    if (!user || !activeTripId) return

    // Stop interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    geo.stopTracking()

    // End trip
    await supabase.from('trips').update({
      status: 'completed',
      ended_at: new Date().toISOString(),
    }).eq('id', activeTripId)

    // Reset driver status
    await supabase.from('drivers').update({
      status: 'stopped',
      destination_name: null,
      updated_at: new Date().toISOString(),
    }).eq('id', user.id)

    setActiveTripId(null)
    setIsDriving(false)
    setStartedAt(null)
    setRoutePoints([])
  }, [user, activeTripId, geo])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  return {
    isDriving,
    activeTripId,
    routePoints,
    startedAt,
    latitude: geo.latitude,
    longitude: geo.longitude,
    accuracy: geo.accuracy,
    geoError: geo.error,
    startTrip,
    stopTrip,
  }
}
