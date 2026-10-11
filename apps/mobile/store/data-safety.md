# Data safety (Play) and App Privacy (App Store)

Based on what the app does today (no push notifications, no account, no analytics or crash SDK). Re-check this
whenever a feature or dependency is added; push alerts will change the answers.

## What the app actually sends

| Data | Where it goes | Stored? |
|---|---|---|
| Approximate location (Android `ACCESS_COARSE_LOCATION`, iOS low accuracy), only when the person taps "use my location" | `GET /v1/area?lat=&lng=` on api.hazard.pdouvch.com, once, to find the district | No. The answer is cached by district id, not by coordinates; Cloudflare request logs are not kept by us |
| Chosen district id | `GET /v1/area?district=` | No |
| Nothing personal | weather.bangkok.go.th (BMA flood/rain feeds, fetched by the phone when our server's copy is stale) | BMA sees the phone's IP address, like any website |
| Language, theme, colour mode, followed district | On the device only (shared preferences) | Device only; removed on uninstall |

The app sends the coordinates as reported by the OS (coarse), not rounded. The web and extension round to about
1 km before sending; consider doing the same in `lib/api/hazard_api.dart` so the privacy policy's wording ("rounded
to about 1 km") is true for the app too.

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

## Privacy policy: add a mobile app section

`apps/web/src/content/privacy.ts` covers the web and the browser extension but not the app. Both stores require the
policy to cover the app. Suggested wording (have it reviewed with the rest of the PDPA notice):

**แอปมือถือ (Android/iOS)**
- การตั้งค่า และเขต/อำเภอที่เลือก เก็บไว้ในเครื่องของคุณเท่านั้น การลบแอปจะลบข้อมูลทั้งหมด
- ถ้าคุณกด "ใช้ตำแหน่งของฉัน" แอปส่งตำแหน่งโดยประมาณไปที่ API ของเราครั้งเดียวเพื่อหาเขต และไม่ถูกบันทึกไว้
- ในกรุงเทพฯ แอปอาจโหลดข้อมูลน้ำท่วมและฝนจากเว็บไซต์ของ กทม. โดยตรง ซึ่งจะเห็นหมายเลข IP ของคุณ แต่ไม่ได้รับตำแหน่งของคุณ
- ไม่มีบัญชีผู้ใช้ ไม่มีโฆษณา และไม่มีตัวติดตาม

**Mobile app (Android/iOS)**
- Your settings and chosen district stay on your device. Uninstalling the app deletes them.
- If you tap "Use my location", the app sends your approximate location to our API once to find your district; it is
  not stored.
- In Bangkok the app may load flood and rain data straight from the BMA website, which sees your IP address but not
  your location.
- There is no account, no ads and no trackers.
