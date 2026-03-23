import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useRealtimeDrivers, type DriverWithProfile } from '../hooks/useRealtimeDrivers'
import { useAuth } from '../contexts/AuthContext'
import { MAPBOX_TOKEN, MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from '../lib/mapbox'
import { Users, LogOut, MapPin, Clock, Truck } from 'lucide-react'

mapboxgl.accessToken = MAPBOX_TOKEN

export function AdminDashboardPage() {
  const { profile, signOut } = useAuth()
  const { drivers, loading } = useRealtimeDrivers()
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null)

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

  // Update markers when drivers change
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentIds = new Set<string>()

    drivers.forEach((driver) => {
      if (!driver.current_lat || !driver.current_lng) return
      currentIds.add(driver.id)

      const existing = markersRef.current.get(driver.id)
      if (existing) {
        existing.setLngLat([driver.current_lng, driver.current_lat])
        // Update popup content
        existing.getPopup()?.setHTML(createPopupHTML(driver))
      } else {
        const el = document.createElement('div')
        el.style.cssText = `
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; cursor: pointer;
          background: ${driver.status === 'driving' ? '#16a34a' : '#6b7280'};
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          transition: background 0.3s;
        `
        el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M5 17h2l1-4h8l1 4h2"/><path d="M5 17a2 2 0 1 0 4 0"/><path d="M15 17a2 2 0 1 0 4 0"/><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/></svg>`

        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
          .setHTML(createPopupHTML(driver))

        const marker = new mapboxgl.Marker(el)
          .setLngLat([driver.current_lng, driver.current_lat])
          .setPopup(popup)
          .addTo(map)

        el.addEventListener('click', () => setSelectedDriver(driver.id))

        markersRef.current.set(driver.id, marker)
      }

      // Update marker color based on status
      const markerEl = markersRef.current.get(driver.id)?.getElement()
      if (markerEl) {
        markerEl.style.background = driver.status === 'driving' ? '#16a34a' : '#6b7280'
      }
    })

    // Remove markers for drivers no longer present
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove()
        markersRef.current.delete(id)
      }
    })
  }, [drivers])

  const focusDriver = (driver: DriverWithProfile) => {
    if (!mapRef.current || !driver.current_lat || !driver.current_lng) return
    setSelectedDriver(driver.id)
    mapRef.current.flyTo({
      center: [driver.current_lng, driver.current_lat],
      zoom: 15,
      duration: 1000,
    })
    // Open popup
    const marker = markersRef.current.get(driver.id)
    marker?.togglePopup()
  }

  const activeCount = drivers.filter((d) => d.status === 'driving').length

  const formatLastSeen = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
    if (diff < 60) return 'ahora'
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
    return `hace ${Math.floor(diff / 3600)}h`
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Truck className="w-6 h-6 text-blue-700" />
          <h1 className="text-lg font-bold text-gray-900">Fleet Tracker</h1>
          <span className="text-sm text-gray-400">|</span>
          <span className="text-sm text-gray-500">Panel de Administración</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{profile?.full_name}</span>
          <button onClick={signOut} className="text-gray-400 hover:text-gray-600">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0 z-10">
          <div className="p-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Conductores
              </h2>
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                {activeCount} activo{activeCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-400 text-sm">Cargando...</div>
            ) : drivers.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">No hay conductores registrados</div>
            ) : (
              drivers.map((driver) => (
                <button
                  key={driver.id}
                  onClick={() => focusDriver(driver)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    selectedDriver === driver.id ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 text-sm">
                      {driver.profile.full_name}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        driver.status === 'driving'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {driver.status === 'driving' ? 'En ruta' : 'Detenido'}
                    </span>
                  </div>
                  {driver.destination_name && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <MapPin className="w-3 h-3" />
                      {driver.destination_name}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                    <Clock className="w-3 h-3" />
                    {formatLastSeen(driver.last_seen_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Map */}
        <div ref={mapContainerRef} className="flex-1" />
      </div>
    </div>
  )
}

function createPopupHTML(driver: DriverWithProfile): string {
  return `
    <div style="font-family: system-ui, sans-serif; min-width: 150px;">
      <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${driver.profile.full_name}</div>
      <div style="display: flex; align-items: center; gap: 4px; margin-bottom: 2px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${
          driver.status === 'driving' ? '#16a34a' : '#6b7280'
        }; display: inline-block;"></span>
        <span style="font-size: 12px; color: #666;">${
          driver.status === 'driving' ? 'En ruta' : 'Detenido'
        }</span>
      </div>
      ${
        driver.destination_name
          ? `<div style="font-size: 12px; color: #888; margin-top: 4px;">Destino: ${driver.destination_name}</div>`
          : ''
      }
    </div>
  `
}
