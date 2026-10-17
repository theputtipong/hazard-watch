# Store listing (Google Play and App Store)

Describe only what the current build (1.0.3) does: four tabs (Home, Map, Alerts, Settings), all 77 provinces
(928 districts), NASA satellite layers on the Map, dam and reservoir levels from ThaiWater and RID (Home card and a
Map layer). There is no rain radar in the mobile app, so the listing must not mention one.

Google Play treats the app as showing government information and rejected it twice (Misleading Claims, "Missing
Source Link for Government Information"; we answer as option 2, not government-affiliated). Google's option-2 steps
for the description are followed here:

1. The disclaimer ("independent app, not a government app") is the FIRST thing in both short descriptions and the
   first block of both full descriptions.
2. The second block lists every government source with the full https URL of the page that hosts the data.
3. No wording calls the data or the warnings "official" / "อย่างเป็นทางการ" / "ทางการ".

Keep the URLs in line with `packages/core/src/sources-meta.ts`. See `policy-resubmit.md` for the rejections and
the resubmission steps. Character counts below were checked with Python `len()` (Play counts characters).

Images: `icon-512.png` (Play hi-res icon), `feature-graphic-1024x500.png` (Play feature graphic). The App Store icon
is the 1024 px icon inside the app. Screenshots still have to be taken (see `README.md`).

## ภาษาไทย (th-TH, default)

**App name / ชื่อแอป** (Play 30, App Store 30): `HazardWatch เฝ้าระวังภัย`

**App Store subtitle** (30): `ฝน น้ำท่วม ฝุ่น แผ่นดินไหว`

**Play short description** (80; ใช้ 71):
`แอปอิสระ ไม่ใช่แอปของรัฐ · ฝนหนัก น้ำท่วม ฝุ่น PM2.5 แผ่นดินไหวในเขตคุณ`

**App Store promotional text** (170):
`แอปอิสระ ไม่ใช่แอปของรัฐ เลือกเขตที่อยากติดตาม แล้วดูว่าแถวนั้นมีฝนหนัก น้ำท่วมถนน ฝุ่น หรือแผ่นดินไหวไหม พร้อมลิงก์ไปยังแหล่งข้อมูลต้นทาง ไม่ต้องสมัครสมาชิก`

**Full description / คำอธิบาย** (Play 4000, App Store 4000; ใช้ 2511):

```
⚠️ แอปอิสระ ไม่ใช่แอปของรัฐ
HazardWatch (เฝ้าระวังภัย) เป็นแอปอิสระที่พัฒนาโดยบุคคลทั่วไป ไม่ได้เป็นของ ไม่ได้รับการรับรอง และไม่ได้เป็นตัวแทนของหน่วยงานรัฐใด รวมถึงกรมอุตุนิยมวิทยา (TMD) กรมควบคุมมลพิษ (PCD) กรุงเทพมหานคร (BMA) สถาบันสารสนเทศทรัพยากรน้ำ (HII) กรมชลประทาน (RID) USGS และ NASA แอปเพียงนำข้อมูลเปิดที่หน่วยงานเหล่านี้เผยแพร่มาแสดง พร้อมลิงก์ไปยังต้นทาง

แหล่งข้อมูล (ข้อมูลทั้งหมดมาจากเว็บไซต์เหล่านี้)
• กรมอุตุนิยมวิทยา (TMD) แผ่นดินไหว: https://earthquake.tmd.go.th
• กรมควบคุมมลพิษ (PCD) Air4Thai ค่าฝุ่น PM2.5: https://air4thai.pcd.go.th
• กรุงเทพมหานคร (BMA) จุดน้ำท่วมถนน: https://weather.bangkok.go.th/flood
• กรุงเทพมหานคร (BMA) ปริมาณฝน: https://weather.bangkok.go.th/rain
• สถาบันสารสนเทศทรัพยากรน้ำ (HII) ThaiWater ระดับน้ำ ฝน และน้ำในเขื่อน: https://www.thaiwater.net
• กรมชลประทาน (RID) น้ำในเขื่อนและอ่างเก็บน้ำ: https://app.rid.go.th/reservoir
• USGS แผ่นดินไหวทั่วโลก: https://earthquake.usgs.gov
• NASA FIRMS จุดความร้อนจากดาวเทียม: https://firms.modaps.eosdis.nasa.gov
• NASA EONET พายุ ไฟป่า ภูเขาไฟทั่วโลก: https://eonet.gsfc.nasa.gov
• NASA GIBS / Worldview ภาพและชั้นแผนที่ดาวเทียม: https://worldview.earthdata.nasa.gov

ในแอป: ทุกการ์ด การแจ้งเตือน และแผ่นรายละเอียดบนแผนที่ มีลิงก์ "ข้อมูลจาก <หน่วยงาน> · <โดเมน>" ที่กดไปยังต้นทางได้ แผนที่มีแถบเครดิตแหล่งข้อมูลตลอดเวลา และ ตั้งค่า → แหล่งข้อมูล รวมลิงก์ทั้งหมด

HazardWatch บอกว่าเขต/อำเภอที่คุณติดตามมีเรื่องต้องระวังไหม ในหน้าเดียว อ่านง่าย ครอบคลุมทั้ง 77 จังหวัด (928 เขต/อำเภอ)

• ฝนหนัก: ปริมาณฝนชั่วโมงที่แล้วจากสถานีใกล้เขตของคุณ
• น้ำท่วมถนน: จุดน้ำท่วมในกรุงเทพฯ และความลึก
• ฝุ่น PM2.5: ค่าฝุ่นจากสถานีตรวจวัดใกล้คุณ
• แผ่นดินไหว: แผ่นดินไหวที่รู้สึกได้ใกล้คุณ
• เขื่อนและอ่างเก็บน้ำ: ปริมาณน้ำในเขื่อนขนาดใหญ่ 35 แห่งและอ่างเก็บน้ำขนาดกลาง แสดงแห่งที่ใกล้เขตของคุณบนหน้าแรก และชั้นแผนที่เขื่อนในแท็บแผนที่
• จุดความร้อนและภัยธรรมชาติ: จุดความร้อนจากดาวเทียม และพายุ ไฟป่า ภูเขาไฟทั่วโลก
• ชั้นแผนที่ดาวเทียม: ฝน น้ำท่วม ควันและฝุ่น และภาพถ่ายดาวเทียม เปิดเองได้ในแท็บแผนที่

ใช้ง่าย
• หาเขตจากตำแหน่งของคุณ หรือเลือกเขตเอง ไม่ต้องให้สิทธิ์ตำแหน่งก็ใช้ได้
• ภาษาไทยและอังกฤษ โหมดมืด และโหมดสีสำหรับผู้ที่มองเห็นสีต่างจากคนทั่วไป
• ไม่มีอินเทอร์เน็ตก็ยังเห็นข้อมูลล่าสุด พร้อมบอกว่าเป็นข้อมูลเมื่อไร

เป็นส่วนตัว
• ไม่มีบัญชีผู้ใช้ ไม่มีโฆษณา ไม่มีตัวติดตาม
• ตำแหน่งใช้หาเขตเท่านั้น ไม่ถูกเก็บไว้

หมายเหตุ: HazardWatch ไม่ใช่บริการเตือนภัย ข้อมูลใช้ประกอบการติดตามเท่านั้น ประกาศเตือนภัยให้ดูจากเว็บไซต์และช่องทางของหน่วยงานโดยตรง ในเหตุฉุกเฉินให้ทำตามคำแนะนำของหน่วยงานในพื้นที่ และโทร 1784 (ปภ.) หรือ 191
```

**App Store keywords** (100 bytes, Thai is 3 bytes per character, so keep it short):
`น้ำท่วม,ฝน,ฝุ่น,PM2.5,แผ่นดินไหว,กทม`

## English (en-US)

**App name** (30): `HazardWatch: Thailand Hazards`

**App Store subtitle** (30): `Rain, floods, PM2.5, quakes`

**Play short description** (80; uses 78):
`Independent app, not a government app. Rain, floods, PM2.5, quakes by district`

**App Store promotional text** (170):
`Independent app, not a government app. Pick a district to see if heavy rain, street flooding, dust or an earthquake needs your attention, with links to every source.`

**Full description** (4000; uses 2921):

```
⚠️ Independent app, not a government app
HazardWatch is an independent app made by a private developer. It is not affiliated with, endorsed by, or representing any government entity, including the Thai Meteorological Department (TMD), Pollution Control Department (PCD), Bangkok Metropolitan Administration (BMA), Hydro-Informatics Institute (HII), Royal Irrigation Department (RID), USGS or NASA. It only shows public data these agencies publish, with links back to the source.

Data sources (all data in the app comes from these websites)
• Thai Meteorological Department (TMD), earthquakes: https://earthquake.tmd.go.th
• Pollution Control Department (PCD), Air4Thai, PM2.5: https://air4thai.pcd.go.th
• Bangkok Metropolitan Administration (BMA), street flooding: https://weather.bangkok.go.th/flood
• Bangkok Metropolitan Administration (BMA), rainfall: https://weather.bangkok.go.th/rain
• Hydro-Informatics Institute (HII), ThaiWater, water levels, rain and dams: https://www.thaiwater.net
• Royal Irrigation Department (RID), dams and reservoirs: https://app.rid.go.th/reservoir
• USGS, earthquakes worldwide: https://earthquake.usgs.gov
• NASA FIRMS, satellite fire hotspots: https://firms.modaps.eosdis.nasa.gov
• NASA EONET, storms, wildfires and volcanoes worldwide: https://eonet.gsfc.nasa.gov
• NASA GIBS / Worldview, satellite imagery and map layers: https://worldview.earthdata.nasa.gov

In the app: every card, alert and map sheet shows a "Data from <agency> · <domain>" link to the source, the map always shows a source credit strip, and Settings → Data sources lists all links.

HazardWatch shows whether the district you follow in Thailand has anything to watch out for, on one easy screen. It covers all 77 provinces (928 districts).

• Heavy rain: rainfall in the past hour from stations near your district
• Street flooding: flooded streets in Bangkok and how deep they are
• PM2.5 dust: readings from monitoring stations near you
• Earthquakes: felt earthquakes near you
• Dams and reservoirs: how full the 35 large dams and the medium reservoirs are, the ones nearest your district on Home, plus a dam layer in the Map tab
• Fires and natural events: satellite fire hotspots, and storms, wildfires and volcanoes worldwide
• Satellite map layers: rain, flooding, smoke and haze, and satellite imagery, which you can turn on in the Map tab

Easy to use
• Find your district from your location, or pick it yourself; location permission is optional
• Thai and English, dark mode, and a colour mode for colour-blind users
• Offline, you still see the latest data and how old it is

Private
• No account, no ads, no trackers
• Your location is only used to find your district and is not stored

Note: HazardWatch is not a warning service; its data is for information only. For warnings, check the agencies' own websites and channels. In an emergency follow local authorities and call 1784 (DDPM) or 191.
```

**App Store keywords** (100): `flood,rain,PM2.5,air quality,earthquake,Bangkok,Thailand,weather,dust,dam`

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
