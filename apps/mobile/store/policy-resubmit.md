# Play policy resubmission: Misleading Claims (government information)

Google Play rejected `com.pdouvch.hazardwatch` under the Misleading Claims policy: "Missing Source Link for
Government Information — Your app provides government information but lacks one or more clear and accessible
URL/link(s) to the original source(s) (for example, .gov domains)."

Fixed in version `1.0.1` (`pubspec.yaml` `1.0.1+2`; the version code is explained in B1):

- Every data card on Home and every alert card on Home and Alerts shows a tappable "Data from X" link to the
  agency's own website. An alert of a kind with no single source links the Data sources screen instead.
- Every hazard sheet on the Map shows its source as a tappable link to the agency's website.
- Settings → Data sources lists TMD, PCD Air4Thai, BMA, ThaiWater (HII) and USGS with their URLs
  (`packages/core/src/sources-meta.ts`), the non-affiliation disclaimer and the emergency numbers 1784 / 191.
- The bottom of Home and of Alerts shows the same disclaimer with a button to the Data sources screen.
- The store listing (`listing.md`) has a Data sources section with the URLs and the disclaimer, and no longer
  calls the data "official".

## Version 1.0.2 (`1.0.2+3`): NASA sources

1.0.2 adds NASA data, so its sources get the same treatment (URLs from `packages/core/src/sources-meta.ts`):

| Source | URL | Where the app links it |
|---|---|---|
| NASA FIRMS (fire hotspots) | https://firms.modaps.eosdis.nasa.gov | NasaCard on Home (credit line "Fires: NASA FIRMS (LANCE/ESDIS) · Events: NASA EONET", both names linked); "NASA FIRMS ↗" link in the fire hotspot sheet on the Map; "NASA FIRMS" in the Map credit line and layer picker; Settings → Data sources |
| NASA EONET (natural events) | https://eonet.gsfc.nasa.gov | NasaCard on Home ("NASA EONET" in the linked credit line); "NASA EONET ↗" link in the event sheet on the Map (the event's own page from the EONET feed when there is one, else EONET); "NASA EONET" in the Map credit line and layer picker; Settings → Data sources |
| NASA GIBS / Worldview (satellite map layers) | https://worldview.earthdata.nasa.gov | "NASA EOSDIS GIBS / Worldview" linked in the Map credit line while a NASA layer is on ("Imagery: NASA EOSDIS GIBS / Worldview") and in the layer picker; Settings → Data sources |

Before sending A: the Map links for FIRMS, the EONET fallback and the GIBS credit come from the 1.0.2 map change
(`lib/screens/map_screen.dart` `_showFire` / `_NasaCredits`, `lib/map/nasa_map.dart` `nasaSourceRefs`). At HEAD
`e4c7568` those were plain credit text, so check on the release build that each NASA name on the Map is tappable.
If not, drop the Map parts of point 3 of the reply. The EONET event link can point to the event's source listed by
EONET (e.g. GDACS, JTWC), not always a NASA page.

## A. Reply to Play review (paste into the appeal / "Reply" form, English)

Current reply, for 1.0.2. The 1.0.1 reply is kept below it as history.

```
Hello Google Play team,

Thank you for the review of HazardWatch (com.pdouvch.hazardwatch). Version 1.0.2 keeps the source links added in
1.0.1 for the "Missing Source Link for Government Information" issue and extends them to the NASA data added in
this version.

What is in 1.0.2:
1. Source links in the app. Every data card and alert card on the Home and Alerts tabs shows a tappable
   "Data from <agency>" link, and the hazard detail sheets on the Map tab show their source. They open the
   original source website (an alert type without a single source opens the Data sources screen).
2. A Data sources screen (Settings → Data sources) lists every source with its URL:
   - Thai Meteorological Department: https://www.tmd.go.th
   - Pollution Control Department, Air4Thai: https://air4thai.pcd.go.th
   - Bangkok Metropolitan Administration: https://weather.bangkok.go.th
   - Hydro-Informatics Institute, ThaiWater: https://www.thaiwater.net
   - USGS: https://earthquake.usgs.gov
   - NASA FIRMS (fire hotspots): https://firms.modaps.eosdis.nasa.gov
   - NASA EONET (natural events): https://eonet.gsfc.nasa.gov
   - NASA GIBS / Worldview (satellite map layers): https://worldview.earthdata.nasa.gov
3. NASA data. The NASA card on the Home tab links to NASA FIRMS and NASA EONET. On the Map tab, the fire
   hotspot sheet links to NASA FIRMS, the natural event sheet links to the event's page (or NASA EONET), and
   while a NASA satellite layer is on, the map credit "Imagery: NASA EOSDIS GIBS / Worldview" links to NASA
   Worldview. All three are listed with their URLs in Settings → Data sources.
4. Disclaimer. The Data sources screen and the bottom of the Home and Alerts tabs state that HazardWatch is an
   independent app, not affiliated with or acting for any government agency, and that official warnings should be
   checked on the agencies' own channels, with a button to the Data sources screen.
5. Store listing. The description has a "Data sources" section with the same links, including the three NASA
   sources, and the disclaimer "HazardWatch is an independent app and is not affiliated with, endorsed by, or
   representing any government entity, including NASA." No data is described as official.

How to check: open the app (no login needed), pick any district (e.g. Bang Rak, Bangkok), tap a "Data from ..."
link on a Home or Alerts card or on the NASA card, or go to Settings → Data sources.

Thank you,
HazardWatch developer
support.pdouvch@gmail.com
```

### History: reply sent with 1.0.1

```
Hello Google Play team,

Thank you for the review of HazardWatch (com.pdouvch.hazardwatch). We have fixed the "Missing Source Link for
Government Information" issue in version 1.0.1.

What changed:
1. Source links in the app. Every data card and alert card on the Home and Alerts tabs shows a tappable
   "Data from <agency>" link, and every hazard detail sheet on the Map tab shows its source as a tappable link.
   They open the original source website (an alert type without a single source opens the Data sources screen).
2. A Data sources screen (Settings → Data sources) lists every source with its URL:
   - Thai Meteorological Department: https://www.tmd.go.th
   - Pollution Control Department, Air4Thai: https://air4thai.pcd.go.th
   - Bangkok Metropolitan Administration: https://weather.bangkok.go.th
   - Hydro-Informatics Institute, ThaiWater: https://www.thaiwater.net
   - USGS: https://earthquake.usgs.gov
3. Disclaimer. The Data sources screen and the bottom of the Home and Alerts tabs state that HazardWatch is an
   independent app, not affiliated with or acting for any government agency, and that official warnings should be
   checked on the agencies' own channels, with a button to the Data sources screen.
4. Store listing. The description now has a "Data sources" section with the same links and the disclaimer
   "HazardWatch is an independent app and is not affiliated with, endorsed by, or representing any government
   entity." The short description no longer describes the data as official.

How to check: open the app (no login needed), pick any district (e.g. Bang Rak, Bangkok), tap a "Data from ..."
link on a Home or Alerts card, or go to Settings → Data sources.

Thank you,
HazardWatch developer
support.pdouvch@gmail.com
```

## B. เช็กลิสต์ส่งตรวจใหม่ใน Play Console (เจ้าของแอป)

1. **Build ใหม่ และ version code**: Play รับเฉพาะ version code ที่มากกว่าทุกตัวที่เคยอัปโหลดเข้าแอปนี้
   (นับตัวที่ถูกปฏิเสธด้วย) AAB ที่ build ในเครื่องวันที่ 11 ต.ค. เป็น version code 1 จึงห้ามใช้ซ้ำ
   เลือกทางเดียวแล้วใช้ทางนั้นต่อไป:
   - **Build ในเครื่อง (แนะนำรอบนี้ เพราะยังไม่ได้ตั้ง secrets ของ CI)**: version code มาจาก `+2` ใน
     `pubspec.yaml` (`1.0.2+3`; 1.0.1 used `+2`)
     ```sh
     cd apps/mobile
     HW_KEY_PROPERTIES=/path/to/key.properties flutter build appbundle --release --obfuscate --split-debug-info=build/symbols
     ```
     ได้ไฟล์ `build/app/outputs/bundle/release/app-release.aab` เก็บโฟลเดอร์ `build/symbols` ของ build นี้ไว้
     (ใช้อ่าน stack trace ตอนแอปแครชด้วย `flutter symbolize`) ถ้าไม่มี key.properties ตัว build จะหยุดพร้อม error
     ไม่ยอมเซ็นด้วย debug key
   - **Build จาก CI**: job `android` (ส่วน AAB ซึ่งสร้างเมื่อตั้ง secrets ของ upload key แล้ว) ใช้เลขรอบ CI (`github.run_number`) เป็น version code ซึ่งสูงกว่า 3 มาก
     ดาวน์โหลด artifact `hazardwatch-android-aab-<run>` (และ `hazardwatch-android-symbols-<run>` ซึ่งเก็บ 90 วัน)
     ถ้าเคยอัปโหลด build จาก CI แล้ว build ในเครื่องรอบถัดไปต้องตั้ง `+N` ใน `pubspec.yaml` ให้สูงกว่าเลขนั้น
     (หรือใช้ `--build-number`) จึงควรเลือก CI ไปตลอดเมื่อตั้ง secrets แล้ว
2. **อัปโหลด** AAB เข้า track เดิม (เช่น Closed testing) แล้วสร้าง release ใหม่ ใส่ release notes สั้น ๆ
   เช่น "ครอบคลุมทั้ง 77 จังหวัด เพิ่มข้อมูลจุดความร้อน ภัยธรรมชาติ และชั้นแผนที่ดาวเทียมจาก NASA พร้อมลิงก์แหล่งข้อมูล"
3. **Store listing**: คัดข้อความจาก `listing.md` ทั้งไทยและอังกฤษ (short description + full description)
4. **App content** (Policy → App content) ตรวจทีละข้อ:
   - Privacy policy: https://hazard.pdouvch.com/th/privacy (ไทย) และ https://hazard.pdouvch.com/en/privacy (อังกฤษ)
   - Data safety: ตอบตาม `data-safety.md`
   - Content rating: ทำแบบสอบถาม IARC ตาม `listing.md` (Everyone / 3+)
   - Target audience: 18+ (ตาม `data-safety.md`)
   - Ads: **No**
   - News app: **No**
   - Government apps: **No** (เป็นแอปอิสระ ไม่ได้ทำให้หรือในนามหน่วยงานรัฐ)
   - Health: **No**
   - Financial features: **No**
5. **Foreground service**: เวอร์ชันนี้เอา foreground service ของ geolocator (และของ WorkManager) รวมถึงสิทธิ์
   `FOREGROUND_SERVICE*` ออกจาก manifest แล้ว (แอปอ่านตำแหน่งครั้งเดียวตอนผู้ใช้แตะ และงานเช็กแจ้งเตือนเป็นงานเบื้องหลัง
   แบบปกติ) จึงไม่ต้องประกาศ foreground service ถ้า Play Console ยังขึ้นแบบฟอร์ม
   Foreground service permissions จาก build เดิม ให้ตอบตาม manifest ใหม่ คือไม่มีการใช้ foreground service
6. **Store listing device checks** (การตรวจ integrity ของอุปกรณ์): เลือก **No integrity checks**
   เพราะแอปไม่มีบัญชี ไม่มีการจ่ายเงิน และข้อมูลเป็นข้อมูลเปิด จึงไม่จำเป็นต้องกันอุปกรณ์ที่ root หรือไม่ผ่านการรับรอง
7. **ภาพหน้าจอ** ที่ควรใส่ (ช่วยผู้ตรวจเห็นลิงก์ได้เร็ว) ทั้งไทยและอังกฤษ:
   - หน้าแรก (Home) เห็นการ์ดพร้อมลิงก์ "ข้อมูลจาก ..." / "Data from ..."
   - แท็บแจ้งเตือน (Alerts) เห็นการ์ดแจ้งเตือนพร้อมลิงก์แหล่งข้อมูล และข้อความว่าเป็นแอปอิสระด้านล่าง
   - ส่วนล่างของหน้าแรก เห็นข้อความว่าเป็นแอปอิสระ
   - แผนที่ (Map) แตะจุดบนแผนที่ให้แผ่นรายละเอียดเปิดขึ้น เห็นลิงก์แหล่งข้อมูล
   - ตั้งค่า → แหล่งข้อมูล เห็นรายชื่อหน่วยงานพร้อม URL รวม NASA FIRMS / EONET / GIBS ข้อความปฏิเสธความเกี่ยวข้อง และเบอร์ 1784 / 191
   - (ใหม่ใน 1.0.2) การ์ด NASA บนหน้าแรก เห็นบรรทัดเครดิต "NASA FIRMS (LANCE/ESDIS) · NASA EONET" ที่กดเป็นลิงก์ได้
   - (ใหม่ใน 1.0.2) แผนที่ที่เปิดชั้นแผนที่ NASA เห็นเครดิตลิงก์ "Imagery: NASA EOSDIS GIBS / Worldview" และแผ่นรายละเอียดจุดความร้อนที่มีลิงก์ "NASA FIRMS ↗"
8. **ส่งตรวจ**: Publishing overview → **Send for review** แล้วตอบผู้ตรวจด้วยข้อความในข้อ A
   (ถ้ามีปุ่ม Appeal / Reply ที่ Policy status)
9. **ติดตามผล**: Policy and programs → **Policy status** (ดูว่าปัญหา Misleading Claims ถูกปิดแล้ว)
10. **บัญชีส่วนตัว**: ก่อนขอสิทธิ์ Production ต้องทำ Closed testing มีผู้ทดสอบ 12 คนขึ้นไป ต่อเนื่อง 14 วัน
   แล้วจึงกด Apply for production
