import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN, MAP_STYLE } from '../lib/mapbox'
import {
  Truck, Factory, MapPin, Search, X,
  ChevronUp, ChevronDown, Clock,
  Loader2, RotateCcw, Zap, Route, ArrowRightLeft,
} from 'lucide-react'

mapboxgl.accessToken = MAPBOX_TOKEN

const PLANT = {
  name: 'Coatings Renner Chile SpA',
  lat: -33.4406,
  lng: -70.7927,
  address: 'Cam. a Rinconada 1200, Pudahuel',
}

type Waypoint = {
  id: string
  name: string
  address: string
  lat: number
  lng: number
}

type GeoResult = {
  name: string
  address: string
  lat: number
  lng: number
}

type OptResult = {
  optimizedOrder: number[]          // indices into stops array
  optimizedCoords: [number, number][]
  optimizedDistance: number          // meters
  optimizedDuration: number         // seconds
  originalCoords: [number, number][]
  originalDistance: number
  originalDuration: number
  savings: { distance: number; duration: number; distancePct: number; durationPct: number }
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function geocodeSearch(query: string): Promise<GeoResult[]> {
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
    `?access_token=${MAPBOX_TOKEN}&country=cl&proximity=-70.65,-33.45&limit=5&types=address,poi,place,neighborhood`
  )
  const data = await res.json()
  if (!data.features) return []
  return data.features.map((f: any) => ({
    name: f.text,
    address: f.place_name,
    lat: f.center[1],
    lng: f.center[0],
  }))
}

async function fetchDirections(coords: string): Promise<{ distance: number; duration: number; geometry: [number, number][] } | null> {
  const res = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}` +
    `?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`
  )
  const data = await res.json()
  const route = data.routes?.[0]
  if (!route) return null
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry.coordinates,
  }
}

async function optimizeRoute(stops: Waypoint[]): Promise<OptResult | null> {
  // Build coordinate strings
  const allPoints = [PLANT, ...stops, PLANT]
  const originalCoordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')

  const optPoints = [PLANT, ...stops]
  const optCoordStr = optPoints.map(p => `${p.lng},${p.lat}`).join(';')

  // Fetch both in parallel
  const [originalRes, optimizedRes] = await Promise.all([
    fetchDirections(originalCoordStr),
    fetch(
      `https://api.mapbox.com/optimized-trips/v1/mapbox/driving/${optCoordStr}` +
      `?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&source=first&roundtrip=true`
    ).then(r => r.json()),
  ])

  if (!originalRes || !optimizedRes.trips?.[0]) return null

  const optTrip = optimizedRes.trips[0]
  // waypoints[0] is the plant, rest are stops
  // Sort stops by their waypoint_index to get the actual optimized visit order
  const waypointOrder: number[] = optimizedRes.waypoints
    .slice(1) // skip plant
    .map((wp: any, inputIdx: number) => ({ inputIdx, optPos: wp.waypoint_index }))
    .sort((a: { optPos: number }, b: { optPos: number }) => a.optPos - b.optPos)
    .map((item: { inputIdx: number }) => item.inputIdx)

  const savings = {
    distance: originalRes.distance - optTrip.distance,
    duration: originalRes.duration - optTrip.duration,
    distancePct: originalRes.distance > 0
      ? Math.round(((originalRes.distance - optTrip.distance) / originalRes.distance) * 100) : 0,
    durationPct: originalRes.duration > 0
      ? Math.round(((originalRes.duration - optTrip.duration) / originalRes.duration) * 100) : 0,
  }

  return {
    optimizedOrder: waypointOrder,
    optimizedCoords: optTrip.geometry.coordinates,
    optimizedDistance: optTrip.distance,
    optimizedDuration: optTrip.duration,
    originalCoords: originalRes.geometry,
    originalDistance: originalRes.distance,
    originalDuration: originalRes.duration,
    savings,
  }
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters)} m`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m} min`
}

let idCounter = 0

// ── Component ────────────────────────────────────────────────────────────────

export function RouteOptimizerPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const plantMarkerRef = useRef<mapboxgl.Marker | null>(null)

  const [stops, setStops] = useState<Waypoint[]>([])
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<GeoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<OptResult | null>(null)
  const [optimizing, setOptimizing] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  // ── Geocoding search ───────────────────────────────────────────────────────

  useEffect(() => {
    if (query.length < 3) { setSuggestions([]); return }
    setSearching(true)
    const timer = setTimeout(async () => {
      const results = await geocodeSearch(query)
      setSuggestions(results)
      setSearching(false)
    }, 350)
    return () => { clearTimeout(timer); setSearching(false) }
  }, [query])

  // ── Map init ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: [PLANT.lng, PLANT.lat],
      zoom: 11,
    })

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    mapRef.current = map

    // Plant marker
    const plantEl = document.createElement('div')
    plantEl.style.cssText = `
      width: 44px; height: 44px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(30,64,175,0.4);
      cursor: pointer; z-index: 10;
    `
    plantEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>`

    const plantPopup = new mapboxgl.Popup({ offset: 28, closeButton: false }).setHTML(`
      <div style="font-family: system-ui; padding: 2px;">
        <div style="font-weight: 700; font-size: 13px; color: #1e40af;">Origen: Planta Renner</div>
        <div style="font-size: 11px; color: #666;">${PLANT.address}</div>
      </div>
    `)

    plantMarkerRef.current = new mapboxgl.Marker(plantEl)
      .setLngLat([PLANT.lng, PLANT.lat])
      .setPopup(plantPopup)
      .addTo(map)

    map.on('load', () => {
      // Original route (dashed, gray/red)
      map.addSource('original-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      })
      map.addLayer({
        id: 'original-route-layer',
        type: 'line',
        source: 'original-route',
        paint: {
          'line-color': '#ef4444',
          'line-width': 3,
          'line-opacity': 0.5,
          'line-dasharray': [4, 4],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
      })

      // Optimized route (solid, green)
      map.addSource('optimized-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
      })
      map.addLayer({
        id: 'optimized-route-border',
        type: 'line',
        source: 'optimized-route',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({
        id: 'optimized-route-layer',
        type: 'line',
        source: 'optimized-route',
        paint: { 'line-color': '#16a34a', 'line-width': 4, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      setMapLoaded(true)
    })

    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ── Update map markers & fit bounds ────────────────────────────────────────

  const updateMapMarkers = useCallback((stopsToShow: Waypoint[], optimizedOrder?: number[]) => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    // Clear old markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    const orderedStops = optimizedOrder
      ? optimizedOrder.map(i => stopsToShow[i])
      : stopsToShow

    orderedStops.forEach((stop, i) => {
      const el = document.createElement('div')
      el.style.cssText = `
        width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 700; color: white;
        background: ${optimizedOrder ? '#16a34a' : '#3b82f6'};
        border: 2.5px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      `
      el.textContent = String(i + 1)

      const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(`
        <div style="font-family: system-ui; padding: 2px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 2px;">Parada ${i + 1}</div>
          <div style="font-size: 12px; color: #444;">${stop.name}</div>
          <div style="font-size: 11px; color: #888;">${stop.address}</div>
        </div>
      `)

      const marker = new mapboxgl.Marker(el)
        .setLngLat([stop.lng, stop.lat])
        .setPopup(popup)
        .addTo(map)
      markersRef.current.push(marker)
    })

    // Fit bounds
    if (orderedStops.length > 0) {
      const bounds = new mapboxgl.LngLatBounds()
      bounds.extend([PLANT.lng, PLANT.lat])
      orderedStops.forEach(s => bounds.extend([s.lng, s.lat]))
      map.fitBounds(bounds, { padding: 80, duration: 800 })
    }
  }, [mapLoaded])

  // Update markers when stops change (and no optimization result yet)
  // Also show the current-order route preview on the map
  useEffect(() => {
    if (result) return
    updateMapMarkers(stops)

    const map = mapRef.current
    if (!map || !mapLoaded) return

    const origSrc = map.getSource('original-route') as mapboxgl.GeoJSONSource | undefined
    const optSrc = map.getSource('optimized-route') as mapboxgl.GeoJSONSource | undefined
    const empty = { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [] as [number, number][] }, properties: {} }
    origSrc?.setData(empty)

    if (stops.length >= 1) {
      // Fetch and show current-order route preview (blue)
      const allPoints = [PLANT, ...stops, PLANT]
      const coordStr = allPoints.map(p => `${p.lng},${p.lat}`).join(';')
      let cancelled = false
      fetchDirections(coordStr).then(dir => {
        if (cancelled || !dir) { optSrc?.setData(empty); return }
        optSrc?.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: dir.geometry },
          properties: {},
        })
        // Show preview in blue
        map.setPaintProperty('optimized-route-layer', 'line-color', '#3b82f6')
        map.setPaintProperty('optimized-route-border', 'line-color', '#dbeafe')
      })
      return () => { cancelled = true }
    } else {
      optSrc?.setData(empty)
    }
  }, [stops, mapLoaded, result, updateMapMarkers])

  // Draw result on map
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !result) return

    updateMapMarkers(stops, result.optimizedOrder)

    // Switch route color back to green for optimized result
    map.setPaintProperty('optimized-route-layer', 'line-color', '#16a34a')
    map.setPaintProperty('optimized-route-border', 'line-color', '#ffffff')

    const optSrc = map.getSource('optimized-route') as mapboxgl.GeoJSONSource | undefined
    optSrc?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: result.optimizedCoords },
      properties: {},
    })

    const origSrc = map.getSource('original-route') as mapboxgl.GeoJSONSource | undefined
    origSrc?.setData({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: result.originalCoords },
      properties: {},
    })
  }, [result, mapLoaded, stops, updateMapMarkers])

  // Toggle original route visibility
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return
    map.setLayoutProperty('original-route-layer', 'visibility', showOriginal ? 'visible' : 'none')
  }, [showOriginal, mapLoaded])

  // ── Actions ────────────────────────────────────────────────────────────────

  const addStop = useCallback((geo: GeoResult) => {
    if (stops.length >= 11) return // Mapbox limit: 12 coords including origin
    setStops(prev => [...prev, { ...geo, id: `wp-${++idCounter}` }])
    setQuery('')
    setSuggestions([])
    setResult(null)
  }, [stops.length])

  const removeStop = useCallback((id: string) => {
    setStops(prev => prev.filter(s => s.id !== id))
    setResult(null)
  }, [])

  const moveStop = useCallback((index: number, direction: -1 | 1) => {
    setStops(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
    setResult(null)
  }, [])

  const handleOptimize = useCallback(async () => {
    if (stops.length < 2) return
    setOptimizing(true)
    try {
      const res = await optimizeRoute(stops)
      setResult(res)
      setShowOriginal(false)
    } finally {
      setOptimizing(false)
    }
  }, [stops])

  const handleReset = useCallback(() => {
    setStops([])
    setResult(null)
    setQuery('')
    setSuggestions([])
    setShowOriginal(false)
    mapRef.current?.flyTo({ center: [PLANT.lng, PLANT.lat], zoom: 11, duration: 800 })
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Route className="w-6 h-6 text-green-600" />
          <h1 className="text-lg font-bold text-gray-900">Optimizador de Rutas</h1>
          <span className="text-sm text-gray-400">|</span>
          <div className="flex items-center gap-2">
            <Factory className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">Coatings Renner Chile SpA</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/demo" className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50">
            Ver Demo Flota
          </a>
          <span className="text-xs bg-green-50 text-green-600 px-2.5 py-1 rounded-full font-medium border border-green-100">
            DEMO
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[380px] bg-white border-r border-gray-200 flex flex-col shrink-0 z-10">
          {/* Origin */}
          <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
            <div className="flex items-center gap-2 mb-1">
              <Factory className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm text-blue-900">Origen</span>
            </div>
            <p className="text-xs text-gray-500">{PLANT.name}</p>
            <p className="text-[11px] text-gray-400">{PLANT.address}</p>
          </div>

          {/* Search */}
          <div className="p-3 border-b border-gray-100 relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar direccion o lugar..."
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-400"
              />
              {query && (
                <button onClick={() => { setQuery(''); setSuggestions([]) }} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              )}
              {searching && (
                <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
              )}
            </div>

            {/* Suggestions dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute left-3 right-3 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => addStop(s)}
                    className="w-full text-left px-3 py-2.5 hover:bg-green-50 border-b border-gray-50 last:border-b-0 transition-colors"
                  >
                    <div className="text-sm font-medium text-gray-900">{s.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{s.address}</div>
                  </button>
                ))}
              </div>
            )}

            {stops.length >= 11 && (
              <p className="text-[11px] text-amber-600 mt-1">Maximo 11 paradas alcanzado</p>
            )}
          </div>

          {/* Stops list */}
          <div className="flex-1 overflow-y-auto">
            {stops.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6">
                <MapPin className="w-10 h-10 mb-3 text-gray-300" />
                <p className="text-sm font-medium mb-1">Sin paradas</p>
                <p className="text-xs text-center">Busca y agrega al menos 2 destinos para optimizar la ruta</p>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500 font-medium">{stops.length} parada{stops.length !== 1 ? 's' : ''}</span>
                  <button onClick={handleReset} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    Limpiar
                  </button>
                </div>
                {stops.map((stop, i) => {
                  // Show reordered number if optimized
                  const displayNum = result
                    ? result.optimizedOrder.indexOf(i) + 1
                    : i + 1

                  return (
                    <div
                      key={stop.id}
                      className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50/50 group"
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ background: result ? '#16a34a' : '#3b82f6' }}
                      >
                        {displayNum}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{stop.name}</div>
                        <div className="text-[11px] text-gray-400 truncate">{stop.address}</div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => moveStop(i, -1)} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => moveStop(i, 1)} disabled={i === stops.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeStop(stop.id)} className="p-0.5 text-gray-400 hover:text-red-500 ml-0.5">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Bottom: optimize button & results */}
          <div className="border-t border-gray-200 bg-white shrink-0">
            {/* Results */}
            {result && (
              <div className="p-4 bg-green-50/70 border-b border-green-100">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-4 h-4 text-green-600" />
                  <span className="font-semibold text-sm text-green-800">Ruta Optimizada</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="bg-white rounded-lg p-2 border border-green-100">
                    <div className="text-[10px] text-gray-500 uppercase mb-0.5">Distancia</div>
                    <div className="text-sm font-bold text-gray-900">{formatDistance(result.optimizedDistance)}</div>
                    {result.savings.distance > 0 && (
                      <div className="text-[11px] text-green-600 font-medium">
                        -{formatDistance(result.savings.distance)} ({result.savings.distancePct}%)
                      </div>
                    )}
                  </div>
                  <div className="bg-white rounded-lg p-2 border border-green-100">
                    <div className="text-[10px] text-gray-500 uppercase mb-0.5">Tiempo est.</div>
                    <div className="text-sm font-bold text-gray-900">{formatDuration(result.optimizedDuration)}</div>
                    {result.savings.duration > 0 && (
                      <div className="text-[11px] text-green-600 font-medium">
                        -{formatDuration(result.savings.duration)} ({result.savings.durationPct}%)
                      </div>
                    )}
                  </div>
                </div>

                {/* Compare toggle */}
                <button
                  onClick={() => setShowOriginal(!showOriginal)}
                  className={`w-full text-xs py-1.5 rounded-md font-medium flex items-center justify-center gap-1.5 transition-colors ${
                    showOriginal
                      ? 'bg-red-100 text-red-700 border border-red-200'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <ArrowRightLeft className="w-3 h-3" />
                  {showOriginal ? 'Ocultando ruta original' : 'Comparar con ruta original'}
                </button>

                {showOriginal && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="bg-red-50 rounded-lg p-2 border border-red-100">
                      <div className="text-[10px] text-red-400 uppercase mb-0.5">Original</div>
                      <div className="text-xs font-bold text-red-700">{formatDistance(result.originalDistance)}</div>
                      <div className="text-[11px] text-red-500">{formatDuration(result.originalDuration)}</div>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 border border-green-100">
                      <div className="text-[10px] text-green-500 uppercase mb-0.5">Optimizada</div>
                      <div className="text-xs font-bold text-green-700">{formatDistance(result.optimizedDistance)}</div>
                      <div className="text-[11px] text-green-600">{formatDuration(result.optimizedDuration)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Optimize button */}
            <div className="p-3">
              <button
                onClick={handleOptimize}
                disabled={stops.length < 2 || optimizing}
                className="w-full py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-green-600 text-white hover:bg-green-700 active:bg-green-800"
              >
                {optimizing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Optimizando...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Optimizar Ruta
                  </>
                )}
              </button>
              {stops.length < 2 && stops.length > 0 && (
                <p className="text-[11px] text-gray-400 text-center mt-1.5">Agrega al menos 2 paradas</p>
              )}
            </div>
          </div>
        </aside>

        {/* Map */}
        <div ref={mapContainerRef} className="flex-1" />
      </div>
    </div>
  )
}
