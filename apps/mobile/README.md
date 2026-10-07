# HazardWatch mobile (Flutter)

iOS and Android app: an extra channel next to the web, PWA and extension, reading the same public API.

- Theme: `lib/theme/hw_theme.dart` is copied verbatim from the HazardWatch Mobile design system (its `tokens.json` is
  in `design/`); never edit it by hand, replace it when the design system changes. `hw_app_theme.dart` adds the web's
  colour-blind mode. A test fails if the design system's colours drift from `packages/tokens/tokens.json`.
- Thai/English strings: `lib/l10n/*.arb`, generated from `packages/core/src/i18n/messages.ts` plus app-only wording in
  `l10n/mobile_messages.json` (`pnpm --filter @hw/mobile generate`). `pnpm test` fails if a generated file is stale.
- Keys and signing files are never committed (see `.gitignore`).

```sh
flutter run
flutter test
flutter build apk --release
```

CI: `.github/workflows/mobile.yml` (analyze, test, Android APK artifact, iOS build without signing).
