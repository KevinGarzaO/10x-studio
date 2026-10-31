'use client'

import { useMemo, useState } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { FeatureCollection, Geometry } from 'geojson'
import type { Topology, GeometryCollection } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import { countryName } from './traffic'

export interface MapPoint {
  city: string
  country: string
  region: string | null
  latitude: number
  longitude: number
  sessions: number
  people: number
  engaged: number
}

const WIDTH = 960
const HEIGHT = 500

/** El nombre en inglés con el que world-atlas llama a algunos países, cuando no coincide con el del navegador. */
const ATLAS_ALIASES: Record<string, string> = {
  US: 'United States of America', CZ: 'Czechia', DO: 'Dominican Rep.', BO: 'Bolivia', VE: 'Venezuela', KR: 'South Korea', KP: 'North Korea',
  RU: 'Russia', TZ: 'Tanzania', CD: 'Dem. Rep. Congo', CG: 'Congo', BA: 'Bosnia and Herz.', GB: 'United Kingdom', SY: 'Syria', IR: 'Iran',
  LA: 'Laos', MD: 'Moldova', CI: "Côte d'Ivoire", SS: 'S. Sudan', CF: 'Central African Rep.', GQ: 'Eq. Guinea', MK: 'North Macedonia', EH: 'W. Sahara',
}

let englishNames: Intl.DisplayNames | null = null
const atlasName = (code: string): string => {
  if (ATLAS_ALIASES[code]) return ATLAS_ALIASES[code]
  try {
    englishNames ??= new Intl.DisplayNames(['en'], { type: 'region' })
    return englishNames.of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Mapa del mundo en SVG (sin servicios externos ni llaves): los países sombreados según sus sesiones y una burbuja por ciudad
 * en su posición. La burbuja es la posición de la CIUDAD, no la de la persona. Al pasar el cursor, el detalle.
 */
export function WorldMap({ points, countries }: { points: MapPoint[]; countries: { value: string; sessions: number }[] }) {
  const [hover, setHover] = useState<string | null>(null)

  const { paths, projection } = useMemo(() => {
    const topology = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>
    const collection = feature(topology, topology.objects.countries) as unknown as FeatureCollection<Geometry, { name: string }>
    const proj = geoNaturalEarth1().fitSize([WIDTH, HEIGHT], { type: 'Sphere' } as never)
    const path = geoPath(proj)
    return {
      projection: proj,
      paths: collection.features.map(item => ({ name: item.properties.name, d: path(item) ?? '' })).filter(item => item.d),
    }
  }, [])

  // Sesiones por nombre de país del atlas, para sombrear.
  const byAtlasName = useMemo(() => {
    const map = new Map<string, { code: string; sessions: number }>()
    for (const row of countries) map.set(atlasName(row.value), { code: row.value, sessions: row.sessions })
    return map
  }, [countries])

  const maxCountry = Math.max(1, ...countries.map(row => row.sessions))
  const maxCity = Math.max(1, ...points.map(point => point.sessions))

  return (
    <div className="panel-map" role="img" aria-label={`Mapa de visitas: ${points.length} ciudades`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        <rect width={WIDTH} height={HEIGHT} className="panel-map-sea" />
        {paths.map(item => {
          const hit = byAtlasName.get(item.name)
          const alpha = hit ? 0.18 + 0.5 * (hit.sessions / maxCountry) : 0
          return (
            <path key={item.name} d={item.d} className="panel-map-land" style={hit ? { fill: `rgba(16,185,129,${alpha})` } : undefined}>
              <title>{hit ? `${countryName(hit.code)}: ${hit.sessions} ${hit.sessions === 1 ? 'sesión' : 'sesiones'}` : item.name}</title>
            </path>
          )
        })}
        {points.map(point => {
          const position = projection([point.longitude, point.latitude])
          if (!position) return null
          const key = `${point.city}|${point.country}`
          const radius = 4 + 14 * Math.sqrt(point.sessions / maxCity)
          return (
            <circle
              key={key}
              cx={position[0]}
              cy={position[1]}
              r={radius}
              className={`panel-map-city${hover === key ? ' hover' : ''}`}
              onMouseEnter={() => setHover(key)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${point.city}, ${countryName(point.country)}: ${point.sessions} ${point.sessions === 1 ? 'sesión' : 'sesiones'} · ${point.people} ${point.people === 1 ? 'persona' : 'personas'}`}</title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}
