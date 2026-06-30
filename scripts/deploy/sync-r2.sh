#!/usr/bin/env bash
# Upload public/data/** to the R2 bucket, preserving the `data/...` key layout the
# app expects (VITE_DATA_BASE_URL + `/data/...`). Uses your `wrangler login` session
# — no S3 API keys needed. Re-run any time data is regenerated.
#
# Usage:
#   wrangler login                 # once (you, in a browser)
#   BUCKET=france-elections-data ./scripts/deploy/sync-r2.sh
set -euo pipefail

BUCKET="${BUCKET:-france-elections-data}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DATA_DIR="$ROOT/public/data"

content_type() {
  case "$1" in
    *.json)     echo "application/json" ;;
    *.geojson)  echo "application/geo+json" ;;
    *.pmtiles)  echo "application/octet-stream" ;;  # range-requestable regardless
    *)          echo "application/octet-stream" ;;
  esac
}

cache_for() {
  # Tiles are cache-busted via ?v=N in code → safe to cache hard.
  # JSON has no busting yet → keep modest so re-uploads show up.
  case "$1" in
    *.pmtiles) echo "public, max-age=31536000, immutable" ;;
    *)         echo "public, max-age=3600" ;;
  esac
}

echo "Uploading public/data/** → r2://$BUCKET/data/ ..."
count=0
while IFS= read -r -d '' file; do
  key="data/${file#"$DATA_DIR"/}"
  npx wrangler r2 object put "$BUCKET/$key" \
    --file "$file" \
    --content-type "$(content_type "$file")" \
    --cache-control "$(cache_for "$file")" \
    --remote >/dev/null
  count=$((count + 1))
  printf '  [%2d] %s\n' "$count" "$key"
done < <(find "$DATA_DIR" -type f -print0)

echo "Applying CORS policy ..."
npx wrangler r2 bucket cors set "$BUCKET" --file "$ROOT/scripts/deploy/r2-cors.json"

echo "Done — $count objects uploaded to '$BUCKET'."
