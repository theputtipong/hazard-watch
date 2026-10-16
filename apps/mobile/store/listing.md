# Store listing (Google Play and App Store)

Describe only what the current build (1.0.2) does: four tabs (Home, Map, Alerts, Settings), all 77 provinces
(928 districts), NASA satellite layers on the Map.

Google Play treats the app as showing government information, so the listing must (Misleading Claims policy):
link to each original source, say clearly that HazardWatch is independent and not a government app, and never word
the data as "official". Keep the URLs below in line with `packages/core/src/sources-meta.ts`. See
`policy-resubmit.md` for the 2026 rejection and the resubmission steps.

Images: `icon-512.png` (Play hi-res icon), `feature-graphic-1024x500.png` (Play feature graphic). The App Store icon
is the 1024 px icon inside the app. Screenshots still have to be taken (see `README.md`).

## ภาษาไทย (th-TH, default)

**App name / ชื่อแอป** (Play 30, App Store 30): `HazardWatch เฝ้าระวังภัย`

**App Store subtitle** (30): `ฝน น้ำท่วม ฝุ่น แผ่นดินไหว`

**Play short description** (80):
`ดูฝนหนัก น้ำท่วมถนน ฝุ่น PM2.5 แผ่นดินไหวในเขตคุณ จากข้อมูลเปิดของหน่วยงานรัฐ`

**App Store promotional text** (170):
`เลือกเขตที่อยากติดตาม แล้วดูว่าแถวนั้นมีฝนหนัก น้ำท่วมถนน ฝุ่น หรือแผ่นดินไหวไหม รวมข้อมูลเปิดจากหน่วยงานรัฐ แอปอิสระ ไม่ต้องสมัครสมาชิก`

**Full description / คำอธิบาย** (Play 4000, App Store 4000):

```
HazardWatch (เฝ้าระวังภัย) บอกว่าเขต/อำเภอที่คุณติดตามมีเรื่องต้องระวังไหม ในหน้าเดียว อ่านง่าย ครอบคลุมทั้ง 77 จังหวัด (928 เขต/อำเภอ)

• ฝนหนัก: ปริมาณฝนชั่วโมงที่แล้วจากสถานีใกล้เขตของคุณ
• น้ำท่วมถนน: จุดน้ำท่วมในกรุงเทพฯ และความลึก จาก กทม.
• ฝุ่น PM2.5: ค่าฝุ่นจากสถานีของกรมควบคุมมลพิษ
• แผ่นดินไหว: แผ่นดินไหวที่รู้สึกได้ใกล้คุณ จากกรมอุตุนิยมวิทยาและ USGS
• จุดความร้อนและภัยธรรมชาติ: จุดความร้อนจากดาวเทียม (NASA FIRMS) และพายุ ไฟป่า ภูเขาไฟทั่วโลก (NASA EONET)
• ชั้นแผนที่ดาวเทียมของ NASA: ฝน น้ำท่วม ควันและฝุ่น และภาพถ่ายดาวเทียม เปิดเองได้ในแท็บแผนที่

ใช้ง่าย
• หาเขตจากตำแหน่งของคุณ หรือเลือกเขตเอง ไม่ต้องให้สิทธิ์ตำแหน่งก็ใช้ได้
• ภาษาไทยและอังกฤษ โหมดมืด และโหมดสีสำหรับผู้ที่มองเห็นสีต่างจากคนทั่วไป
• ไม่มีอินเทอร์เน็ตก็ยังเห็นข้อมูลล่าสุด พร้อมบอกว่าเป็นข้อมูลเมื่อไร

เป็นส่วนตัว
• ไม่มีบัญชีผู้ใช้ ไม่มีโฆษณา ไม่มีตัวติดตาม
• ตำแหน่งใช้หาเขตเท่านั้น ไม่ถูกเก็บไว้

แหล่งข้อมูล
แอปรวมข้อมูลเปิดจากหน่วยงานเหล่านี้ การ์ดข้อมูลในแอปมีลิงก์ "ข้อมูลจาก ..." ไปยังต้นทาง ชั้นแผนที่ของ NASA แสดงเครดิตบนแผนที่ และดูรายชื่อพร้อมลิงก์ทั้งหมดได้ที่ ตั้งค่า → แหล่งข้อมูล
• กรมอุตุนิยมวิทยา (สภาพอากาศและแผ่นดินไหว): https://www.tmd.go.th
• กรมควบคุมมลพิษ Air4Thai (ค่าฝุ่น PM2.5): https://air4thai.pcd.go.th
• กรุงเทพมหานคร (น้ำท่วมและปริมาณฝนในกรุงเทพฯ): https://weather.bangkok.go.th
• สถาบันสารสนเทศทรัพยากรน้ำ ThaiWater (ระดับน้ำและเรดาร์ฝน): https://www.thaiwater.net
• USGS (แผ่นดินไหวทั่วโลก): https://earthquake.usgs.gov
• NASA FIRMS (จุดความร้อนจากดาวเทียม): https://firms.modaps.eosdis.nasa.gov
• NASA EONET (พายุ ภูเขาไฟ และภัยธรรมชาติทั่วโลก): https://eonet.gsfc.nasa.gov
• NASA GIBS / Worldview (ภาพและชั้นแผนที่ดาวเทียม): https://worldview.earthdata.nasa.gov

ข้อจำกัดความรับผิดชอบ
HazardWatch (เฝ้าระวังภัย) เป็นแอปอิสระ ไม่ได้เป็นของ ไม่ได้รับการรับรอง และไม่ได้เป็นตัวแทนของหน่วยงานรัฐใด รวมถึง NASA ข้อมูลจาก NASA ใช้แสดงผลเท่านั้น ไม่ใช่ประกาศเตือนภัย ประกาศเตือนภัยอย่างเป็นทางการ ให้ติดตามจากช่องทางของหน่วยงานโดยตรง ในเหตุฉุกเฉินให้ทำตามประกาศของหน่วยงานในพื้นที่ และโทร 1784 (ปภ.) หรือ 191
```

**App Store keywords** (100 bytes, Thai is 3 bytes per character, so keep it short):
`น้ำท่วม,ฝน,ฝุ่น,PM2.5,แผ่นดินไหว,กทม`

## English (en-US)

**App name** (30): `HazardWatch: Thailand Hazards`

**App Store subtitle** (30): `Rain, floods, PM2.5, quakes`

**Play short description** (80):
`Heavy rain, street flooding, PM2.5 dust and earthquakes for your Thai district.`

**App Store promotional text** (170):
`Pick a district to see if heavy rain, street flooding, dust or an earthquake needs your attention, using public data from Thai agencies. Independent app, no account.`

**Full description:**

```
HazardWatch shows whether the district you follow in Thailand has anything to watch out for, on one easy screen. It covers all 77 provinces (928 districts).

• Heavy rain: rainfall in the past hour from stations near your district
• Street flooding: flooded streets in Bangkok and how deep they are, from the BMA
• PM2.5 dust: readings from the Pollution Control Department's stations
• Earthquakes: felt earthquakes near you, from the Thai Meteorological Department and USGS
• Fires and natural events: satellite fire hotspots (NASA FIRMS) and storms, wildfires and volcanoes worldwide (NASA EONET)
• NASA satellite map layers: rain, flooding, smoke and haze, and satellite imagery, which you can turn on in the Map tab

Easy to use
• Find your district from your location, or pick it yourself; location permission is optional
• Thai and English, dark mode, and a colour mode for colour-blind users
• Offline, you still see the latest data and how old it is

Private
• No account, no ads, no trackers
• Your location is only used to find your district and is not stored

Data sources
The app uses public data from these agencies. Data cards in the app have a "Data from ..." link to the original source, NASA map layers show their credit on the map, and Settings → Data sources lists them all with links.
• Thai Meteorological Department (weather and earthquakes): https://www.tmd.go.th
• Pollution Control Department, Air4Thai (PM2.5 levels): https://air4thai.pcd.go.th
• Bangkok Metropolitan Administration (Bangkok flooding and rain gauges): https://weather.bangkok.go.th
• Hydro-Informatics Institute, ThaiWater (water levels and rain radar): https://www.thaiwater.net
• USGS (earthquakes worldwide): https://earthquake.usgs.gov
• NASA FIRMS (satellite fire hotspots): https://firms.modaps.eosdis.nasa.gov
• NASA EONET (storms, volcanoes and natural events worldwide): https://eonet.gsfc.nasa.gov
• NASA GIBS / Worldview (satellite imagery and map layers): https://worldview.earthdata.nasa.gov

Disclaimer
HazardWatch is an independent app and is not affiliated with, endorsed by, or representing any government entity, including NASA. NASA data is shown for information only and is not a warning. For official warnings, check the agencies' own channels. In an emergency follow local authorities' instructions and call 1784 (DDPM) or 191.
```

**App Store keywords** (100): `flood,rain,PM2.5,air quality,earthquake,Bangkok,Thailand,weather,warning,dust`

## Common fields

| Field | Value |
|---|---|
| Category | Play: Weather · App Store: Weather (secondary: Utilities) |
| Contact email | support.pdouvch@gmail.com |
| Website | https://hazard.pdouvch.com |
| Privacy policy | https://hazard.pdouvch.com/th/privacy (Thai) · https://hazard.pdouvch.com/en/privacy (English) |
| Price | Free, no in-app purchases, no ads |
| Content rating | Play IARC questionnaire: no violence, no user content, no sharing of location with other users → Everyone / 3+. App Store age rating: 4+ |
| Countries | Thailand (data covers Thailand only) |
