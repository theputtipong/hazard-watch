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
- Alerts tab: the followed district's alerts from `/v1/area` (flood and rain from the phone's BMA copy when that is
  what Home shows), grouped by level, most severe first.
- Phone notifications (off until turned on in Settings, which asks for permission): no Firebase or push service. A
  background task (`workmanager`: WorkManager on Android about every 15 minutes, BGAppRefresh on iOS whenever the
  system allows) fetches the district's report and shows a local notification (`flutter_local_notifications`) only for
  a new alert, a level that rose, or a new earthquake inside the person's magnitude/distance choice
  (`push.quakeChoices`). What was sent is kept in shared_preferences; the rules are in `lib/alerts/notify_rules.dart`
  (3 h cooldown and PM2.5 threshold as Web Push, checked against `packages/core/src/config.ts` by a test).
- Keys and signing files are never committed (see `.gitignore`).

```sh
flutter run
flutter test
flutter build apk --release
```

## Release builds

- Android: release builds are signed with the Play upload key when a `key.properties` is found (`HW_KEY_PROPERTIES`,
  or `android/key.properties`, gitignored) with `storePassword`, `keyPassword`, `keyAlias` and `storeFile` (relative
  to the properties file). Without it they fall back to the debug key, which Play rejects. The key lives in the
  owner's offline backup, not in the repo.

  ```sh
  HW_KEY_PROPERTIES=/path/to/key.properties flutter build appbundle --release
  ```

- iOS: `flutter build ipa --release` once a signing team is set in Xcode.
- Launcher icons and Play graphics: `node tools/icons/make-icons.mjs`. Store text, data-safety answers and the manual
  store steps: `store/`.

CI: `.github/workflows/mobile.yml` (analyze, test, debug-signed APK artifact, iOS build without signing, and a
signed AAB artifact in `android-release` once these repository secrets exist):

```sh
base64 -i upload.jks | gh secret set ANDROID_KEYSTORE_BASE64 --repo theputtipong/hazard-watch
gh secret set ANDROID_KEY_PASSWORD --repo theputtipong/hazard-watch   # prompts; store and key passwords are the same
gh secret set ANDROID_KEY_ALIAS --repo theputtipong/hazard-watch      # optional, defaults to "upload"
```
