#!/usr/bin/env bash
# Usage: [BUILD=... BBOX=... MAXZOOM=... OUT_DIR=...] tools/basemap/build.sh [BUILD]   (prints upload commands, never uploads)
set -euo pipefail

BUILDS_URL="${BUILDS_URL:-https://build-metadata.protomaps.dev/builds.json}"
BUILD_BASE_URL="${BUILD_BASE_URL:-https://build.protomaps.com}"
BUILD="${1:-${BUILD:-}}"                       # YYYYMMDD; empty = latest in builds.json
BBOX="${BBOX:-95.5,4.5,108.5,21.5}"            # west,south,east,north: Thailand + neighbours
MAXZOOM="${MAXZOOM:-14}"                       # Protomaps max zoom; the client overzooms past it
OUT_DIR="${OUT_DIR:-$HOME/hw-basemap}"         # outside the repo (files are ~750 MB)
REGION="${REGION:-thailand}"
R2_BUCKET="${R2_BUCKET:-hw-basemap}"
WRANGLER_LIMIT_MB=300                          # `wrangler r2 object put` rejects files above 300 MiB

command -v pmtiles >/dev/null || { echo "pmtiles CLI not found (brew install pmtiles)" >&2; exit 1; }

if [[ -z "$BUILD" ]]; then
  BUILD="$(curl -fsSL "$BUILDS_URL" | python3 -c 'import json,sys; print(json.load(sys.stdin)[-1]["key"].removesuffix(".pmtiles"))')"
  echo "Latest Protomaps build: $BUILD"
fi
[[ "$BUILD" =~ ^[0-9]{8}$ ]] || { echo "BUILD must be YYYYMMDD, got '$BUILD'" >&2; exit 1; }

KEY="${REGION}-${BUILD}.pmtiles"
OUT="${OUT_DIR}/${KEY}"
mkdir -p "$OUT_DIR"

if [[ -s "$OUT" ]]; then
  echo "Already extracted: $OUT (delete it to re-extract)"
else
  echo "Extracting $BBOX z0-$MAXZOOM from $BUILD_BASE_URL/$BUILD.pmtiles -> $OUT"
  pmtiles extract "$BUILD_BASE_URL/$BUILD.pmtiles" "$OUT.part" --bbox="$BBOX" --maxzoom="$MAXZOOM"
  mv "$OUT.part" "$OUT"
fi

echo
pmtiles show "$OUT" | grep -Ev '^(attribution|description|name|vector_layers|planetiler|pgf|osm|version)' || true
echo
pmtiles verify "$OUT"

SIZE_BYTES="$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")"
SIZE_MB=$(( SIZE_BYTES / 1024 / 1024 ))

cat <<EOF

Done: $OUT ($SIZE_MB MiB)
R2 object key: $KEY

Upload (not run). R2 must be enabled and the bucket created once:
  pnpm --filter @hw/ingest exec wrangler r2 bucket create $R2_BUCKET

EOF

if (( SIZE_MB <= WRANGLER_LIMIT_MB )); then
  cat <<EOF
  pnpm --filter @hw/ingest exec wrangler r2 object put $R2_BUCKET/$KEY --file "$OUT" --content-type application/vnd.pmtiles --remote
EOF
else
  cat <<EOF
  The file is over wrangler's ${WRANGLER_LIMIT_MB} MiB limit, so upload over R2's S3 API (multipart)
  with an R2 API token (see README.md "Upload"):
  AWS_PROFILE=r2 aws s3 cp "$OUT" s3://$R2_BUCKET/$KEY \\
    --endpoint-url https://\$CF_ACCOUNT_ID.r2.cloudflarestorage.com \\
    --content-type application/vnd.pmtiles
EOF
fi

cat <<EOF

Then set INGEST.basemapKey = '$KEY' in apps/ingest/src/config.ts, deploy the ingest Worker,
check the map, and delete the previous object (see README.md).
EOF
