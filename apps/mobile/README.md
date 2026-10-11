# HazardWatch mobile (Flutter)

iOS and Android app: an extra channel next to the web, PWA and extension, reading the same public API.

- Theme: `lib/theme/hw_theme.dart` is copied verbatim from the HazardWatch Mobile design system (its `tokens.json` is
  in `design/`); never edit it by hand, replace it when the design system changes. `hw_app_theme.dart` adds the web's
  colour-blind mode. A test fails if the design system's colours drift from `packages/tokens/tokens.json`.
- Thai/English strings: `lib/l10n/*.arb`, generated from `packages/core/src/i18n/messages.ts` plus app-only wording in
  `l10n/mobile_messages.json` (`pnpm --filter @hw/mobile generate`). `pnpm test` fails if a generated file is stale.
- Bangkok street flooding and rain: BMA blocks cloud IPs, so when the server's `flood`/`rain` feed is failing or older
  than 10 minutes the app fetches BMA itself (`lib/bma/`), cached for 10 minutes, and shows it only on that phone; it
  is never uploaded. Severities use the thresholds in `lib/bma/rules.dart` (checked against
  `packages/core/src/config.ts` by a test) and the district outlines in `lib/bma/bangkok_districts.g.dart`, generated
  from `apps/web/public/geo/districts.json` by `pnpm --filter @hw/mobile generate`.
- Map tab: the web map's street flooding, canal levels and PM2.5 plus rain gauges and regional earthquakes, from
  `/v1/snapshot` (and the phone's own BMA copy when the server's is failing), on OpenFreeMap vector tiles in the app's
  theme and language (`lib/map/`). Falls back to OSM raster tiles if the style can't load. Nothing loads until the tab
  is opened.
- Keys and signing files are never committed (see `.gitignore`).

```sh
flutter run
flutter test
flutter build apk --release
```

CI: `.github/workflows/mobile.yml` (analyze, test, Android APK artifact, iOS build without signing).
