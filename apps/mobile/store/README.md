# Store release

- `listing.md`: Thai and English store text, category, rating, contact.
- `data-safety.md`: Play Data safety and App Store App Privacy answers, plus the privacy-policy section the app
  still needs.
- `icon-512.png`, `feature-graphic-1024x500.png`: Play graphics, generated with the launcher icons by
  `node tools/icons/make-icons.mjs` (design-system artwork from `tools/icons/source`).

| | Value |
|---|---|
| Android applicationId / iOS bundle id | `com.pdouvch.hazardwatch` (cannot change after the first upload) |
| Version | `version:` in `pubspec.yaml` (`1.0.0+1`); CI overrides the build number with the run number |
| Android upload key | alias `upload`, kept with its `key.properties` in the owner's offline backup, never in git |

## Before submitting (both stores)

1. Map and Alerts tabs still show "coming soon". Apple rejects placeholder content (guideline 2.1/4.2): hide the two
   tabs or ship them before the first App Store review. Play is more lenient but reviewers may flag it too.
2. Add the mobile section to the privacy policy (`data-safety.md`) and deploy the web.
3. Screenshots in Thai and English: phone (Play min 2, 16:9 or 9:16; App Store 6.9" 1320x2868 or 6.5" 1284x2778),
   plus iPad 13" if the iPad build stays enabled (`TARGETED_DEVICE_FAMILY` includes iPad). Use light and dark themes.

## Google Play (manual)

1. Create a Google Play developer account (personal accounts must run a closed test with 12+ testers for 14 days
   before production access).
2. Create the app "HazardWatch เฝ้าระวังภัย", default language Thai, free, category Weather.
3. Enrol in Play App Signing (default). Upload the first AAB signed with the upload key (`flutter build appbundle`
   with key.properties, or the `android-release` CI artifact). Google keeps the app signing key; ours is only the
   upload key, so a lost upload key can be reset through Play Console support.
4. Fill in store listing, Data safety, content rating (IARC), target audience, ads (none), government app (no),
   news app (no), then roll out to internal testing first.

## App Store (manual)

1. Join the Apple Developer Program (individual or organisation, 99 USD/year).
2. In Certificates, Identifiers & Profiles register the App ID `com.pdouvch.hazardwatch` (no extra capabilities
   needed yet; push notifications later).
3. Open `ios/Runner.xcworkspace` in Xcode → Runner target → Signing & Capabilities: tick "Automatically manage
   signing" and pick the team. This writes `DEVELOPMENT_TEAM` into `project.pbxproj`; that id is not secret and can
   be committed.
4. In App Store Connect create the app: name, primary language Thai, bundle id above, SKU `hazardwatch`.
5. `flutter build ipa --release`, then upload `build/ios/ipa/*.ipa` with Transporter or Xcode Organizer. Export
   compliance is pre-answered (`ITSAppUsesNonExemptEncryption = false`: HTTPS only).
6. Fill in App Privacy, age rating, listing text, screenshots and review notes ("No login required. Tap 'Use my
   location' or pick any district, e.g. Bang Rak, Bangkok."), then submit through TestFlight first.
7. Optional for CI uploads: an App Store Connect API key (`.p8`) stored as a GitHub secret. Not set up.
