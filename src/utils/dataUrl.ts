/**
 * Resolves a static data asset path (election JSON, vector tiles, geo files)
 * against an optional CDN / object-store base.
 *
 * All call sites pass the app-relative path exactly as the files live under
 * `public/` (e.g. `/data/elections/index.json`). By default `VITE_DATA_BASE_URL`
 * is unset, so the path is returned unchanged and assets are served from the
 * app's own origin — nothing changes for local dev or a plain static deploy.
 *
 * To move the heavy assets (tiles + full commune JSON) off-repo onto object
 * storage / a CDN, set `VITE_DATA_BASE_URL` to a root that mirrors the same
 * `data/...` layout (e.g. `https://cdn.example.com`). No code changes needed.
 */
const BASE = (import.meta.env.VITE_DATA_BASE_URL ?? '').replace(/\/$/, '')

export function dataUrl(path: string): string {
  return `${BASE}${path}`
}

/**
 * Like `dataUrl`, but returns an absolute `pmtiles://` URL. PMTiles' range
 * requests need a fully-qualified http(s) origin, so a relative `/data/...`
 * default is resolved against `window.location.origin`, while an absolute
 * `VITE_DATA_BASE_URL` (CDN) is used as-is.
 */
export function pmtilesUrl(path: string): string {
  const u = dataUrl(path)
  const abs = /^https?:\/\//.test(u) ? u : `${window.location.origin}${u}`
  return `pmtiles://${abs}`
}
