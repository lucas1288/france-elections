/**
 * Generates a minimal placeholder GeoJSON with simple square polygons
 * for the 20 sample communes, laid out in a rough grid over metropolitan France.
 *
 * TODO: Replace with real simplified commune GeoJSON from:
 *   https://france-geojson.gregoiredavid.fr/
 *   or generate via: mapshaper communes.geojson -simplify 5% -o communes-simplified.geojson
 *
 * The INSEE code in properties.code is the join key to election data.
 */

import { writeFileSync } from 'fs'

const COMMUNES = [
  { code: '75056', nom: 'Paris', dep: '75', reg: '11', lon: 2.347, lat: 48.859 },
  { code: '13055', nom: 'Marseille', dep: '13', reg: '93', lon: 5.369, lat: 43.297 },
  { code: '69123', nom: 'Lyon', dep: '69', reg: '84', lon: 4.835, lat: 45.764 },
  { code: '31555', nom: 'Toulouse', dep: '31', reg: '76', lon: 1.444, lat: 43.605 },
  { code: '06088', nom: 'Nice', dep: '06', reg: '93', lon: 7.262, lat: 43.710 },
  { code: '44109', nom: 'Nantes', dep: '44', reg: '52', lon: -1.554, lat: 47.218 },
  { code: '67482', nom: 'Strasbourg', dep: '67', reg: '44', lon: 7.750, lat: 48.574 },
  { code: '34172', nom: 'Montpellier', dep: '34', reg: '76', lon: 3.877, lat: 43.611 },
  { code: '33063', nom: 'Bordeaux', dep: '33', reg: '75', lon: -0.578, lat: 44.838 },
  { code: '59350', nom: 'Lille', dep: '59', reg: '32', lon: 3.065, lat: 50.629 },
  { code: '35238', nom: 'Rennes', dep: '35', reg: '53', lon: -1.678, lat: 48.114 },
  { code: '76540', nom: 'Rouen', dep: '76', reg: '28', lon: 1.099, lat: 49.444 },
  { code: '38185', nom: 'Grenoble', dep: '38', reg: '84', lon: 5.724, lat: 45.188 },
  { code: '34090', nom: 'Nîmes', dep: '34', reg: '76', lon: 4.360, lat: 43.837 },
  { code: '86194', nom: 'Poitiers', dep: '86', reg: '75', lon: 0.341, lat: 46.580 },
  { code: '64445', nom: 'Pau', dep: '64', reg: '75', lon: -0.370, lat: 43.296 },
  { code: '57463', nom: 'Metz', dep: '57', reg: '44', lon: 6.175, lat: 49.119 },
  { code: '51454', nom: 'Reims', dep: '51', reg: '44', lon: 4.031, lat: 49.258 },
  { code: '49007', nom: 'Angers', dep: '49', reg: '52', lon: -0.555, lat: 47.473 },
  { code: '29232', nom: 'Brest', dep: '29', reg: '53', lon: -4.486, lat: 48.390 },
]

// Creates a square polygon around a lon/lat centroid.
// 1° ≈ 80–110 km — large enough to click in the prototype.
// Real commune polygons will be much smaller and tile the entire country.
function makeSquare(lon, lat, size = 1.0) {
  const hs = size / 2
  return [
    [lon - hs, lat - hs],
    [lon + hs, lat - hs],
    [lon + hs, lat + hs],
    [lon - hs, lat + hs],
    [lon - hs, lat - hs],
  ]
}

const geojson = {
  type: 'FeatureCollection',
  features: COMMUNES.map((c) => ({
    type: 'Feature',
    properties: {
      code: c.code,
      nom: c.nom,
      codeDepartement: c.dep,
      codeRegion: c.reg,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [makeSquare(c.lon, c.lat)],
    },
  })),
}

writeFileSync(
  'public/data/geo/communes-simplified.geojson',
  JSON.stringify(geojson, null, 2),
)

console.log(`Generated placeholder GeoJSON with ${COMMUNES.length} features.`)
console.log(
  'TODO: Replace with real simplified commune GeoJSON from france-geojson.gregoiredavid.fr',
)
