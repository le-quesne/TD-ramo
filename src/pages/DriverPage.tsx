import { useState, useEffect, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useDriverTracking } from '../hooks/useDriverTracking'
import { useAuth } from '../contexts/AuthContext'
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/mapbox'
import { Navigation, Square, MapPin, Clock, LogOut, AlertCircle } from 'lucide-react'

mapboxgl.accessToken = MAPBOX_TOKEN

export function DriverPage() {
  const { profile, signOut } = useAuth()
  const {
    isDriving,
    routePoints,
    startedAt,
    latitude,
    longitude,
    geoError,
    startTrip,
    stopTrip,
  } = useDriverTracking()

  const [destination, setDestination] = useState('')
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    })

    map.addControl(new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }))

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Update marker position
  useEffect(() => {
    if (!mapRef.current || !latitude || !longitude) return

    if (!markerRef.current) {
      const el = document.createElement('div')
      el.className = 'driver-marker'
      el.style.cssText = `
        width: 20px; height: 20px; border-radius: 50%;
        background: #2563eb; border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      `
      markerRef.current = new mapboxgl.Marker(el)
        .setLngLat([longitude, latitude])
        .addTo(mapRef.current)
    } else {
      markerRef.current.setLngLat([longitude, latitude])
    }

    mapRef.current.easeTo({
      center: [longitude, latitude],
      duration: 500,
    })
  }, [latitude, longitude])

  // Draw route polyline
  useEffect(() => {
    const map = mapRef.current
    if (!map || routePoints.length < 2) return

    const coordinates = routePoints.map((p) => [p.lng, p.lat] as [number, number])
    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    }

    if (map.getSource('route')) {
      (map.getSource('route') as mapboxgl.GeoJSONSource).setData(geojson)
    } else {
      map.addSource('route', { type: 'geojson', data: geojson })
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.8 },
      })
    }
  }, [routePoints])

  const handleStartTrip = async () => {
    if (!destination.trim()) return
    await startTrip(destination.trim())
  }

  const elapsed = startedAt
    ? Math.floor((Date.now() - startedAt.getTime()) / 1000)
    : 0
  const [elapsedTime, setElapsedTime] = useState(0)

  useEffect(() => {
    if (!isDriving || !startedAt) {
      setElapsedTime(0)
      return
    }
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startedAt.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [isDriving, startedAt])

  void elapsed // use the initial calculation if needed

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Navigation className="w-5 h-5 text-blue-700" />
          <span className="font-semibold text-gray-900">Fleet Tracker</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{profile?.full_name}</span>
          <button onClick={signOut} className="text-gray-400 hover:text-gray-600">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Status bar */}
      {isDriving && (
        <div className="bg-green-600 text-white px-4 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-medium">En ruta</span>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <Clock className="w-3.5 h-3.5" />
            {formatTime(elapsedTime)}
          </div>
        </div>
      )}

      {/* Map */}
      <div ref={mapContainerRef} className="flex-1" />

      {/* Geo error */}
      {geoError && (
        <div className="bg-red-50 border-t border-red-200 px-4 py-2 flex items-center gap-2 shrink-0">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-sm text-red-700">{geoError}</span>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white border-t border-gray-200 p-4 shrink-0 safe-bottom">
        {!isDriving ? (
          <div className="space-y-3">
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="¿A dónde vas?"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-base"
              />
            </div>
            <button
              onClick={handleStartTrip}
              disabled={!destination.trim()}
              className="w-full py-3 bg-blue-700 text-white rounded-xl font-semibold text-base hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              <Navigation className="w-5 h-5" />
              Iniciar Viaje
            </button>
          </div>
        ) : (
          <button
            onClick={stopTrip}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold text-base hover:bg-red-700 flex items-center justify-center gap-2 transition-colors"
          >
            <Square className="w-5 h-5" />
            Detener Viaje
          </button>
        )}
      </div>
    </div>
  )
}
