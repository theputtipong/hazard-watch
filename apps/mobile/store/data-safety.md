# Data safety (Play) and App Privacy (App Store)

Based on what the app does today (alerts are built on the phone, no server push, no account, no analytics or crash
SDK). Checked again for 1.0.2 (BMA relay, NASA FIRMS / EONET / GIBS). Re-check this whenever a feature or dependency is added; server push alerts would change the answers.

## What the app actually sends

| Data | Where it goes | Stored? |
|---|---|---|
| Approximate location (Android `ACCESS_COARSE_LOCATION`, iOS low accuracy), only when the person taps "use my location" | `GET /v1/area?lat=&lng=` on api.hazard.pdouvch.com, once, to find the district | No. The answer is cached by district id, not by coordinates; Cloudflare request logs are not kept by us |
| Chosen district id | `GET /v1/area?district=` | No |
| Nothing personal | weather.bangkok.go.th (BMA flood/rain feeds, fetched by the phone when our server's copy is stale) | BMA sees the phone's IP address, like any website |
| Public BMA flood/rain list the phone just downloaded from weather.bangkok.go.th, unchanged (relay) | `POST /v1/relay/bma/flood` or `/rain` on api.hazard.pdouvch.com, in the background after a good BMA download, from the app and from the background alert check (`lib/bma/device_bma.dart`, `lib/api/hazard_api.dart`) | Only the public BMA data, to serve all users. No personal data, no location, no district, no settings, no device or user identifier (headers: `content-type` only). The server accepts it only from Thai IP addresses and does not log IP addresses |
| Nothing personal | NASA FIRMS (fire hotspots) and NASA EONET (natural events) | The phone does not contact NASA for these: it gets them from our API, which fetches them from NASA. NASA receives nothing from or about the user |
| Nothing personal, only when a NASA satellite layer is turned on in the Map tab (all off by default) | gibs.earthdata.nasa.gov (NASA GIBS map images, loaded by the phone directly, `lib/map/nasa_map.dart`) | NASA sees the phone's IP address and the map area being requested, like any website; our server is not involved |
| Nothing personal | tiles.openfreemap.org (Map tab base map; tile.openstreetmap.org only as a fallback) | The tile server sees the phone's IP address and the map area being viewed, like any website |
| Nothing | Agency website from a "Data from ..." link or Settings → Data sources, opened in the browser only when tapped | The app sends nothing; the website sees the visit like any other |
| Language, theme, colour mode, followed district | On the device only (shared preferences) | Device only; removed on uninstall |

Like the web and extension, the app rounds coordinates to two decimals (about 1 km) before sending them
(`lib/api/hazard_api.dart`), matching the privacy policy.

## Google Play: Data safety form

**1.0.2: no answer changes.** The form below stays as it was for 1.0.1 (only Approximate location, collected,
not shared, optional, ephemeral; nothing else). Reasoning against Play's definitions:

- Relay: Play's "user data" is data about the user or the device. The relayed body is a public BMA list that is the
  same for every phone and carries nothing about the person, so it is not a collected data type. The IP address
  that reaches our server with it is the same as for every other API call, is not logged, and is not used to infer
  location (the Thai-IP check only accepts or rejects the request).
- FIRMS / EONET: come from our API like the other hazard data; nothing user-related goes to NASA.
- GIBS: the phone requests public map images from NASA, which, like the existing OpenFreeMap base map, sees the IP
  address and the requested map area. We do not transfer any user data to NASA; the app treats this like the base
  map tiles, which were not declared as sharing in 1.0.1. It only happens after the user turns a NASA layer on.

Uncertain, for the owner to decide (not changed here):

- The map area requested from NASA GIBS (and OpenFreeMap) is often near where the user is. If you read that as
  "approximate location shared with a third party", Location → Approximate location would become **Shared: yes**
  (purpose App functionality). The current answer (not shared) relies on it being a user-initiated map request with
  no location data attached, the same reading already used for OpenFreeMap in 1.0.1.
- Relay requests also run from the background alert check, not only while the app is open. That does not change
  the form (no user data), but mention it if review asks about background network use.

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
