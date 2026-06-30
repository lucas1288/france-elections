#!/usr/bin/env bash
# Build the static app pointed at the R2 data bucket and deploy ONLY the app shell
# to Cloudflare Pages (the ~230 MB of data lives in R2, not in the Pages deploy).
#
# Usage:
#   VITE_DATA_BASE_URL=https://<your-r2-public-url> ./scripts/deploy/deploy-pages.sh
#   # VITE_DATA_BASE_URL must have NO trailing slash and resolve <url>/data/... on R2.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

: "${VITE_DATA_BASE_URL:?Set VITE_DATA_BASE_URL to the R2 public base (no trailing slash)}"
PROJECT="${PAGES_PROJECT:-france-elections}"

echo "Building with VITE_DATA_BASE_URL=$VITE_DATA_BASE_URL ..."
VITE_DATA_BASE_URL="$VITE_DATA_BASE_URL" npm run build

echo "Stripping bundled data from dist/ (served from R2 instead) ..."
rm -rf dist/data
du -sh dist

echo "Deploying app shell to Cloudflare Pages project '$PROJECT' (production) ..."
# Force the production branch so the URL is <project>.pages.dev (matches CORS),
# regardless of which git branch you run this from.
npx wrangler pages deploy dist --project-name "$PROJECT" --branch "${PAGES_BRANCH:-main}"

echo "Done."
