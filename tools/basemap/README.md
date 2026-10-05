# Base map (Protomaps PMTiles in R2)

The web map's base layer is a single [PMTiles](https://docs.protomaps.com/pmtiles/) archive of
[Protomaps](https://protomaps.com/) vector tiles (OpenStreetMap data), stored in the Cloudflare R2
bucket `hw-basemap` and served by the ingest Worker. The Worker reads the object key from
`INGEST.basemapKey` in `apps/ingest/src/config.ts`.

## Why

- The OpenStreetMap tile servers' usage policy forbids using them as the base map of a public app.
- Stadia Maps was only a trial; a paid tile service is an ongoing cost and an outside dependency.
- One self-hosted file costs only R2 storage (~0.75 GB) plus R2 read operations (no egress fees), and
  keeps working if a third-party service changes its terms.

## What the file covers

| Setting | Value | Meaning |
| --- | --- | --- |
| `BBOX` | `95.5,4.5,108.5,21.5` | west,south,east,north: all of Thailand plus border areas of Myanmar, Laos, Cambodia, Malaysia and the Gulf/Andaman coasts |
| `MAXZOOM` | `14` | Protomaps' maximum; street-level detail. MapLibre overzooms beyond z14, so no detail is lost |
| Tile type | `mvt`, gzip | Vector tiles, each tile gzip-compressed inside the archive (the Worker must send `Content-Encoding: gzip` or decompress) |
| Size | ~750 MB | Build `20261005`: 750,175,832 bytes, 343k unique tiles |

## Build

Needs the `pmtiles` CLI (`brew install pmtiles`). Takes about a minute on a fast connection.

```sh
tools/basemap/build.sh               # latest build from build-metadata.protomaps.dev
tools/basemap/build.sh 20261005      # a specific build (YYYYMMDD)
BBOX=... MAXZOOM=... OUT_DIR=... tools/basemap/build.sh   # override defaults
```

All defaults are at the top of `build.sh`. The output goes to `~/hw-basemap/thailand-<YYYYMMDD>.pmtiles`
(outside the repo). The script extracts, runs `pmtiles show` and `pmtiles verify`, and prints the
upload command. It never uploads.

Protomaps keeps only recent daily builds online, so use a build from the last few days.

## One-time setup

1. Enable R2 in the Cloudflare dashboard (R2 Object Storage, accept the plan).
2. Create the bucket:
   ```sh
   pnpm --filter @hw/ingest exec wrangler r2 bucket create hw-basemap
   ```
3. For uploads over 300 MiB (always the case for this file), create an R2 API token:
   Dashboard → R2 → **Manage R2 API Tokens** → **Create API token** → permission
   **Object Read & Write**, limited to bucket `hw-basemap`. Copy the **Access Key ID** and
   **Secret Access Key** (shown once) and note your **Account ID** (R2 overview page).
4. Store them as an AWS CLI profile (`aws` is installed via Homebrew: `brew install awscli`):
   ```sh
   aws configure --profile r2
   # Access Key ID / Secret Access Key: from step 3
   # Default region: auto
   # Output format: json
   ```

## Upload

`wrangler r2 object put` only accepts files up to 300 MiB (wrangler 4.147 rejects larger files), so
this archive is uploaded through R2's S3-compatible API, where the AWS CLI does a multipart upload:

```sh
export CF_ACCOUNT_ID=<your account id>
AWS_PROFILE=r2 aws s3 cp ~/hw-basemap/thailand-20261005.pmtiles s3://hw-basemap/thailand-20261005.pmtiles \
  --endpoint-url https://$CF_ACCOUNT_ID.r2.cloudflarestorage.com \
  --content-type application/vnd.pmtiles

# check it arrived with the right size
AWS_PROFILE=r2 aws s3 ls s3://hw-basemap/ --endpoint-url https://$CF_ACCOUNT_ID.r2.cloudflarestorage.com
```

rclone works too (`brew install rclone`; remote type `s3`, provider `Cloudflare`, same keys and
endpoint): `rclone copyto ~/hw-basemap/thailand-20261005.pmtiles r2:hw-basemap/thailand-20261005.pmtiles`.

If a future extract is ever under 300 MiB (e.g. a smaller bbox or lower max zoom), wrangler alone is enough:

```sh
pnpm --filter @hw/ingest exec wrangler r2 object put hw-basemap/thailand-<YYYYMMDD>.pmtiles \
  --file ~/hw-basemap/thailand-<YYYYMMDD>.pmtiles --content-type application/vnd.pmtiles --remote
```

## Switch to the new file

1. Set `INGEST.basemapKey` in `apps/ingest/src/config.ts` to the new key, e.g. `'thailand-20261005.pmtiles'`.
2. Deploy the ingest Worker (`pnpm --filter @hw/ingest run deploy`) and check the map in the web app.
3. Delete the previous object so you only pay for one copy:
   ```sh
   pnpm --filter @hw/ingest exec wrangler r2 object delete hw-basemap/thailand-<OLD>.pmtiles --remote
   ```
4. Delete the old local file in `~/hw-basemap/` if you no longer need it.

## Refresh

Roads, buildings and place names change slowly, so refresh every few months (or after a known
large OSM change in the area): run `build.sh`, upload, switch the key, delete the old object.
Using a new key each time (instead of overwriting) means a cached old archive never mixes with
new tile offsets, and rollback is just changing the key back before step 3.
