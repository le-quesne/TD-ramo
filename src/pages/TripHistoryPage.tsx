import { useState, useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useTrips, type TripWithDriver } from '../hooks/useTrips'
import { useAuth } from '../contexts/AuthContext'
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/mapbox'
import { Clock, MapPin, ArrowLeft, LogOut, Truck, History } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { RoutePoint } from '../lib/database.types'

mapboxgl.accessToken = MAPBOX_TOKEN

export function TripHistoryPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { trips, loading, fetchRoutePoints } = useTrips()
  const [selectedTrip, setSelectedTrip] = useState<TripWithDriver | null>(null)
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([])
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Draw route when selected trip changes
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    if (map.getLayer('trip-route')) map.removeLayer('trip-route')
    if (map.getSource('trip-route')) map.removeSource('trip-route')

    if (routePoints.length < 2) return

    const coordinates = routePoints.map((p) => [p.lng, p.lat] as [number, number])

    map.addSource('trip-route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates },
      },
    })

    map.addLayer({
      id: 'trip-route',
      type: 'line',
      source: 'trip-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.8 },
    })

    // Fit bounds to route
    const bounds = coordinates.reduce(
      (b, coord) => b.extend(coord as [number, number]),
      new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
    )
    map.fitBounds(bounds, { padding: 60, duration: 1000 })
  }, [routePoints])

  const handleSelectTrip = async (trip: TripWithDriver) => {
    setSelectedTrip(trip)
    const points = await fetchRoutePoints(trip.id)
    setRoutePoints(points)
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-CL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDuration = (start: string, end: string | null) => {
    if (!end) return 'En curso'
    const diff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000)
    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    return h > 0 ? `${h}h ${m}min` : `${m}min`
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Truck className="w-6 h-6 text-blue-700" />
          <h1 className="text-lg font-bold text-gray-900">Historial de Viajes</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{profile?.full_name}</span>
          <button onClick={signOut} className="text-gray-400 hover:text-gray-600">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Trip list */}
        <aside className="w-96 bg-white border-r border-gray-200 flex flex-col shrink-0 z-10">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <History className="w-4 h-4" />
              Viajes recientes
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-400 text-sm">Cargando...</div>
            ) : trips.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">No hay viajes registrados</div>
            ) : (
              trips.map((trip) => (
                <button
                  key={trip.id}
                  onClick={() => handleSelectTrip(trip)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    selectedTrip?.id === trip.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 text-sm">
                      {trip.driver.full_name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        trip.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {trip.status === 'active' ? 'Activo' : 'Completado'}
                    </span>
                  </div>
                  {trip.destination_name && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <MapPin className="w-3 h-3" />
                      {trip.destination_name}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(trip.started_at)}
                    </span>
                    <span>{formatDuration(trip.started_at, trip.ended_at)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="absolute inset-0" />
          {!selectedTrip && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-50/50 pointer-events-none">
              <p className="text-gray-400 text-sm">Selecciona un viaje para ver su recorrido</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
