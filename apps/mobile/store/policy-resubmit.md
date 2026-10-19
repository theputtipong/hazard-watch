# Play policy resubmission: Misleading Claims (government information)

Google Play rejected `com.pdouvch.hazardwatch` under the Misleading Claims policy: "Missing Source Link for
Government Information — Your app provides government information but lacks one or more clear and accessible
URL/link(s) to the original source(s) (for example, .gov domains)."

## 1.0.4 (third submission)

Google Play's rejection stands on the same issue, so the listing and the app are tightened again. We keep answering
as **option 2 (not government-affiliated)**.

What changed in `1.0.4` (`pubspec.yaml` `1.0.4+5`):

- **Store listing** (`listing.md`, th + en): the "Data sources" block now matches what the app really shows. Each
  agency is named in full with the page that hosts its data, RID is listed with a note that its figures come through
  ThaiWater, the fire / event / imagery lines say what each NASA source provides, and a base-map line credits
  OpenFreeMap and OpenStreetMap contributors. The "In the app" line and the closing note match the app (the closing
  note sends readers to each agency's own channels for warnings).
- **In the app**: the "This is not a government app" notice is shown once, at the top of Home, Alerts (with and
  without a district) and Settings → Data sources; the repeated notes at the bottom of those screens are gone. On
  the Map tab the notice is an ⓘ button directly above the refresh button on the map's right-hand controls (tooltip
  "This is not a government app"; tap opens Settings → Data sources).

Before sending the reply below, check each in-app point on the release build; drop any point that did not ship.

URL check: every URL in the listing returned HTTP 200 on **2026-10-19** (`curl -L` (GET), all 12 URLs, from
Thailand). Fill the date in the reply's "Note" as well.

### Reply to Play review for 1.0.4 (paste into the appeal / "Reply" form, English)

```
Hello Google Play team,

Thank you for the review of HazardWatch (com.pdouvch.hazardwatch). HazardWatch is NOT affiliated with any
government (option 2). Version 1.0.4 follows each option-2 step for "Missing Source Link for Government
Information":

1. Disclaimer first in the description. The short description starts with "Independent app, not a government
   app." The full description (English and Thai) opens with the heading "⚠️ Independent app, not a government app",
   followed by: "HazardWatch is an independent app made by a private developer. It is not affiliated with, endorsed
   by, or representing any government entity, including the Thai Meteorological Department (TMD), Pollution
   Control Department (PCD), Bangkok Metropolitan Administration (BMA), Hydro-Informatics Institute (HII), Royal
   Irrigation Department (RID), USGS or NASA."

2. Full source URLs in the description. Right after the disclaimer, a "Data sources" block names every source with
   the full URL of the page that hosts the data:
   - Thai Meteorological Department (TMD), earthquakes: https://earthquake.tmd.go.th
   - Pollution Control Department (PCD), Air4Thai, PM2.5: https://air4thai.pcd.go.th
   - Bangkok Metropolitan Administration (BMA), street flooding: https://weather.bangkok.go.th/flood
   - Bangkok Metropolitan Administration (BMA), rainfall: https://weather.bangkok.go.th/rain
   - Hydro-Informatics Institute (HII), ThaiWater, canal and river levels and dams: https://www.thaiwater.net
   - Royal Irrigation Department (RID), dams and reservoirs (figures come through ThaiWater): https://app.rid.go.th/reservoir
   - USGS, earthquakes worldwide: https://earthquake.usgs.gov
   - NASA FIRMS, satellite fire hotspots: https://firms.modaps.eosdis.nasa.gov
   - NASA EONET, storms, volcanoes, floods and landslides worldwide: https://eonet.gsfc.nasa.gov
   - NASA GIBS / Worldview, satellite imagery and map layers: https://worldview.earthdata.nasa.gov
   - Base map: OpenFreeMap (https://openfreemap.org) © OpenStreetMap contributors (https://www.openstreetmap.org/copyright)
   The description does not call the data "official" and says that for warnings people should check each agency's
   own websites and channels.

3. In the app, the "This is not a government app" notice is at the top of Home, Alerts and Settings → Data sources
   (shown once on each screen, with a "Data sources" button on Home), and on the Map tab it is an ⓘ button directly
   above the refresh button on the map's right-hand controls, that opens Settings → Data sources. On launch, a "This is
   not a government app" dialog also appears at most once per day. Source links name the agency and open its page, e.g.
   "Data from Thai Meteorological Department (TMD) · earthquake.tmd.go.th"; Settings → Data sources gives every
   agency's full name, domain and URL:
   - Home: the data cards and alert cards carry source links (an alert of a kind with no single source links
     Settings → Data sources instead), and each row of "When the data last updated" has its
     source link(s) under the feed name, with an "All data sources" button on that card.
   - Map: a credit strip under the map ("Map data: ...") links every agency whose data is on the map by its short
     name (e.g. BMA, ThaiWater), on the default view and whenever a layer is on; its ⓘ lists them by full name and
     site. Each marker's sheet has its
     own source link. A small ⓘ in the map's corner credits the base map (OpenFreeMap, OpenStreetMap contributors).
   - Dams: the dam card on Home and the dam sheet on the Map link both ThaiWater (thaiwater.net) and the Royal
     Irrigation Department (app.rid.go.th/reservoir).
   - Settings → Data sources: the notice at the top, then the 10 data sources listed above (all except the base
     map, which is credited on the map itself), each with agency, domain and full URL, and the emergency numbers
     1784 / 191.
   - Alert notifications end with "Data from <agency> · <domain>"; tapping one opens the Alerts tab.

How to check (no login needed):
1. Open the app and pick any Bangkok district (e.g. Bang Rak), or tap "Use my location".
2. Map tab: the ⓘ button directly above the refresh button on the map's right-hand controls ("This is not a government
   app") opens Data sources. The "Map
   data: ..." strip is under the map; tap any agency in it, or tap a marker to see the "Data from ... · <domain>"
   link in its sheet. Turn on the dam layer and tap a dam to see the ThaiWater and Royal Irrigation Department
   links.
3. Home tab: the notice is at the top; tap any "Data from ... · <domain>" link to open the agency's page. Scroll
   down to "When the data last updated" to see each feed's source link and "All data sources". Alerts tab: the
   same notice is at the top.
4. Settings → Data sources: the notice at the top and all 10 data sources with their full URLs.

Note: some Thai government sites (.go.th) can load slowly or time out from outside Thailand. All links returned
HTTP 200 when tested from Thailand on 2026-10-19; please allow a little longer for them to load.

Thank you,
HazardWatch developer
support.pdouvch@gmail.com
```

## 1.0.3 (second rejection)

Google Play rejected the app again with the same issue, "Missing Source Link for Government Information". We answer
as **option 2 (not government-affiliated)**, whose steps are: (1) clarify/add the information in the app; (2)
"Identify and provide in your description a clear, official, valid and functional source(s) for all of the
government information(s) shared in your app"; (3) "Include in the description of your app an easy-to-see
disclaimer stating that the app doesn't represent a government entity".

What changed in `1.0.3` (`pubspec.yaml` `1.0.3+4`):

- **Store listing** (`listing.md`, th + en): the short description now starts with "Independent app, not a
  government app." / "แอปอิสระ ไม่ใช่แอปของรัฐ"; the full description starts with the ⚠️ disclaimer naming
  TMD, PCD, BMA, HII, RID, USGS and NASA, followed by a "Data sources" block with one full https URL per source
  (the page that hosts the data, e.g. https://earthquake.tmd.go.th, https://weather.bangkok.go.th/flood,
  https://app.rid.go.th/reservoir). The word "official" / "อย่างเป็นทางการ" is gone, and the rain radar (not in
  the mobile app) is no longer mentioned.
- **In the app**: every source link shows the agency's full name and its domain ("Data from Thai Meteorological
  Department (TMD) · earthquake.tmd.go.th"; `sourceDataFrom`, `sourceAgency`); Home opens with the independence
  banner (`NotGovernmentBanner`, with a "Data sources" button) and every row of "When the data last updated" links
  its source(s), with an "All data sources" button below; the Map has a credit panel under the map whenever any
  data layer is on, the default view included ("Map data: Bangkok Metropolitan Administration (BMA) ·
  weather.bangkok.go.th, …"; `MapDataCredit`); RID (https://app.rid.go.th/reservoir) is linked next to ThaiWater on
  the dam card and dam pin sheet (`DamCredit`), and in the map credit panel while the dam layer is on (the map's
  dam legend itself has no credit); the EONET event sheet links NASA EONET plus "Event page · <domain>"; alert
  notifications carry the credit line "Data from <agency> · <domain>" and open the Alerts tab; Settings → Data
  sources starts with the independence disclaimer and lists 10 sources, each with agency, domain and full URL.

Before sending the reply below, check each in-app point on the release build (they come from the parallel 1.0.3
app changes); drop any point that did not ship.

Every URL in the listing returned HTTP 200 on 2026-10-17 (`curl -I -L`, from Thailand): earthquake.tmd.go.th,
air4thai.pcd.go.th, weather.bangkok.go.th/flood, weather.bangkok.go.th/rain, www.thaiwater.net,
app.rid.go.th/reservoir, earthquake.usgs.gov, firms.modaps.eosdis.nasa.gov, eonet.gsfc.nasa.gov,
worldview.earthdata.nasa.gov.

### Reply to Play review for 1.0.3 (paste into the appeal / "Reply" form, English)

```
Hello Google Play team,

Thank you for the second review of HazardWatch (com.pdouvch.hazardwatch). HazardWatch is NOT affiliated with any
government (option 2). Version 1.0.3 follows each option-2 step for "Missing Source Link for Government
Information":

1. Disclaimer first in the description. The short description starts with "Independent app, not a government
   app." The full description (English and Thai) opens with the heading "⚠️ Independent app, not a government app",
   followed by: "HazardWatch is an independent app made by a private developer. It is not affiliated with, endorsed
   by, or representing any government entity, including the Thai Meteorological Department (TMD), Pollution
   Control Department (PCD), Bangkok Metropolitan Administration (BMA), Hydro-Informatics Institute (HII), Royal
   Irrigation Department (RID), USGS or NASA."

2. Full source URLs in the description. Right after the disclaimer, a "Data sources" block names every source with
   the full URL of the page that hosts the data:
   - TMD earthquakes: https://earthquake.tmd.go.th
   - PCD Air4Thai (PM2.5): https://air4thai.pcd.go.th
   - BMA street flooding: https://weather.bangkok.go.th/flood
   - BMA rainfall: https://weather.bangkok.go.th/rain
   - HII ThaiWater (water levels, rain, dams): https://www.thaiwater.net
   - RID dams and reservoirs: https://app.rid.go.th/reservoir
   - USGS earthquakes: https://earthquake.usgs.gov
   - NASA FIRMS: https://firms.modaps.eosdis.nasa.gov
   - NASA EONET: https://eonet.gsfc.nasa.gov
   - NASA GIBS / Worldview: https://worldview.earthdata.nasa.gov
   The description no longer calls the data "official".

3. In the app, every source link names the agency in full and shows its domain, e.g.
   "Data from Thai Meteorological Department (TMD) · earthquake.tmd.go.th", and opens that page:
   - Home: under the district name, a banner says HazardWatch is an independent app, not a government app, with a
     "Data sources" button. Each data card and alert card has its source link, and each row of "When the data last
     updated" has its source link(s) under the feed name, followed by an "All data sources" button.
   - Map: a credit panel under the map, on the default view and whenever any data layer is on, links every agency
     whose data is shown, e.g. "Map data: Bangkok Metropolitan Administration (BMA) · weather.bangkok.go.th,
     Hydro-Informatics Institute (HII) · thaiwater.net, Thai Meteorological Department (TMD) ·
     earthquake.tmd.go.th, U.S. Geological Survey (USGS) · earthquake.usgs.gov, NASA FIRMS ·
     firms.modaps.eosdis.nasa.gov". Each marker's sheet has its own source link.
   - Dams: the dam card on Home and the dam sheet on the Map link both ThaiWater (thaiwater.net) and the Royal
     Irrigation Department (app.rid.go.th/reservoir); with the dam layer on, both are also in the map credit panel.
   - Settings → Data sources: the independence disclaimer at the top, then the 10 sources listed above, each with
     agency, domain and full URL.
   - Alert notifications end with "Data from <agency> · <domain>"; tapping one opens the Alerts tab.

How to check (no login needed):
1. Open the app and pick any Bangkok district (e.g. Bang Rak), or tap "Use my location".
2. Home tab: the independence banner is at the top; tap any "Data from ... · <domain>" link to open the agency's
   page. Scroll down to "When the data last updated" to see each feed's source link and "All data sources".
3. Map tab: the "Map data: ..." credit panel is under the map; tap any agency in it, or tap a marker to see the
   "Data from ... · <domain>" link in its sheet. Turn on the dam layer and tap a dam to see the ThaiWater and Royal
   Irrigation Department links.
4. Settings → Data sources: the disclaimer at the top and all 10 sources with their full URLs.

Note: some Thai government sites (.go.th) can load slowly or time out from outside Thailand. All links returned
HTTP 200 when tested from Thailand on 2026-10-17; please allow a little longer for them to load.

Thank you,
HazardWatch developer
support.pdouvch@gmail.com
```

## History: 1.0.1 and 1.0.2

Fixed in version `1.0.1` (`pubspec.yaml` `1.0.1+2`; the version code is explained in B1):

- Every data card on Home and every alert card on Home and Alerts shows a tappable "Data from X" link to the
  agency's own website. An alert of a kind with no single source links the Data sources screen instead.
- Every hazard sheet on the Map shows its source as a tappable link to the agency's website.
- Settings → Data sources lists TMD, PCD Air4Thai, BMA, ThaiWater (HII) and USGS with their URLs
  (`packages/core/src/sources-meta.ts`), the non-affiliation disclaimer and the emergency numbers 1784 / 191.
- The bottom of Home and of Alerts shows the same disclaimer with a button to the Data sources screen.
- The store listing (`listing.md`) has a Data sources section with the URLs and the disclaimer, and no longer
  calls the data "official".

## Version 1.0.2 (`1.0.2+3`): NASA sources and ThaiWater dams

1.0.2 adds NASA data and ThaiWater dam data, so their sources get the same treatment (URLs from
`packages/core/src/sources-meta.ts`):

| Source | URL | Where the app links it |
|---|---|---|
| NASA FIRMS (fire hotspots) | https://firms.modaps.eosdis.nasa.gov | NasaCard on Home (credit line "Fires: NASA FIRMS (LANCE/ESDIS) · Events: NASA EONET", both names linked); "NASA FIRMS ↗" link in the fire hotspot sheet on the Map; "NASA FIRMS" in the Map credit line and layer picker; Settings → Data sources |
| NASA EONET (natural events) | https://eonet.gsfc.nasa.gov | NasaCard on Home ("NASA EONET" in the linked credit line); "NASA EONET ↗" link in the event sheet on the Map (the event's own page from the EONET feed when there is one, else EONET); "NASA EONET" in the Map credit line and layer picker; Settings → Data sources |
| NASA GIBS / Worldview (satellite map layers) | https://worldview.earthdata.nasa.gov | "NASA EOSDIS GIBS / Worldview" linked in the Map credit line while a NASA layer is on ("Imagery: NASA EOSDIS GIBS / Worldview") and in the layer picker; Settings → Data sources |
| ThaiWater (HII) dam and reservoir storage, RID (กรมชลประทาน) data | https://www.thaiwater.net | Dam card on Home, the dam pin sheet on the Map and the dam layer's legend: credit line "Dam data from ThaiWater (HII) and the Royal Irrigation Department (RID)" with "ThaiWater" linked (`DamCredit` in `lib/widgets/dam_card.dart` → `sourceRef('thaiwater')`); ThaiWater already in Settings → Data sources (description now includes dam storage). RID has no separate link: its dam data reaches the app through ThaiWater |

Before sending A: the Map links for FIRMS, the EONET fallback and the GIBS credit come from the 1.0.2 map change
(`lib/screens/map_screen.dart` `_showFire` / `_NasaCredits`, `lib/map/nasa_map.dart` `nasaSourceRefs`). At HEAD
`e4c7568` those were plain credit text, so check on the release build that each NASA name on the Map is tappable.
If not, drop the Map parts of point 3 of the reply. The EONET event link can point to the event's source listed by
EONET (e.g. GDACS, JTWC), not always a NASA page.

## A. Replies sent before 1.0.3 (history)

History: reply sent with 1.0.2 (the current reply, for 1.0.3, is in "1.0.3 (second rejection)" above). The 1.0.1 reply is kept below it.

```
Hello Google Play team,

Thank you for the review of HazardWatch (com.pdouvch.hazardwatch). Version 1.0.2 keeps the source links added in
1.0.1 for the "Missing Source Link for Government Information" issue and extends them to the NASA data added in
this version.

What is in 1.0.2:
1. Source links in the app. Every data card and alert card on the Home and Alerts tabs shows a tappable
   "Data from <agency>" link, and the hazard detail sheets on the Map tab show their source. They open the
   original source website (an alert type without a single source opens the Data sources screen). The dam card on
   the Home tab and the dam sheet and legend on the Map tab link to ThaiWater, which publishes the Royal Irrigation
   Department's dam data.
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
   - **Build ในเครื่อง (แนะนำรอบนี้ เพราะยังไม่ได้ตั้ง secrets ของ CI)**: version code มาจาก `+5` ใน
     `pubspec.yaml` (`1.0.4+5`, version code 5; 1.0.1 used `+2`, 1.0.2 used `+3`, 1.0.3 used `+4`)
     ```sh
     cd apps/mobile
     HW_KEY_PROPERTIES=/path/to/key.properties flutter build appbundle --release --obfuscate --split-debug-info=build/symbols
     ```
     ได้ไฟล์ `build/app/outputs/bundle/release/app-release.aab` เก็บโฟลเดอร์ `build/symbols` ของ build นี้ไว้
     (ใช้อ่าน stack trace ตอนแอปแครชด้วย `flutter symbolize`) ถ้าไม่มี key.properties ตัว build จะหยุดพร้อม error
     ไม่ยอมเซ็นด้วย debug key
   - **Build จาก CI**: job `android` (ส่วน AAB ซึ่งสร้างเมื่อตั้ง secrets ของ upload key แล้ว) ใช้เลขรอบ CI (`github.run_number`) เป็น version code ซึ่งสูงกว่า 5 มาก
     ดาวน์โหลด artifact `hazardwatch-android-aab-<run>` (และ `hazardwatch-android-symbols-<run>` ซึ่งเก็บ 90 วัน)
     ถ้าเคยอัปโหลด build จาก CI แล้ว build ในเครื่องรอบถัดไปต้องตั้ง `+N` ใน `pubspec.yaml` ให้สูงกว่าเลขนั้น
     (หรือใช้ `--build-number`) จึงควรเลือก CI ไปตลอดเมื่อตั้ง secrets แล้ว
2. **อัปโหลด** AAB เข้า track เดิม (เช่น Closed testing) แล้วสร้าง release ใหม่ ใส่ release notes สั้น ๆ
   สำหรับ 1.0.4:
   - th: "แก้ข้อมูลในหน้าร้านให้ตรงกับแอป ข้อความ \"ไม่ใช่แอปของรัฐ\" แสดงครั้งเดียวด้านบนของหน้าแรก แจ้งเตือน และแหล่งข้อมูล ส่วนบนแผนที่เป็นปุ่ม ⓘ เหนือปุ่มรีเฟรชในแถวปุ่มด้านขวาของแผนที่"
   - en: "Store listing corrected to match the app. The \"This is not a government app\" notice is shown once at the top of Home, Alerts and Data sources, and on the Map it is an ⓘ button directly above the refresh button on the map's right-hand controls."
   (1.0.3 ใช้: "Independent app, not a government app: every source link now shows the agency's full name and its domain, the map shows a source credit panel, the Royal Irrigation Department is linked, and the disclaimer is on Home and Data sources.")
   (1.0.2 ใช้: "ครอบคลุมทั้ง 77 จังหวัด เพิ่มข้อมูลจุดความร้อน ภัยธรรมชาติ และชั้นแผนที่ดาวเทียมจาก NASA และข้อมูลเขื่อนจาก ThaiWater พร้อมลิงก์แหล่งข้อมูล")
3. **Store listing**: คัดข้อความจาก `listing.md` ทั้งไทยและอังกฤษ (short description + full description) แทนของเดิมทั้งหมด
   ตรวจว่าบรรทัดแรกของทั้งสองช่องคือข้อความแอปอิสระ และ URL ทุกตัวในบล็อก "แหล่งข้อมูล / Data sources" กดได้
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
   - แท็บแจ้งเตือน (Alerts) เห็นข้อความ "ไม่ใช่แอปของรัฐ" ด้านบน (ทั้งตอนเลือกเขตแล้วและยังไม่เลือก) และการ์ดแจ้งเตือนพร้อมลิงก์แหล่งข้อมูล (ใช้เขตทดสอบ เช่น บางรัก)
   - (ใหม่ใน 1.0.4) แผนที่ เห็นปุ่ม ⓘ เหนือปุ่มรีเฟรชในแถวปุ่มด้านขวาของแผนที่ (tooltip "This is not a government app" / "แอปนี้ไม่ใช่แอปของรัฐ")
   - แผนที่ (Map) แตะจุดบนแผนที่ให้แผ่นรายละเอียดเปิดขึ้น เห็นลิงก์แหล่งข้อมูล
   - (ใหม่ใน 1.0.4) ตั้งค่า → แหล่งข้อมูล เห็นกล่องข้อความไม่ใช่แอปของรัฐด้านบน รายชื่อหน่วยงานพร้อม URL รวม NASA FIRMS / EONET / GIBS ข้อความ "For warnings, check each agency’s own website and channels." (ฉบับไทยตามแอป) และเบอร์ 1784 / 191
   - (ใหม่ใน 1.0.2) การ์ด NASA บนหน้าแรก เห็นบรรทัดเครดิต "NASA FIRMS (LANCE/ESDIS) · NASA EONET" ที่กดเป็นลิงก์ได้
   - (ใหม่ใน 1.0.2) การ์ดเขื่อนบนหน้าแรก และแผนที่ที่เปิดชั้นเขื่อนแล้วแตะหมุดเขื่อน เห็นเครดิต "ข้อมูลเขื่อนจาก ThaiWater ..." ที่กด ThaiWater เป็นลิงก์ได้
   - (ใหม่ใน 1.0.2) แผนที่ที่เปิดชั้นแผนที่ NASA เห็นเครดิตลิงก์ "Imagery: NASA EOSDIS GIBS / Worldview" และแผ่นรายละเอียดจุดความร้อนที่มีลิงก์ "NASA FIRMS ↗"
   - (ใหม่ใน 1.0.3, ใส่เป็นภาพแรก ๆ) หน้าแรกส่วนบน เห็นแบนเนอร์ใต้ชื่อเขต "HazardWatch เป็นแอปอิสระ ไม่ใช่แอปของรัฐ …" พร้อมปุ่ม "แหล่งข้อมูล" (1.0.4 แสดงครั้งเดียวด้านบน ไม่มีหมายเหตุซ้ำด้านล่าง)
   - (ใหม่ใน 1.0.3) หน้าแรกส่วน "ข้อมูลอัปเดตล่าสุดเมื่อไหร่" เห็นลิงก์แหล่งข้อมูลใต้ชื่อฟีดแต่ละแถว และปุ่ม "แหล่งข้อมูลทั้งหมด"
   - (ใหม่ใน 1.0.3) แผนที่มุมมองเริ่มต้น เห็นแถบเครดิตใต้แผนที่ "ข้อมูลบนแผนที่: กทม. · ThaiWater · …" (ชื่อย่อ; ปุ่ม ⓘ ท้ายแถบแสดงชื่อเต็มและเว็บไซต์)
   - (ใหม่ใน 1.0.3) แผนที่ที่เปิดชั้นเขื่อนแล้วแตะหมุดเขื่อน เห็นลิงก์ ThaiWater (thaiwater.net) และกรมชลประทาน (app.rid.go.th) ในแผ่นรายละเอียด (การ์ดเขื่อนบนหน้าแรกก็มีทั้งสองลิงก์)
   - (ใหม่ใน 1.0.3) ตั้งค่า → แหล่งข้อมูล เห็นข้อความแอปอิสระด้านบน และครบ 10 แหล่ง แต่ละแถวมีชื่อหน่วยงาน โดเมน และ URL เต็ม รวม weather.bangkok.go.th/rain และ app.rid.go.th/reservoir
8. **ส่งตรวจ**: Publishing overview → **Send for review** แล้วตอบผู้ตรวจด้วยข้อความใน "Reply to Play review for 1.0.4" (ส่วน 1.0.4 ด้านบน)
   (ถ้ามีปุ่ม Appeal / Reply ที่ Policy status)
9. **ติดตามผล**: Policy and programs → **Policy status** (ดูว่าปัญหา Misleading Claims ถูกปิดแล้ว)
10. **บัญชีส่วนตัว**: ก่อนขอสิทธิ์ Production ต้องทำ Closed testing มีผู้ทดสอบ 12 คนขึ้นไป ต่อเนื่อง 14 วัน
   แล้วจึงกด Apply for production
