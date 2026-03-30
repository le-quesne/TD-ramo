import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { MAPBOX_TOKEN, MAP_STYLE } from '../lib/mapbox'
import {
  Users, MapPin, Truck, Factory, Package,
  ChevronDown, ChevronUp, CircleCheck, Circle, Navigation, Loader2,
} from 'lucide-react'

mapboxgl.accessToken = MAPBOX_TOKEN

const PLANT = {
  name: 'Coatings Renner Chile SpA',
  lat: -33.4406,
  lng: -70.7927,
  address: 'Cam. a Rinconada 1200, Pudahuel',
}

type Stop = { name: string; lat: number; lng: number; delivered: boolean }

type DemoTruck = {
  id: string
  name: string
  plate: string
  stops: Stop[]
  currentLeg: number       // 0..stops.length = forward legs, stops.length = return leg
  status: 'en_ruta' | 'entregando'
  lat: number
  lng: number
  speed: number
  segmentProgress: number
  color: string
}

type RouteGeo = {
  fullCoords: [number, number][]
  legCoords: [number, number][][]
}

const TRUCK_COLORS = [
  '#16a34a', '#0ea5e9', '#8b5cf6', '#f59e0b', '#ef4444',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
]

const ROUTES: { name: string; plate: string; stops: { name: string; lat: number; lng: number }[] }[] = [
  {
    name: 'Carlos Muñoz', plate: 'BK-4821',
    stops: [
      { name: 'Sodimac - Maipú', lat: -33.5100, lng: -70.7600 },
      { name: 'Easy - Maipú', lat: -33.5000, lng: -70.7550 },
      { name: 'Construmart - Cerrillos', lat: -33.4900, lng: -70.7200 },
    ],
  },
  {
    name: 'Pedro Soto', plate: 'CF-7193',
    stops: [
      { name: 'Sherwin Williams - Las Condes', lat: -33.4100, lng: -70.5700 },
      { name: 'Pinturas Tricolor - Vitacura', lat: -33.3950, lng: -70.5800 },
      { name: 'Sodimac - La Dehesa', lat: -33.3750, lng: -70.5200 },
    ],
  },
  {
    name: 'Juan Contreras', plate: 'DH-3056',
    stops: [
      { name: 'Ferretería Imperial - Renca', lat: -33.3900, lng: -70.7200 },
      { name: 'Construmart - Quilicura', lat: -33.3600, lng: -70.7300 },
      { name: 'MTS - Lampa', lat: -33.2900, lng: -70.7400 },
      { name: 'Easy - Colina', lat: -33.2100, lng: -70.6700 },
    ],
  },
  {
    name: 'Miguel Reyes', plate: 'ER-8472',
    stops: [
      { name: 'Easy - La Florida', lat: -33.5200, lng: -70.5900 },
      { name: 'Sodimac - Puente Alto', lat: -33.6000, lng: -70.5800 },
      { name: 'Pinturas Tricolor - Puente Alto', lat: -33.6100, lng: -70.5700 },
    ],
  },
  {
    name: 'Roberto Fuentes', plate: 'FG-1235',
    stops: [
      { name: 'MTS - San Bernardo', lat: -33.5800, lng: -70.7100 },
      { name: 'Construmart - El Bosque', lat: -33.5500, lng: -70.6800 },
      { name: 'Comercial Kraff - La Cisterna', lat: -33.5300, lng: -70.6600 },
      { name: 'Ferretería Sabal - San Miguel', lat: -33.4950, lng: -70.6500 },
    ],
  },
  {
    name: 'Francisco Díaz', plate: 'GJ-5589',
    stops: [
      { name: 'Sodimac Constructor - Ñuñoa', lat: -33.4600, lng: -70.6000 },
      { name: 'Distribuidora Austral - Providencia', lat: -33.4300, lng: -70.6100 },
      { name: 'Pinturas Soquina - Recoleta', lat: -33.4050, lng: -70.6400 },
    ],
  },
  {
    name: 'Andrés Morales', plate: 'HM-2847',
    stops: [
      { name: 'Easy - Peñalolén', lat: -33.4900, lng: -70.5300 },
      { name: 'Homecenter - Macul', lat: -33.4800, lng: -70.5950 },
      { name: 'Ferretería Central - La Reina', lat: -33.4500, lng: -70.5500 },
    ],
  },
  {
    name: 'Luis Sepúlveda', plate: 'JN-9614',
    stops: [
      { name: 'Construmart - Estación Central', lat: -33.4520, lng: -70.6800 },
      { name: 'Pinturas Iris - Santiago Centro', lat: -33.4400, lng: -70.6500 },
      { name: 'Comercial Lepe - Independencia', lat: -33.4100, lng: -70.6600 },
      { name: 'MTS - Conchalí', lat: -33.3800, lng: -70.6700 },
    ],
  },
  {
    name: 'Diego Vargas', plate: 'KP-3378',
    stops: [
      { name: 'Sodimac - Huechuraba', lat: -33.3600, lng: -70.6400 },
      { name: 'Easy - Lo Barnechea', lat: -33.3500, lng: -70.5200 },
    ],
  },
  {
    name: 'Héctor Bravo', plate: 'LP-6742',
    stops: [
      { name: 'Ferretería Aldunate - Quinta Normal', lat: -33.4350, lng: -70.7050 },
      { name: 'Construmart - Lo Prado', lat: -33.4450, lng: -70.7250 },
      { name: 'Comercial Saavedra - Cerro Navia', lat: -33.4250, lng: -70.7450 },
    ],
  },
]

// ── Mapbox Directions API ────────────────────────────────────────────────────

async function fetchRouteGeo(stops: { lat: number; lng: number }[]): Promise<RouteGeo | null> {
  const waypoints = [
    `${PLANT.lng},${PLANT.lat}`,
    ...stops.map(s => `${s.lng},${s.lat}`),
    `${PLANT.lng},${PLANT.lat}`,
  ].join(';')

  try {
    const res = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?geometries=geojson&overview=full&steps=true&access_token=${MAPBOX_TOKEN}`
    )
    const data = await res.json()
    if (!data.routes?.[0]) return null

    const route = data.routes[0]
    const legCoords: [number, number][][] = route.legs.map((leg: any) => {
      const coords: [number, number][] = []
      for (const step of leg.steps) {
        for (const c of step.geometry.coordinates) {
          const last = coords[coords.length - 1]
          if (!last || last[0] !== c[0] || last[1] !== c[1]) {
            coords.push(c as [number, number])
          }
        }
      }
      return coords
    })

    return { fullCoords: route.geometry.coordinates, legCoords }
  } catch {
    return null
  }
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

function getPositionAlongCoords(coords: [number, number][], progress: number): [number, number] {
  if (!coords.length) return [PLANT.lng, PLANT.lat]
  if (progress <= 0) return coords[0]
  if (progress >= 1) return coords[coords.length - 1]

  let totalLen = 0
  const segLens: number[] = []
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0]
    const dy = coords[i][1] - coords[i - 1][1]
    const len = Math.sqrt(dx * dx + dy * dy)
    segLens.push(len)
    totalLen += len
  }
  if (totalLen === 0) return coords[0]

  const target = progress * totalLen
  let accum = 0
  for (let i = 0; i < segLens.length; i++) {
    if (accum + segLens[i] >= target) {
      const t = segLens[i] > 0 ? (target - accum) / segLens[i] : 0
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
      ]
    }
    accum += segLens[i]
  }
  return coords[coords.length - 1]
}

function lerpFallback(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  t: number,
): [number, number] {
  return [
    from.lng + (to.lng - from.lng) * t,
    from.lat + (to.lat - from.lat) * t,
  ]
}

function getTruckPosition(
  truck: DemoTruck,
  geo: RouteGeo | null,
): [number, number] {
  const legCoords = geo?.legCoords[truck.currentLeg]
  if (legCoords && legCoords.length > 1) {
    return getPositionAlongCoords(legCoords, truck.segmentProgress)
  }
  // Fallback straight line
  const from = truck.currentLeg === 0
    ? PLANT
    : truck.currentLeg <= truck.stops.length
      ? truck.stops[truck.currentLeg - 1]
      : truck.stops[truck.stops.length - 1]
  const to = truck.currentLeg < truck.stops.length
    ? truck.stops[truck.currentLeg]
    : PLANT
  return lerpFallback(from, to, truck.segmentProgress)
}

function getDisplayStatus(truck: DemoTruck): string {
  if (truck.status === 'entregando') return 'Entregando'
  if (truck.currentLeg === truck.stops.length) return 'Regresando'
  return 'En ruta'
}

function getStatusClass(truck: DemoTruck): string {
  if (truck.status === 'entregando') return 'bg-amber-100 text-amber-700'
  if (truck.currentLeg === truck.stops.length) return 'bg-indigo-100 text-indigo-700'
  return 'bg-green-100 text-green-700'
}

function getMarkerBg(truck: DemoTruck): string {
  if (truck.status === 'entregando') return '#f59e0b'
  return truck.color
}

function getCurrentDestName(truck: DemoTruck): string {
  if (truck.status === 'entregando') return truck.stops[truck.currentLeg]?.name ?? 'Planta'
  if (truck.currentLeg < truck.stops.length) return truck.stops[truck.currentLeg].name
  return 'Planta Pudahuel'
}

// ── Component ────────────────────────────────────────────────────────────────

export function DemoPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const stopMarkersRef = useRef<mapboxgl.Marker[]>([])
  const plantMarkerRef = useRef<mapboxgl.Marker | null>(null)

  const [trucks, setTrucks] = useState<DemoTruck[]>([])
  const [routeGeos, setRouteGeos] = useState<(RouteGeo | null)[]>([])
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  const [expandedTruck, setExpandedTruck] = useState<string | null>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [dataReady, setDataReady] = useState(false)

  // ── Fetch routes on mount ──────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function init() {
      const geos = await Promise.all(ROUTES.map(r => fetchRouteGeo(r.stops)))
      if (cancelled) return
      setRouteGeos(geos)

      const initial: DemoTruck[] = ROUTES.map((route, i) => {
        const geo = geos[i]
        const currentLeg = Math.floor(Math.random() * route.stops.length)
        const segmentProgress = Math.random() * 0.7 + 0.1

        const stops: Stop[] = route.stops.map((s, si) => ({
          ...s,
          delivered: si < currentLeg,
        }))

        const pos = getTruckPosition(
          { currentLeg, stops, segmentProgress } as DemoTruck,
          geo,
        )

        return {
          id: `truck-${i}`,
          name: route.name,
          plate: route.plate,
          stops,
          currentLeg,
          status: 'en_ruta' as const,
          lat: pos[1],
          lng: pos[0],
          speed: Math.floor(Math.random() * 20) + 35,
          segmentProgress,
          color: TRUCK_COLORS[i],
        }
      })

      setTrucks(initial)
      setDataReady(true)
    }

    init()
    return () => { cancelled = true }
  }, [])

  // ── Animate trucks ─────────────────────────────────────────────────────────
  // State updates every 2s (for sidebar / stop status).
  // Marker positions are interpolated every frame via requestAnimationFrame
  // so movement looks perfectly smooth on the map.

  const targetPositions = useRef<Map<string, { lng: number; lat: number }>>(new Map())
  const currentPositions = useRef<Map<string, { lng: number; lat: number }>>(new Map())

  // Tick: advance simulation state every 2s
  useEffect(() => {
    if (!dataReady) return

    const interval = setInterval(() => {
      setTrucks(prev => prev.map((truck, i) => {
        const geo = routeGeos[i]
        let { segmentProgress, status, currentLeg } = truck
        const stops = truck.stops.map(s => ({ ...s }))
        const step = 0.006 + Math.random() * 0.01

        if (status === 'en_ruta') {
          segmentProgress += step
          if (segmentProgress >= 1) {
            if (currentLeg < stops.length) {
              stops[currentLeg].delivered = true
              status = 'entregando'
              segmentProgress = 1
            } else {
              currentLeg = 0
              segmentProgress = 0
              for (const s of stops) s.delivered = false
            }
          }
        } else if (status === 'entregando') {
          if (Math.random() > 0.92) {
            currentLeg++
            segmentProgress = 0
            status = 'en_ruta'
          }
        }

        const pos = getTruckPosition(
          { ...truck, stops, currentLeg, segmentProgress } as DemoTruck,
          geo,
        )

        // Set target for smooth interpolation
        targetPositions.current.set(truck.id, { lng: pos[0], lat: pos[1] })
        if (!currentPositions.current.has(truck.id)) {
          currentPositions.current.set(truck.id, { lng: pos[0], lat: pos[1] })
        }

        return {
          ...truck,
          stops,
          currentLeg,
          segmentProgress,
          status,
          lat: pos[1],
          lng: pos[0],
          speed: status === 'entregando' ? 0 : Math.floor(Math.random() * 15) + 35,
        }
      }))
    }, 2000)
    return () => clearInterval(interval)
  }, [dataReady, routeGeos])

  // RAF loop: smoothly interpolate marker positions every frame
  useEffect(() => {
    if (!mapLoaded || !dataReady) return
    let raf: number

    function animate() {
      targetPositions.current.forEach((target, id) => {
        const cur = currentPositions.current.get(id)
        if (!cur) {
          currentPositions.current.set(id, { ...target })
          return
        }
        // Lerp toward target (0.12 = smooth catch-up per frame)
        const factor = 0.12
        cur.lng += (target.lng - cur.lng) * factor
        cur.lat += (target.lat - cur.lat) * factor

        const marker = markersRef.current.get(id)
        if (marker) {
          marker.setLngLat([cur.lng, cur.lat])
        }
      })
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [mapLoaded, dataReady])

  // ── Initialize map ─────────────────────────────────────────────────────────

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
      width: 48px; height: 48px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #1e40af, #3b82f6);
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(30,64,175,0.4);
      cursor: pointer; z-index: 10;
    `
    plantEl.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/></svg>`

    const plantPopup = new mapboxgl.Popup({ offset: 30, closeButton: false }).setHTML(`
      <div style="font-family: system-ui, sans-serif; min-width: 200px; padding: 4px;">
        <div style="font-weight: 700; font-size: 14px; color: #1e40af; margin-bottom: 6px;">Coatings Renner Chile SpA</div>
        <div style="font-size: 12px; color: #666; margin-bottom: 2px;">Cam. a Rinconada 1200, Pudahuel</div>
        <div style="font-size: 12px; color: #666;">Region Metropolitana</div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #eee;">
          <div style="font-size: 11px; color: #16a34a; font-weight: 600;">● Planta operativa</div>
        </div>
      </div>
    `)

    plantMarkerRef.current = new mapboxgl.Marker(plantEl)
      .setLngLat([PLANT.lng, PLANT.lat])
      .setPopup(plantPopup)
      .addTo(map)

    map.on('load', () => {
      // All routes (dimmed)
      map.addSource('all-routes', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'all-routes-layer',
        type: 'line',
        source: 'all-routes',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 2.5,
          'line-opacity': 0.18,
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      // Selected route border
      map.addSource('selected-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'selected-route-border',
        type: 'line',
        source: 'selected-route',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })
      map.addLayer({
        id: 'selected-route-layer',
        type: 'line',
        source: 'selected-route',
        paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.85 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      })

      // Plant radius
      map.addSource('plant-radius', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [PLANT.lng, PLANT.lat] }, properties: {} },
      })
      map.addLayer({
        id: 'plant-radius-layer',
        type: 'circle',
        source: 'plant-radius',
        paint: {
          'circle-radius': 40,
          'circle-color': '#3b82f6',
          'circle-opacity': 0.08,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#3b82f6',
          'circle-stroke-opacity': 0.15,
        },
      })

      setMapLoaded(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ── Draw all routes ────────────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !dataReady) return

    const features = trucks.map((truck, i) => {
      const geo = routeGeos[i]
      return {
        type: 'Feature' as const,
        properties: { color: truck.color },
        geometry: {
          type: 'LineString' as const,
          coordinates: geo?.fullCoords ?? [],
        },
      }
    }).filter(f => f.geometry.coordinates.length > 0)

    const src = map.getSource('all-routes') as mapboxgl.GeoJSONSource | undefined
    src?.setData({ type: 'FeatureCollection', features })
  }, [mapLoaded, dataReady, routeGeos, trucks])

  // ── Draw selected route + stop markers ─────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded) return

    stopMarkersRef.current.forEach(m => m.remove())
    stopMarkersRef.current = []

    const src = map.getSource('selected-route') as mapboxgl.GeoJSONSource | undefined
    if (!src) return

    if (!selectedTruck) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const idx = trucks.findIndex(t => t.id === selectedTruck)
    const truck = trucks[idx]
    const geo = routeGeos[idx]
    if (!truck) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    src.setData({
      type: 'FeatureCollection',
      features: geo?.fullCoords.length ? [{
        type: 'Feature',
        properties: { color: truck.color },
        geometry: { type: 'LineString', coordinates: geo.fullCoords },
      }] : [],
    })

    // Stop markers
    truck.stops.forEach((stop, si) => {
      const isDelivered = stop.delivered
      const isCurrent = si === truck.currentLeg && truck.currentLeg < truck.stops.length
      const el = document.createElement('div')
      el.style.cssText = `
        width: 26px; height: 26px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: white;
        background: ${isDelivered ? '#16a34a' : isCurrent ? truck.color : '#94a3b8'};
        border: 2.5px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
      `
      el.textContent = String(si + 1)

      const popup = new mapboxgl.Popup({ offset: 18, closeButton: false }).setHTML(`
        <div style="font-family: system-ui; padding: 2px;">
          <div style="font-weight: 600; font-size: 13px; margin-bottom: 4px;">Parada ${si + 1}: ${stop.name}</div>
          <div style="font-size: 12px; color: ${isDelivered ? '#16a34a' : isCurrent ? truck.color : '#94a3b8'}; font-weight: 500;">
            ${isDelivered ? '✓ Entregado' : isCurrent ? (truck.status === 'entregando' ? '● Entregando' : '● En camino') : '○ Pendiente'}
          </div>
        </div>
      `)

      const marker = new mapboxgl.Marker(el)
        .setLngLat([stop.lng, stop.lat])
        .setPopup(popup)
        .addTo(map)
      stopMarkersRef.current.push(marker)
    })
  }, [selectedTruck, trucks, mapLoaded, routeGeos])

  // ── Update truck markers ───────────────────────────────────────────────────

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapLoaded || !dataReady) return

    trucks.forEach((truck) => {
      const isSelected = truck.id === selectedTruck
      const existing = markersRef.current.get(truck.id)

      if (existing) {
        existing.getPopup()?.setHTML(createTruckPopupHTML(truck))
        const el = existing.getElement()
        if (el) {
          el.style.background = getMarkerBg(truck)
          el.style.width = isSelected ? '42px' : '34px'
          el.style.height = isSelected ? '42px' : '34px'
          el.style.borderColor = isSelected ? truck.color : 'white'
          el.style.boxShadow = isSelected
            ? `0 0 0 3px white, 0 0 12px ${truck.color}88`
            : '0 2px 8px rgba(0,0,0,0.3)'
        }
      } else {
        const el = document.createElement('div')
        el.style.cssText = `
          width: ${isSelected ? 42 : 34}px; height: ${isSelected ? 42 : 34}px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: ${getMarkerBg(truck)};
          border: 3px solid ${isSelected ? truck.color : 'white'};
          box-shadow: ${isSelected ? `0 0 0 3px white, 0 0 12px ${truck.color}88` : '0 2px 8px rgba(0,0,0,0.3)'};
          cursor: pointer;
        `
        el.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M5 17h2l1-4h8l1 4h2"/><path d="M5 17a2 2 0 1 0 4 0"/><path d="M15 17a2 2 0 1 0 4 0"/><path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13"/></svg>`

        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
          .setHTML(createTruckPopupHTML(truck))

        const marker = new mapboxgl.Marker(el)
          .setLngLat([truck.lng, truck.lat])
          .setPopup(popup)
          .addTo(map)

        el.addEventListener('click', () => {
          setSelectedTruck(truck.id)
          setExpandedTruck(truck.id)
        })
        markersRef.current.set(truck.id, marker)
      }
    })
  }, [trucks, mapLoaded, selectedTruck, dataReady])

  // ── Interactions ───────────────────────────────────────────────────────────

  const selectAndFocus = useCallback((truck: DemoTruck, idx: number) => {
    setSelectedTruck(truck.id)
    setExpandedTruck(prev => prev === truck.id ? null : truck.id)

    const map = mapRef.current
    if (!map) return

    const geo = routeGeos[idx]
    if (geo?.fullCoords.length) {
      const bounds = new mapboxgl.LngLatBounds()
      geo.fullCoords.forEach(c => bounds.extend(c as [number, number]))
      map.fitBounds(bounds, { padding: 80, duration: 1000 })
    }
  }, [routeGeos])

  const focusPlant = useCallback(() => {
    setSelectedTruck(null)
    setExpandedTruck(null)
    mapRef.current?.flyTo({ center: [PLANT.lng, PLANT.lat], zoom: 11, duration: 1000 })
    plantMarkerRef.current?.togglePopup()
  }, [])

  // ── Stats ──────────────────────────────────────────────────────────────────

  const enRutaCount = trucks.filter(t => t.status === 'en_ruta' && t.currentLeg < t.stops.length).length
  const deliveringCount = trucks.filter(t => t.status === 'entregando').length
  const returningCount = trucks.filter(t => t.status === 'en_ruta' && t.currentLeg === t.stops.length).length
  const totalDelivered = trucks.reduce((s, t) => s + t.stops.filter(st => st.delivered).length, 0)
  const totalStops = trucks.reduce((s, t) => s + t.stops.length, 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <Truck className="w-6 h-6 text-blue-700" />
          <h1 className="text-lg font-bold text-gray-900">Fleet Tracker</h1>
          <span className="text-sm text-gray-400">|</span>
          <div className="flex items-center gap-2">
            <Factory className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">Coatings Renner Chile SpA</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/optimizar" className="text-xs text-green-600 hover:text-green-800 font-medium px-2 py-1 rounded hover:bg-green-50">
            Optimizar Rutas
          </a>
          <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-medium border border-blue-100">
            DEMO
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[340px] bg-white border-r border-gray-200 flex flex-col shrink-0 z-10">
          {/* Plant card */}
          <button
            onClick={focusPlant}
            className="p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white hover:from-blue-100 transition-colors text-left"
          >
            <div className="flex items-center gap-2 mb-2">
              <Factory className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-sm text-blue-900">Planta Pudahuel</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">{PLANT.address}</p>
            <div className="grid grid-cols-4 gap-1.5">
              <StatCard value={enRutaCount} label="En Ruta" color="text-green-600" />
              <StatCard value={deliveringCount} label="Entregando" color="text-amber-500" />
              <StatCard value={returningCount} label="Volviendo" color="text-indigo-500" />
              <StatCard value={`${totalDelivered}/${totalStops}`} label="Entregas" color="text-gray-700" />
            </div>
          </button>

          {/* Fleet header */}
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 text-sm">
              <Users className="w-4 h-4" />
              Flota Activa
            </h2>
            <span className="text-xs text-gray-400">{trucks.length} camiones</span>
          </div>

          {/* Truck list */}
          <div className="flex-1 overflow-y-auto">
            {!dataReady ? (
              <div className="flex items-center justify-center gap-2 p-8 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Cargando rutas...
              </div>
            ) : (
              trucks.map((truck, i) => (
                <TruckCard
                  key={truck.id}
                  truck={truck}
                  isExpanded={expandedTruck === truck.id}
                  isSelected={selectedTruck === truck.id}
                  onSelect={() => selectAndFocus(truck, i)}
                />
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

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className="bg-white rounded-lg p-1.5 text-center border border-gray-100">
      <div className={`text-base font-bold ${color}`}>{value}</div>
      <div className="text-[9px] text-gray-500 leading-tight">{label}</div>
    </div>
  )
}

function TruckCard({
  truck,
  isExpanded,
  isSelected,
  onSelect,
}: {
  truck: DemoTruck
  isExpanded: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  const delivered = truck.stops.filter(s => s.delivered).length
  const displayStatus = getDisplayStatus(truck)
  const statusClass = getStatusClass(truck)
  const destName = getCurrentDestName(truck)

  return (
    <div className={`border-b border-gray-100 ${isSelected ? 'bg-blue-50/50' : ''}`}>
      <button
        onClick={onSelect}
        className={`w-full text-left px-4 py-3 hover:bg-gray-50/80 transition-colors ${
          isSelected ? 'border-l-[3px]' : ''
        }`}
        style={isSelected ? { borderLeftColor: truck.color } : undefined}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: truck.color }} />
            <span className="font-medium text-gray-900 text-sm">{truck.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusClass}`}>
              {displayStatus}
            </span>
            {isExpanded
              ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400 mb-1">
          <span className="flex items-center gap-1"><Truck className="w-3 h-3" />{truck.plate}</span>
          <span>{truck.speed} km/h</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Navigation className="w-3 h-3" />
          {destName}
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
          <Package className="w-3 h-3" />
          {delivered}/{truck.stops.length} paradas
        </div>
        {/* Segmented progress bar */}
        <div className="mt-2 flex gap-0.5">
          {truck.stops.map((_, si) => (
            <div key={si} className="h-1 rounded-full flex-1 overflow-hidden bg-gray-200">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: truck.stops[si].delivered ? '100%'
                    : si === truck.currentLeg && truck.currentLeg < truck.stops.length
                      ? `${Math.round(truck.segmentProgress * 100)}%`
                      : '0%',
                  background: truck.color,
                  opacity: truck.stops[si].delivered ? 1 : 0.5,
                }}
              />
            </div>
          ))}
        </div>
      </button>

      {/* Expanded stop list */}
      {isExpanded && (
        <div className="px-4 pb-3 bg-gray-50/70">
          <div className="ml-1 border-l-2 border-gray-200 pl-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-blue-600 font-medium py-0.5">
              <Factory className="w-3 h-3" />
              Planta Pudahuel
            </div>
            {truck.stops.map((stop, si) => {
              const isDelivered = stop.delivered
              const isCurrent = si === truck.currentLeg && truck.currentLeg < truck.stops.length
              return (
                <div key={si} className={`flex items-start gap-2 text-xs py-0.5 ${isCurrent ? 'font-medium' : ''}`}>
                  {isDelivered ? (
                    <CircleCheck className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" />
                  ) : isCurrent ? (
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 animate-pulse"
                      style={{ background: truck.color }}
                    />
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className={
                      isDelivered ? 'text-gray-400 line-through'
                        : isCurrent ? 'text-gray-900'
                        : 'text-gray-500'
                    }>
                      {stop.name}
                    </span>
                    {isCurrent && (
                      <span
                        className="ml-1.5 text-[10px] px-1 py-0.5 rounded text-white"
                        style={{ background: truck.color }}
                      >
                        {truck.status === 'entregando' ? 'Entregando' : 'En camino'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
            <div className="flex items-center gap-2 text-xs text-blue-600 font-medium py-0.5">
              <MapPin className="w-3 h-3" />
              Retorno a planta
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Popup HTML ───────────────────────────────────────────────────────────────

function createTruckPopupHTML(truck: DemoTruck): string {
  const delivered = truck.stops.filter(s => s.delivered).length
  const displayStatus = getDisplayStatus(truck)
  const statusColor = truck.status === 'entregando' ? '#f59e0b'
    : truck.currentLeg === truck.stops.length ? '#6366f1'
    : '#16a34a'

  const stopsHTML = truck.stops.map((s, i) => {
    const isCurr = i === truck.currentLeg && truck.currentLeg < truck.stops.length
    return `
    <div style="display: flex; align-items: center; gap: 6px; font-size: 11px; padding: 2px 0;">
      <span style="width: 16px; height: 16px; border-radius: 50%; background: ${s.delivered ? '#16a34a' : isCurr ? truck.color : '#cbd5e1'};
        color: white; display: flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700; flex-shrink: 0;">${i + 1}</span>
      <span style="color: ${s.delivered ? '#9ca3af' : '#374151'}; ${s.delivered ? 'text-decoration: line-through;' : ''}">${s.name}</span>
      ${s.delivered ? '<span style="color: #16a34a; font-size: 10px;">✓</span>' : ''}
    </div>
  `}).join('')

  return `
    <div style="font-family: system-ui, sans-serif; min-width: 210px; padding: 2px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
        <div style="width: 10px; height: 10px; border-radius: 50%; background: ${truck.color};"></div>
        <div style="font-weight: 700; font-size: 14px;">${truck.name}</div>
      </div>
      <div style="font-size: 11px; color: #999; margin-bottom: 6px;">${truck.plate} · ${truck.speed} km/h</div>
      <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: ${statusColor};"></span>
        <span style="font-size: 12px; color: #444; font-weight: 500;">${displayStatus}</span>
        <span style="font-size: 11px; color: #888; margin-left: auto;">${delivered}/${truck.stops.length} entregas</span>
      </div>
      <div style="font-size: 12px; color: #555; font-weight: 500; margin-bottom: 4px;">→ ${getCurrentDestName(truck)}</div>
      <div style="border-top: 1px solid #eee; margin-top: 6px; padding-top: 6px;">
        <div style="font-size: 10px; color: #999; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Ruta</div>
        ${stopsHTML}
      </div>
    </div>
  `
}
