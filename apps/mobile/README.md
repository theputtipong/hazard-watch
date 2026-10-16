# HazardWatch mobile (Flutter)

iOS and Android app: an extra channel next to the web, PWA and extension, reading the same public API.

- Theme: `lib/theme/hw_theme.dart` is copied verbatim from the HazardWatch Mobile design system (its `tokens.json` is
  in `design/`); never edit it by hand, replace it when the design system changes. `hw_app_theme.dart` adds the web's
  colour-blind mode. A test fails if the design system's colours drift from `packages/tokens/tokens.json`.
- Thai/English strings: `lib/l10n/*.arb`, generated from `packages/core/src/i18n/messages.ts` plus app-only wording in
  `l10n/mobile_messages.json` (`pnpm --filter @hw/mobile generate`). `pnpm test` fails if a generated file is stale.
- Bangkok street flooding and rain: BMA blocks cloud IPs, so when the server's `flood`/`rain` feed is failing or older
  than 10 minutes the app fetches BMA itself (`lib/bma/`), cached for 10 minutes, and shows it on that phone. After
  each good download it also relays the raw list to `POST /v1/relay/bma/<kind>`, fire-and-forget (failures are ignored;
  the server takes it only from Thai IPs and re-checks it). Severities use the thresholds in `lib/bma/rules.dart`
  (checked against `packages/core/src/config.ts` by a test) and the district outlines in
  `lib/bma/bangkok_districts.g.dart`, generated from `apps/web/public/geo/districts.json` by
  `pnpm --filter @hw/mobile generate`.
- Map tab: the web map's street flooding, canal levels and PM2.5 plus rain gauges and regional earthquakes, from
  `/v1/snapshot` (and the phone's own BMA copy when the server's is failing), on OpenFreeMap vector tiles in the app's
  theme and language (`lib/map/`). Falls back to OSM raster tiles if the style can't load. Nothing loads until the tab
  is opened.
- Alerts tab: the followed district's alerts from `/v1/area` (flood and rain from the phone's BMA copy when that is
  what Home shows), grouped by level, most severe first.
- Phone notifications (off until turned on in Settings, which asks for permission): no Firebase or push service. A
  background task (`workmanager`: WorkManager on Android about every 15 minutes, BGAppRefresh on iOS whenever the
  system allows) fetches the district's report and shows a local notification (`flutter_local_notifications`) only for
  a new alert, a level that rose, or a new earthquake inside the person's magnitude/distance choice
  (`push.quakeChoices`). What was sent is kept in shared_preferences; the rules are in `lib/alerts/notify_rules.dart`
  (3 h cooldown and PM2.5 threshold as Web Push, checked against `packages/core/src/config.ts` by a test).
- Data sources: every data card, alert card and map sheet credits its source with a "Data from X" link to the agency's
  site, and Settings → Data sources lists every source with its link (`lib/sources_meta.g.dart`, generated from
  `packages/core/src/sources-meta.ts`) plus the notice that the app is not a government service (Google Play's
  Misleading Claims policy, see `store/policy-resubmit.md`).
- Keys and signing files are never committed (see `.gitignore`).

```sh
flutter run
flutter test
flutter build apk --release
```

## Release builds

- Android: release builds are signed with the Play upload key when a `key.properties` is found (`HW_KEY_PROPERTIES`,
  or `android/key.properties`, gitignored) with `storePassword`, `keyPassword`, `keyAlias` and `storeFile` (relative
  to the properties file). The key lives in the owner's offline backup, not in the repo. Without it a release APK
  falls back to the debug key (fine for testing, not for Play), but a release AAB stops with a `GradleException`
  instead of being signed with the debug key; the Gradle property `requireUploadKey` extends that to release APKs.

  ```sh
  HW_KEY_PROPERTIES=/path/to/key.properties flutter build appbundle --release --obfuscate --split-debug-info=build/symbols
  ```

  Store builds are obfuscated; keep `build/symbols` of each upload (CI keeps it 90 days as
  `hazardwatch-android-symbols-<run>`) to read crash stack traces with `flutter symbolize`. Play only accepts a
  version code higher than every earlier upload, rejected ones included. A local build uses the `+N` in
  `pubspec.yaml`; a CI build (`hazardwatch-android-aab-<run>`) uses the run number, which is far higher, so once a CI
  AAB has been uploaded keep using CI (or raise `+N` past that run number). Both are signed with the same upload key.

- iOS: `flutter build ipa --release` once a signing team is set in Xcode.
- Launcher icons and Play graphics: `node tools/icons/make-icons.mjs`. Store text, data-safety answers and the manual
  store steps: `store/`.

CI: `.github/workflows/check-build-mobile.yml` (analyze, test, then one `android` job that builds the debug-signed APK artifact
and, outside pull requests, the signed AAB plus symbols artifacts once these repository secrets exist). The iOS build
without signing runs only on manual dispatch or `v*` tags.

```sh
base64 -i upload.jks | gh secret set ANDROID_KEYSTORE_BASE64 --repo theputtipong/hazard-watch
gh secret set ANDROID_KEY_PASSWORD --repo theputtipong/hazard-watch   # prompts; store and key passwords are the same
gh secret set ANDROID_KEY_ALIAS --repo theputtipong/hazard-watch      # optional, defaults to "upload"
```
