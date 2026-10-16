import type { Lang } from '@hw/core/i18n';

/** PDPA notice. Draft: have it legally reviewed before a public launch. */
export const privacy: Record<Lang, { updated: string; sections: { heading: string; body: string[] }[] }> = {
  th: {
    updated: 'ปรับปรุงล่าสุด 16 ตุลาคม 2569',
    sections: [
      {
        heading: 'สรุปสั้น ๆ',
        body: [
          'เราไม่เก็บชื่อ อีเมล เบอร์โทร หรือพิกัดที่อยู่ของคุณ',
          'ตำแหน่ง GPS ใช้หาเขต/อำเภอบนเครื่องของคุณ เพื่อดูสภาพอากาศเราส่งพิกัดแบบปัดเศษ (ประมาณ 1 กม.) ไปที่ API ของเรา ซึ่งส่งต่อให้ Open-Meteo และไม่ถูกบันทึกไว้',
          'ถ้าเปิดการแจ้งเตือน เราเก็บเพียง "เขต/อำเภอ" ที่คุณต้องการรับแจ้งเตือน เพื่อส่งข่าวภัยของพื้นที่นั้นให้คุณ',
        ],
      },
      {
        heading: 'ข้อมูลที่เก็บเมื่อเปิดการแจ้งเตือน',
        body: [
          'ที่อยู่สำหรับส่งการแจ้งเตือน (push endpoint) และกุญแจเข้ารหัสที่เบราว์เซอร์ของคุณสร้างให้ ใช้เพื่อส่งข้อความถึงเครื่องนี้เท่านั้น',
          'รหัสเขต/อำเภอ และแขวง/ตำบล (ถ้ามี) เช่น TH1028 — ไม่ใช่พิกัด',
          'ภาษา และเรื่องที่คุณเลือกรับแจ้งเตือน (เช่น น้ำท่วม ฝุ่น) รวมถึงระดับฝุ่นที่ต้องการให้แจ้ง และขนาด/ระยะของแผ่นดินไหวที่ต้องการให้แจ้ง',
          'บันทึกว่าส่งการแจ้งเตือนเรื่องใดไปแล้ว เพื่อไม่ให้ส่งซ้ำ (ลบอัตโนมัติภายในไม่กี่ชั่วโมง)',
          'เวลาที่สมัครและแก้ไขล่าสุด และจำนวนครั้งที่ส่งไม่สำเร็จติดกัน',
        ],
      },
      {
        heading: 'บันทึกของเซิร์ฟเวอร์และการป้องกันการใช้งานผิดวัตถุประสงค์',
        body: [
          'เราไม่เก็บบันทึกคำขอ (request log) ที่มีพิกัดหรือหมายเลข IP ของคุณ',
          'เพื่อกันการสมัคร/ยกเลิกการแจ้งเตือนถี่ผิดปกติ เราเก็บค่าแฮช (SHA-256) ของหมายเลข IP ของคุณ (สำหรับ IPv6 ใช้เฉพาะส่วนเครือข่าย /64) คู่กับจำนวนคำขอในช่วง 10 นาที ใช้เพื่อการนี้เท่านั้น และลบอัตโนมัติภายในประมาณครึ่งชั่วโมง',
          'คำขอดูสภาพอากาศถูกจำกัดจำนวนต่อหมายเลข IP ด้วยระบบของ Cloudflare โดยเราไม่ได้เก็บหมายเลข IP ไว้',
        ],
      },
      {
        heading: 'ข้อมูลที่เก็บในเครื่องของคุณ',
        body: [
          'ภาษาที่เลือก (cookie) ธีม โหมดสี และการตั้งค่าการแจ้งเตือน (local storage) — ไม่ถูกส่งให้เรา ยกเว้นการตั้งค่าการแจ้งเตือนเมื่อคุณกดเปิด',
        ],
      },
      {
        heading: 'ผู้ที่เกี่ยวข้องกับข้อมูล',
        body: [
          'ระบบทำงานบน Cloudflare ซึ่งเห็นหมายเลข IP ของคุณเช่นเดียวกับผู้ให้บริการโฮสต์เว็บทั่วไป และเก็บข้อมูลการแจ้งเตือน',
          'ข้อมูลสภาพอากาศและลมมาจาก Open-Meteo ซึ่งได้รับพิกัดแบบปัดเศษ (ประมาณ 1 กม.) และหมายเลข IP ของเซิร์ฟเวอร์เรา ไม่ใช่ของคุณ',
          'แผนที่พื้นหลังโหลดจาก OpenFreeMap (บริการสาธารณะ) ซึ่งจะเห็นหมายเลข IP ของคุณและบริเวณแผนที่ที่คุณเปิดดู (ซึ่งอาจอยู่ใกล้ที่ที่คุณอยู่) แต่ไม่ได้รับพิกัด GPS ของคุณ และไม่ใช้คุกกี้',
          'ชั้นแผนที่ดาวเทียมของ NASA (เช่น ฝน น้ำท่วม ควันและฝุ่น ภาพถ่ายดาวเทียม) ปิดไว้จนกว่าคุณจะเปิดเอง เมื่อเปิด เครื่องของคุณจะโหลดภาพจากบริการ GIBS ของ NASA โดยตรง ซึ่ง NASA จะได้รับหมายเลข IP ของคุณและบริเวณแผนที่ที่คุณเปิดดู โดยไม่ผ่านเซิร์ฟเวอร์ของเรา',
          'ข้อมูลจุดความร้อน (NASA FIRMS) และภัยธรรมชาติทั่วโลก (NASA EONET) เซิร์ฟเวอร์ของเราเป็นผู้ดึงมาจาก NASA โดยไม่ส่งข้อมูลใดเกี่ยวกับคุณไป ข้อมูล NASA ใช้แสดงผลเท่านั้น ไม่ใช่ประกาศเตือนภัยทางการ',
          'การแจ้งเตือนถูกส่งผ่านบริการของผู้ผลิตเบราว์เซอร์ เช่น Google, Apple, Mozilla, Microsoft',
          'เราไม่ขายหรือแบ่งปันข้อมูลเพื่อการโฆษณา และไม่มีตัวติดตาม (tracker)',
        ],
      },
      {
        heading: 'การเก็บรักษาและการลบ',
        body: [
          'เก็บจนกว่าคุณจะปิดการแจ้งเตือน หรือเบราว์เซอร์ยกเลิกการรับ เราลบอัตโนมัติเมื่อบริการส่งการแจ้งเตือนแจ้งว่าการรับนี้ไม่มีอยู่แล้ว หรือเมื่อส่งไม่สำเร็จ 3 ครั้งติดกัน',
          'กด "ปิดการแจ้งเตือน" ในหน้าหลักเพื่อลบข้อมูลของคุณทันที',
        ],
      },
      {
        heading: 'ส่วนขยายเบราว์เซอร์ (Chrome/Edge)',
        body: [
          'การตั้งค่า เขต/อำเภอที่เลือก และตำแหน่งโดยประมาณ เก็บไว้ในพื้นที่จัดเก็บของส่วนขยายบนเครื่องของคุณเท่านั้น',
          'ถ้าคุณใช้ตำแหน่ง GPS ส่วนขยายหาเขต/อำเภอบนเครื่องของคุณ ไม่ได้ส่งพิกัดไปเพื่อการนี้ จุดความร้อนและพายุของ NASA ในส่วนขยายมาจาก API ของเรา ส่วนขยายไม่ได้ติดต่อ NASA โดยตรง',
          'ส่วนขยายอ่านข้อมูลสาธารณะจาก API ของเราทุก 15 นาที และส่งพิกัดแบบปัดเศษ (ประมาณ 1 กม.) เฉพาะเพื่อดูสภาพอากาศ',
          'เมื่อข้อมูลน้ำท่วมและฝนของ กทม. บนเซิร์ฟเวอร์ของเราเก่ากว่า 10 นาที ส่วนขยายอาจโหลดข้อมูลสาธารณะชุดนี้จากเว็บไซต์ของ กทม. (ซึ่งจะเห็นหมายเลข IP ของคุณ) แล้วส่งต่อให้ API ของเราโดยไม่ดัดแปลงเพื่อให้ผู้ใช้ทุกคนเห็น โดยไม่แนบข้อมูลส่วนตัว ตำแหน่ง เขต/อำเภอ หรือการตั้งค่าของคุณ เซิร์ฟเวอร์รับข้อมูลนี้เฉพาะจากหมายเลข IP ในประเทศไทย และไม่บันทึกหมายเลข IP ไว้',
          'ไม่มีบัญชีผู้ใช้ และเราไม่เก็บข้อมูลใดของผู้ใช้ส่วนขยายไว้ที่เซิร์ฟเวอร์ การถอนการติดตั้งส่วนขยายจะลบข้อมูลทั้งหมด',
        ],
      },
      {
        heading: 'แอปมือถือ (Android/iOS)',
        body: [
          'การตั้งค่า เขต/อำเภอที่เลือก และการตั้งค่าการแจ้งเตือน เก็บไว้ในเครื่องของคุณเท่านั้น การลบแอปจะลบข้อมูลทั้งหมด',
          'ถ้าคุณกด "ใช้ตำแหน่งของฉัน" แอปส่งพิกัดแบบปัดเศษ (ประมาณ 1 กม.) ไปที่ API ของเราเพื่อหาเขต/อำเภอ และไม่ถูกบันทึกไว้ แอปไม่ใช้ตำแหน่งขณะทำงานเบื้องหลัง',
          'การแจ้งเตือนในแอปสร้างขึ้นบนเครื่องของคุณ: ประมาณทุก 15 นาที แอปขอข้อมูลสาธารณะของเขต/อำเภอที่เลือกจาก API ของเรา (ส่งเพียงรหัสเขต ไม่ใช่พิกัด) เราไม่เก็บข้อมูลการรับแจ้งเตือนของผู้ใช้แอปไว้ที่เซิร์ฟเวอร์',
          'เมื่อข้อมูลน้ำท่วมและฝนของ กทม. บนเซิร์ฟเวอร์ของเราเก่ากว่า 10 นาที แอป (เช่น เมื่อคุณเลือกเขตในกรุงเทพฯ หรือเปิดแท็บแผนที่) อาจโหลดข้อมูลชุดนี้จากเว็บไซต์ของ กทม. โดยตรง ซึ่งจะเห็นหมายเลข IP ของคุณ แต่ไม่ได้รับตำแหน่งของคุณ เมื่อโหลดได้ แอปส่งข้อมูลสาธารณะชุดนั้นต่อให้ API ของเราโดยไม่ดัดแปลงเพื่อให้ผู้ใช้ทุกคนเห็น โดยไม่แนบข้อมูลส่วนตัว ตำแหน่ง เขต/อำเภอ หรือการตั้งค่าของคุณ เซิร์ฟเวอร์รับข้อมูลนี้เฉพาะจากหมายเลข IP ในประเทศไทย และไม่บันทึกหมายเลข IP ไว้',
          'แผนที่พื้นหลังโหลดจาก OpenFreeMap (หรือ OpenStreetMap ถ้า OpenFreeMap ใช้งานไม่ได้) ซึ่งจะเห็นหมายเลข IP ของคุณและบริเวณแผนที่ที่คุณเปิดดู',
          'ถ้าคุณเปิดชั้นแผนที่ดาวเทียมของ NASA ในแท็บแผนที่ แอปโหลดภาพจากบริการ GIBS ของ NASA โดยตรง ซึ่ง NASA จะได้รับหมายเลข IP ของคุณและบริเวณแผนที่ที่คุณเปิดดู โดยไม่ผ่านเซิร์ฟเวอร์ของเรา จุดความร้อนและพายุของ NASA มาจาก API ของเรา',
          'เมื่อคุณกดลิงก์แหล่งข้อมูล แอปเปิดเว็บไซต์ของหน่วยงานในเบราว์เซอร์ โดยแอปไม่ได้ส่งข้อมูลใดไปให้',
          'ไม่มีบัญชีผู้ใช้ ไม่มีโฆษณา ไม่มีตัวติดตาม และไม่มีเครื่องมือวิเคราะห์หรือรายงานข้อผิดพลาด',
        ],
      },
      { heading: 'ติดต่อ', body: ['อีเมล support.pdouvch@gmail.com'] },
    ],
  },
  en: {
    updated: 'Last updated 16 October 2026',
    sections: [
      {
        heading: 'In short',
        body: [
          'We do not collect your name, email, phone number or your coordinates.',
          'Your GPS position is used on your device to find your district. For weather we send coordinates rounded to about 1 km to our API, which passes them to Open-Meteo; they are not stored.',
          'If you turn on alerts we keep only the district you want alerts for, so we can send you hazards for that area.',
        ],
      },
      {
        heading: 'What we store when you turn on alerts',
        body: [
          'The push address (endpoint) and encryption keys your browser creates, used only to deliver messages to this device.',
          'District and subdistrict codes (e.g. TH1028) — not coordinates.',
          'Your language, the alert topics you chose (e.g. flooding, PM2.5), your PM2.5 alert level and your earthquake alert level (magnitude and distance).',
          'A record of which alerts were sent, so they are not repeated (deleted automatically within hours).',
          'When you subscribed and last changed it, and a count of failed deliveries in a row.',
        ],
      },
      {
        heading: 'Server logs and abuse protection',
        body: [
          'We do not keep request logs with your coordinates or IP address.',
          'To stop alert sign-ups and sign-outs being abused, we keep a hashed (SHA-256) form of your IP address (for IPv6, only the /64 network part) with a count of requests per 10 minutes. It is used for nothing else and deleted automatically within about half an hour.',
          'Weather requests are limited per IP address by Cloudflare’s rate limiting; we do not store the address.',
        ],
      },
      {
        heading: 'What stays on your device',
        body: [
          'Language (cookie), theme, colour mode and alert settings (local storage) — not sent to us, except alert settings when you turn alerts on.',
        ],
      },
      {
        heading: 'Who handles the data',
        body: [
          'The service runs on Cloudflare, which sees your IP address as any web host does, and stores alert subscriptions.',
          'Weather and wind come from Open-Meteo, which receives coordinates rounded to about 1 km and our server’s IP address, not yours.',
          'The background map is loaded from OpenFreeMap (a public service), which sees your IP address and the map area you view (which may be near where you are), but not your GPS coordinates, and sets no cookies.',
          'NASA satellite map layers (e.g. rain, flooding, smoke and haze, satellite photo) are off until you turn them on. When you do, your device loads the images straight from NASA’s GIBS service, so NASA receives your IP address and the map area you view; our server is not involved.',
          'Fire hotspot (NASA FIRMS) and worldwide natural event (NASA EONET) data are fetched from NASA by our server; nothing about you is sent. NASA data is for display only and is not an official warning.',
          'Notifications are delivered through browser vendors’ push services, e.g. Google, Apple, Mozilla, Microsoft.',
          'We do not sell or share data for advertising and use no trackers.',
        ],
      },
      {
        heading: 'Retention and deletion',
        body: [
          'Kept until you turn alerts off or your browser cancels the subscription. We delete it automatically when the push service says it no longer exists, or after 3 failed deliveries in a row.',
          'Tap "Turn off alerts" on the main page to delete your data immediately.',
        ],
      },
      {
        heading: 'Browser extension (Chrome/Edge)',
        body: [
          'Your settings, chosen district and approximate location stay in the extension’s storage on your device.',
          'If you use GPS, the extension finds your district on your device; it does not send coordinates for this. NASA fire and storm data in the extension come from our API; the extension does not contact NASA directly.',
          'The extension reads public data from our API every 15 minutes and sends coordinates rounded to about 1 km only to look up the weather.',
          'When our server’s copy of Bangkok (BMA) flood and rain data is more than 10 minutes old, the extension may load that public data from the BMA website (which sees your IP address) and pass it on unchanged to our API so every user sees it. Nothing about you, your location, your district or your settings is attached; our server accepts this data only from Thai IP addresses and does not keep your IP address.',
          'There is no account, and we store nothing about extension users on our server. Uninstalling the extension deletes everything.',
        ],
      },
      {
        heading: 'Mobile app (Android/iOS)',
        body: [
          'Your settings, chosen district and alert settings stay on your device. Uninstalling the app deletes them.',
          'If you tap "Use my location", the app sends coordinates rounded to about 1 km to our API to find your district; they are not stored. The app never uses your location in the background.',
          'Alerts in the app are created on your device: about every 15 minutes it fetches public data for your chosen district from our API (the district code only, not coordinates). We store nothing about app users’ alerts on our server.',
          'When our server’s copy of Bangkok (BMA) flood and rain data is more than 10 minutes old, the app (for example, when you pick a Bangkok district or open the Map tab) may load it straight from the BMA website, which sees your IP address but not your location. When it does, the app passes that public data on unchanged to our API so every user sees it. Nothing about you, your location, your district or your settings is attached; our server accepts this data only from Thai IP addresses and does not keep your IP address.',
          'The background map is loaded from OpenFreeMap (or OpenStreetMap if OpenFreeMap is unavailable), which sees your IP address and the map area you view.',
          'If you turn on a NASA satellite map layer in the Map tab, the app loads the images straight from NASA’s GIBS service, so NASA receives your IP address and the map area you view; our server is not involved. NASA fire and storm data come from our API.',
          'Tapping a data source link opens the agency’s website in your browser; the app sends it nothing.',
          'There is no account, no ads, no trackers, and no analytics or crash-reporting tools.',
        ],
      },
      { heading: 'Contact', body: ['Email support.pdouvch@gmail.com'] },
    ],
  },
};
