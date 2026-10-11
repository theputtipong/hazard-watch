# Data safety (Play) and App Privacy (App Store)

Based on what the app does today (alerts are built on the phone, no server push, no account, no analytics or crash
SDK). Re-check this whenever a feature or dependency is added; server push alerts would change the answers.

## What the app actually sends

| Data | Where it goes | Stored? |
|---|---|---|
| Approximate location (Android `ACCESS_COARSE_LOCATION`, iOS low accuracy), only when the person taps "use my location" | `GET /v1/area?lat=&lng=` on api.hazard.pdouvch.com, once, to find the district | No. The answer is cached by district id, not by coordinates; Cloudflare request logs are not kept by us |
| Chosen district id | `GET /v1/area?district=` | No |
| Nothing personal | weather.bangkok.go.th (BMA flood/rain feeds, fetched by the phone when our server's copy is stale) | BMA sees the phone's IP address, like any website |
| Language, theme, colour mode, followed district | On the device only (shared preferences) | Device only; removed on uninstall |

Like the web and extension, the app rounds coordinates to two decimals (about 1 km) before sending them
(`lib/api/hazard_api.dart`), matching the privacy policy.

## Google Play: Data safety form

- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS only)
- Do you provide a way for users to request deletion? **Not applicable / no data is retained**; answer "No" to the
  account-deletion question because there are no accounts.
- Data types:
  - **Location → Approximate location**: Collected **yes**, Shared **no**. Processed ephemerally **yes**.
    Required or optional: **optional** (the district can be picked by hand). Purpose: **App functionality**.
  - Everything else (personal info, financial, health, messages, photos, audio, files, calendar, contacts,
    app activity, web browsing, app info and performance, device or other IDs): **not collected**.
- Ads: **No ads**. Target audience: 18+ is simplest (avoids the Families policy); the content itself is suitable for
  all ages.

## App Store: App Privacy ("nutrition label")

- Data used to track you: **None**.
- Data linked to you: **None**.
- Data not linked to you: **Location → Coarse Location**, purpose **App Functionality**. (If you treat the
  coordinates as never stored and only processed in real time, Apple allows answering "Data Not Collected"; listing
  coarse location is the safer choice.)
- Privacy policy URL: https://hazard.pdouvch.com/en/privacy

## Privacy policy

The "Mobile app (Android/iOS)" section of `apps/web/src/content/privacy.ts` covers the app. Update it together with
this file.
