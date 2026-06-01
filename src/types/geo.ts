import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'

export interface CommuneProperties {
  /** INSEE commune code */
  code: string
  nom: string
  codeDepartement: string
  codeRegion: string
}

export type CommuneFeatureCollection = FeatureCollection<
  Polygon | MultiPolygon,
  CommuneProperties
>
