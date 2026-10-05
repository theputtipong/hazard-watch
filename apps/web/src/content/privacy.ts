import type { Lang } from '@hw/core/i18n';

/**
 * Privacy notice (PDPA). Both languages side by side, like messages.ts.
 * ⚠️ Draft written for the app as built; have it reviewed before a public launch, and fill in the contact line.
 */
export const privacy: Record<Lang, { updated: string; sections: { heading: string; body: string[] }[] }> = {
  th: {
    updated: 'ปรับปรุงล่าสุด 5 ตุลาคม 2569',
    sections: [
      {
        heading: 'สรุปสั้น ๆ',
        body: [
          'เราไม่เก็บชื่อ อีเมล เบอร์โทร หรือพิกัดที่อยู่ของคุณ',
          'ตำแหน่ง GPS ใช้คำนวณบนเครื่องของคุณเท่านั้น และไม่ถูกส่งออกจากเครื่อง',
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
          'ภาพแผนที่พื้นหลังโหลดจาก Stadia Maps ซึ่งจะเห็นหมายเลข IP ของคุณและบริเวณแผนที่ที่คุณเปิดดู (ซึ่งอาจอยู่ใกล้ที่ที่คุณอยู่) แต่ไม่ได้รับพิกัด GPS ของคุณ',
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
      { heading: 'ติดต่อ', body: ['[ช่องทางติดต่อ — รอกำหนด]'] },
    ],
  },
  en: {
    updated: 'Last updated 5 October 2026',
    sections: [
      {
        heading: 'In short',
        body: [
          'We do not collect your name, email, phone number or your coordinates.',
          'Your GPS position is used on your device only and never leaves it.',
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
          'Background map images are loaded from Stadia Maps, which sees your IP address and the map area you view (which may be near where you are), but not your GPS coordinates.',
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
      { heading: 'Contact', body: ['[Contact — to be decided]'] },
    ],
  },
};
