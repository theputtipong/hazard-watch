import type { Lang } from '@hw/core/i18n';

/** PDPA notice. Draft: have it legally reviewed before a public launch. */
export const privacy: Record<Lang, { updated: string; sections: { heading: string; body: string[] }[] }> = {
  th: {
    updated: 'ปรับปรุงล่าสุด 11 ตุลาคม 2569',
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
          'ระบบทำงานบน Cloudflare (เก็บข้อมูลการแจ้งเตือน)',
          'ข้อมูลสภาพอากาศและลมมาจาก Open-Meteo ซึ่งได้รับพิกัดแบบปัดเศษ (ประมาณ 1 กม.) และหมายเลข IP ของเซิร์ฟเวอร์เรา ไม่ใช่ของคุณ',
          'แผนที่พื้นหลังโหลดจาก OpenFreeMap (บริการสาธารณะ) ซึ่งจะเห็นหมายเลข IP ของคุณและบริเวณแผนที่ที่คุณเปิดดู (ซึ่งอาจอยู่ใกล้ที่ที่คุณอยู่) แต่ไม่ได้รับพิกัด GPS ของคุณ และไม่ใช้คุกกี้',
          'การแจ้งเตือนถูกส่งผ่านบริการของผู้ผลิตเบราว์เซอร์ เช่น Google, Apple, Mozilla, Microsoft',
          'เราไม่ขายหรือแบ่งปันข้อมูลเพื่อการโฆษณา และไม่มีตัวติดตาม (tracker)',
        ],
      },
      {
        heading: 'การเก็บรักษาและการลบ',
        body: [
          'เก็บจนกว่าคุณจะปิดการแจ้งเตือน หรือเบราว์เซอร์ยกเลิกการรับ (เราจะลบอัตโนมัติเมื่อส่งไม่ได้)',
          'กด "ปิดการแจ้งเตือน" ในหน้าหลักเพื่อลบข้อมูลของคุณทันที',
        ],
      },
      {
        heading: 'ส่วนขยายเบราว์เซอร์ (Chrome/Edge)',
        body: [
          'การตั้งค่า เขต/อำเภอที่เลือก และตำแหน่งโดยประมาณ เก็บไว้ในพื้นที่จัดเก็บของส่วนขยายบนเครื่องของคุณเท่านั้น',
          'ส่วนขยายอ่านข้อมูลสาธารณะจาก API ของเราทุก 15 นาที และส่งพิกัดแบบปัดเศษ (ประมาณ 1 กม.) เฉพาะเพื่อดูสภาพอากาศ',
          'ไม่มีบัญชีผู้ใช้ และเราไม่เก็บข้อมูลใดของผู้ใช้ส่วนขยายไว้ที่เซิร์ฟเวอร์ การถอนการติดตั้งส่วนขยายจะลบข้อมูลทั้งหมด',
        ],
      },
      {
        heading: 'แอปมือถือ (Android/iOS)',
        body: [
          'การตั้งค่า เขต/อำเภอที่เลือก และการตั้งค่าการแจ้งเตือน เก็บไว้ในเครื่องของคุณเท่านั้น การลบแอปจะลบข้อมูลทั้งหมด',
          'ถ้าคุณกด "ใช้ตำแหน่งของฉัน" แอปส่งพิกัดแบบปัดเศษ (ประมาณ 1 กม.) ไปที่ API ของเราเพื่อหาเขต/อำเภอ และไม่ถูกบันทึกไว้ แอปไม่ใช้ตำแหน่งขณะทำงานเบื้องหลัง',
          'การแจ้งเตือนในแอปสร้างขึ้นบนเครื่องของคุณ: ประมาณทุก 15 นาที แอปขอข้อมูลสาธารณะของเขต/อำเภอที่เลือกจาก API ของเรา (ส่งเพียงรหัสเขต ไม่ใช่พิกัด) เราไม่เก็บข้อมูลการรับแจ้งเตือนของผู้ใช้แอปไว้ที่เซิร์ฟเวอร์',
          'ในกรุงเทพฯ แอปอาจโหลดข้อมูลน้ำท่วมและฝนจากเว็บไซต์ของ กทม. โดยตรง ซึ่งจะเห็นหมายเลข IP ของคุณ แต่ไม่ได้รับตำแหน่งของคุณ',
          'แผนที่พื้นหลังโหลดจาก OpenFreeMap (หรือ OpenStreetMap ถ้า OpenFreeMap ใช้งานไม่ได้) ซึ่งจะเห็นหมายเลข IP ของคุณและบริเวณแผนที่ที่คุณเปิดดู',
          'ไม่มีบัญชีผู้ใช้ ไม่มีโฆษณา ไม่มีตัวติดตาม และไม่มีเครื่องมือวิเคราะห์หรือรายงานข้อผิดพลาด',
        ],
      },
      { heading: 'ติดต่อ', body: ['อีเมล support.pdouvch@gmail.com'] },
    ],
  },
  en: {
    updated: 'Last updated 11 October 2026',
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
          'The service runs on Cloudflare (stores alert subscriptions).',
          'Weather and wind come from Open-Meteo, which receives coordinates rounded to about 1 km and our server’s IP address, not yours.',
          'The background map is loaded from OpenFreeMap (a public service), which sees your IP address and the map area you view (which may be near where you are), but not your GPS coordinates, and sets no cookies.',
          'Notifications are delivered through browser vendors’ push services, e.g. Google, Apple, Mozilla, Microsoft.',
          'We do not sell or share data for advertising and use no trackers.',
        ],
      },
      {
        heading: 'Retention and deletion',
        body: [
          'Kept until you turn alerts off or your browser cancels the subscription (we delete it automatically when delivery fails).',
          'Tap "Turn off alerts" on the main page to delete your data immediately.',
        ],
      },
      {
        heading: 'Browser extension (Chrome/Edge)',
        body: [
          'Your settings, chosen district and approximate location stay in the extension’s storage on your device.',
          'The extension reads public data from our API every 15 minutes and sends coordinates rounded to about 1 km only to look up the weather.',
          'There is no account, and we store nothing about extension users on our server. Uninstalling the extension deletes everything.',
        ],
      },
      {
        heading: 'Mobile app (Android/iOS)',
        body: [
          'Your settings, chosen district and alert settings stay on your device. Uninstalling the app deletes them.',
          'If you tap "Use my location", the app sends coordinates rounded to about 1 km to our API to find your district; they are not stored. The app never uses your location in the background.',
          'Alerts in the app are created on your device: about every 15 minutes it fetches public data for your chosen district from our API (the district code only, not coordinates). We store nothing about app users’ alerts on our server.',
          'In Bangkok the app may load flood and rain data straight from the BMA website, which sees your IP address but not your location.',
          'The background map is loaded from OpenFreeMap (or OpenStreetMap if OpenFreeMap is unavailable), which sees your IP address and the map area you view.',
          'There is no account, no ads, no trackers, and no analytics or crash-reporting tools.',
        ],
      },
      { heading: 'Contact', body: ['Email support.pdouvch@gmail.com'] },
    ],
  },
};
