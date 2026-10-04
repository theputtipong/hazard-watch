# งานที่ยังเหลือ · HazardWatch (เฝ้าระวังภัย)

> เอกสารนี้สรุปสิ่งที่ **ยังทำไม่ได้ / ยังไม่ได้ทำ** เพื่อทำงานต่อใน VS Code ได้ทันที
> อัปเดตล่าสุด: 4 ต.ค. 2026

---

## 1. สถานะปัจจุบัน

| ส่วน | สถานะ | ที่อยู่ |
|---|---|---|
| เว็บ (ทดลองใช้) | ✅ ออนไลน์ | https://hw-web.pdouvch.workers.dev |
| API / ตัวดึงข้อมูล | ✅ ออนไลน์ (cron ทุก 10 นาที) | https://hw-ingest.pdouvch.workers.dev |
| GitHub repo | ✅ Private | https://github.com/theputtipong/hazard-watch |
| GitHub Actions `ingest-runner` | ✅ ทำงานทุก 30 นาที (ThaiWater + CCTV) | `.github/workflows/ingest-runner.yml` |
| Cloudflare KV `SNAPSHOTS` | ✅ id `377230799e294be5a12ecc9ca7a9b0f3` | `apps/ingest/wrangler.jsonc` |
| Secrets | ✅ `INGEST_TOKEN` (Cloudflare + GitHub), `INGEST_URL` (GitHub) | ห้ามเขียนค่าลงไฟล์ |

### ข้อมูลที่ใช้งานได้จริงบนเว็บตอนนี้

| ข้อมูล | ใช้ได้ไหม | หมายเหตุ |
|---|---|---|
| สภาพอากาศ (Open-Meteo) | ✅ | |
| ฝุ่น PM2.5 (Air4Thai) | ✅ | 91 สถานี |
| แผ่นดินไหว (TMD + USGS) | ✅ | |
| ระดับน้ำคลอง/แม่น้ำ (ThaiWater) | ✅ เก็บแล้ว | **ยังไม่ได้แสดงบนเว็บ** |
| ภาพเรดาร์ (ThaiWater) | ✅ เก็บแล้ว | **ยังไม่ได้ปรับพิกัดให้ซ้อนบนแผนที่** |
| กล้อง CCTV (BMA Traffic) | ✅ | มีรายการซ้ำ (ดูข้อ 2.7) |
| **จุดน้ำท่วม + ฝน กทม. (BMA)** | ❌ | **ถูกบล็อก ดูข้อ 2.1** |

---

## 2. งานที่ยังทำไม่ได้ / ยังไม่ได้ทำ (เรียงตามความสำคัญ)

### 2.1 🔴 ดึงข้อมูลน้ำท่วม/ฝนของ กทม. ไม่ได้ (สำคัญที่สุด)

- **ปัญหา:** `weather.bangkok.go.th` ตอบ **403** ทั้งจาก Cloudflare และจาก GitHub Actions (ระบบกันบอท) ดึงได้เฉพาะจาก IP ในไทย เช่น เครื่องที่บ้าน
- **ห้าม** พยายามหลบระบบกันบอท (เช่นใช้ headless browser แก้ challenge)
- **ทางเลือก (รอตัดสินใจ):**

| ทางเลือก | ข้อดี | ข้อเสีย |
|---|---|---|
| ก. **GitHub self-hosted runner** บนเครื่องที่บ้าน (Mac/Raspberry Pi) | ใช้ workflow เดิมได้เลย ฟรี ไม่กินนาที Actions | เครื่องต้องเปิดตลอด ถ้าไฟดับ/เน็ตหลุด ข้อมูลหยุด |
| ข. ทำหนังสือขอ API/whitelist จาก **สำนักการระบายน้ำ กทม.** | ถูกต้อง ยั่งยืน | ใช้เวลานาน ไม่แน่นอน |
| ค. ทำ ก. ไปก่อน + ข. คู่ขนาน | ได้ข้อมูลเร็ว และมีทางระยะยาว | ต้องดูแล 2 ทาง |

- ไฟล์: `packages/sources/src/adapters/bma.ts`, `apps/ingest/scripts/runner.ts`
- ถ้าเลือก ก.: แยก job BMA ใน workflow ให้ `runs-on: self-hosted` ส่วน ThaiWater/CCTV ใช้ `ubuntu-latest` ต่อ

### 2.2 🔴 เรดาร์ฝนยังซ้อนบนแผนที่ไม่ได้

- **ปัญหา:** ภาพเรดาร์ (หนองแขม `nkm`, หนองจอก `njk`, สุวรรณภูมิ `svp120`) เป็นภาพนิ่งที่มีแผนที่/ตัวหนังสือ/legend ฝังมา ไม่ใช่ tile
- **ต้องทำ:**
  1. หาพิกัดมุมภาพ (bounds) ของแต่ละเรดาร์ โดยเทียบจุดอ้างอิงที่รู้พิกัด (เช่น ตำแหน่งเรดาร์ วงรัศมี ขอบจังหวัด)
  2. ตัด legend/ขอบออก (ทำใน runner ก่อนอัปโหลด หรือใช้ CSS clip)
  3. ใส่ค่าใน `RADAR_BOUNDS` ที่ `apps/web/src/lib/layers.ts` (ตอนนี้เป็น `null` ทั้งหมด)
  4. เพิ่มตัวเลือกเรดาร์ + ภาพย้อนหลัง (ตอนนี้เก็บแค่ภาพล่าสุดภาพเดียวต่อเรดาร์)
- หมายเหตุ: เวลาใน ThaiWater เขียนว่า "TST" แต่จริง ๆ เป็น **UTC** (จัดการไว้แล้วใน `thaiwater.ts`)

### 2.3 🔴 แผนที่แบบคลิกเจาะลึก จังหวัด → เขต/อำเภอ → แขวง/ตำบล

- **ปัญหา:** ยังไม่มีข้อมูลขอบเขตพื้นที่ (boundary)
- **รอตัดสินใจ:** อนุญาตให้ดาวน์โหลดจาก **OCHA HDX (Thailand admin boundaries)** หรือไม่ ⚠️ ต้องตรวจสัญญาอนุญาตและความใหม่ของข้อมูลระดับตำบลก่อนใช้
- **ต้องทำ:**
  1. ดาวน์โหลด + ลดความละเอียด (simplify) ให้ไฟล์เล็ก แยกไฟล์ตามระดับ/จังหวัด (โหลดเมื่อคลิกเท่านั้น)
  2. คำนวณสถานะของแต่ละพื้นที่ = แย่ที่สุดของจุดข้อมูลในพื้นที่ (ตามที่ตกลงใน mockup)
  3. ใช้คำว่า เขต/แขวง สำหรับ กทม. และ อำเภอ/ตำบล สำหรับจังหวัดอื่นอัตโนมัติ
  4. UI: breadcrumb, ปุ่มย้อนกลับ, รายการพื้นที่เรียงตามความรุนแรง, ประโยคสรุปภาษาคน (ดู mockup)
- **คำถามค้าง:** สถานะพื้นที่ใช้ "แย่ที่สุด" (จุดเดียวท่วม = ทั้งเขตแดง) หรือใช้สัดส่วน

### 2.4 🔴 แจ้งเตือน Push ขณะปิดแอป

- **ยังไม่ได้เริ่ม** ต้องทำ:
  1. ทำเป็น PWA (manifest + service worker) — iPhone ต้อง "เพิ่มลงหน้าจอโฮม" (iOS 16.4+)
  2. สร้าง VAPID keys เก็บเป็น secret
  3. เก็บ subscription + **เขตที่ผู้ใช้อยู่ (ไม่เก็บพิกัดละเอียด)** ใน Cloudflare D1
  4. ตอน cron: เทียบเกณฑ์ใน `packages/core/src/config.ts` แล้วส่ง push เฉพาะเขตที่เกี่ยวข้อง + กันส่งซ้ำ
  5. ออกแบบให้เพิ่มช่องทางได้ง่าย (Notifier interface) — Telegram / LINE Messaging API ภายหลัง (LINE Notify ปิดไปแล้ว)
- **ต้องมีหน้า "นโยบายความเป็นส่วนตัว" (PDPA)** ก่อนเปิดใช้ push

### 2.5 🟠 หน้าตั้งค่าการแจ้งเตือน

- มีใน mockup แล้ว แต่ยังไม่ได้ทำในแอปจริง
- ผู้ใช้ปรับได้: ค่าฝุ่นที่จะเตือน (ค่าเริ่มต้น 37.5), ขนาดแผ่นดินไหว (6.0), รัศมี (1,500 กม.)
- เก็บค่าในเครื่อง (localStorage) และส่งไปพร้อม subscription เมื่อเปิด push

### 2.6 🟠 แสดงระดับน้ำคลอง/แม่น้ำ (ThaiWater) บนเว็บ

- ข้อมูลเก็บอยู่แล้วใน snapshot (`runner.feeds.waterlevel`) แต่ยังไม่มีการ์ด/ชั้นแผนที่
- เกณฑ์: `waterLevel` ใน `config.ts` (80 / 100 / 120 % ของตลิ่ง)

### 2.7 🟡 บั๊กเล็ก ๆ ที่พบ

| บั๊ก | รายละเอียด | ไฟล์ |
|---|---|---|
| CCTV ซ้ำ | กล้องหลายตัวที่แยกเดียวกันชื่อเหมือนกัน (เช่น "แยกคอกวัว" ×4) ควรรวมเป็นรายการเดียว | `apps/web/src/components/Dashboard.tsx` (`nearCams`) |
| ชื่อแผ่นดินไหวจาก USGS เป็นอังกฤษในหน้าไทย | USGS ไม่มีชื่อไทย ควรแปลเป็น "ห่าง xx กม. จาก…" หรือใช้ชื่อประเทศ | `packages/sources/src/adapters/quakes.ts` |
| Air4Thai ใช้ไม่ได้ใน `wrangler dev` (เครื่อง local) | ใช้ได้ปกติบน Cloudflare จริง เป็นปัญหาของตัวจำลองเท่านั้น | — |
| ไม่มีหน้าแสดงเมื่อโหลดข้อมูลไม่สำเร็จ | ควรบอกผู้ใช้ว่า "ข้อมูลไม่อัปเดต" พร้อมเวลาล่าสุด | `HazardCards.tsx` |

### 2.8 🟡 ก่อนเปิดสาธารณะ

| เรื่อง | รายละเอียด |
|---|---|
| แผนที่พื้นหลัง | `tile.openstreetmap.org` ห้ามใช้หนัก ต้องเลือกผู้ให้บริการอื่น (รอตัดสินใจ) |
| ชื่อโดเมน | ตอนนี้ใช้ `*.workers.dev` |
| สิทธิ์ใช้ข้อมูล | ใช้ endpoint ไม่เป็นทางการของ กทม. (ใส่เครดิตแล้ว) — ควรขออนุญาต; Open-Meteo ฟรีเฉพาะ non-commercial (รับบริจาคน่าจะได้ ⚠️ ควรถามเขา) |
| เกณฑ์ฝน/ระดับน้ำ | ค่าในตอนนี้ (ฝน 10/35/60 มม./ชม.) **เป็นค่าประมาณ ยังไม่อ้างอิงมาตรฐาน** |
| ลิงก์ Buy Me a Coffee | ยังเป็นลิงก์หน้าแรก ต้องใส่ลิงก์ของจริง |
| Monitoring | แจ้งเตือนเมื่อแหล่งข้อมูลล่มนาน ๆ (เช่นดู `ok:false` ใน snapshot) |

### 2.9 ⚪ ข้อจำกัดแผนฟรีที่ต้องเฝ้าดู

| ข้อจำกัด | ตอนนี้ | เพดาน |
|---|---|---|
| Worker bundle (เว็บ, gzip) | 2.27 MB | 3 MB — ระวังเพิ่ม dependency ใหญ่ |
| KV เขียน/วัน | ~150 (edge) + ~50 (runner) + ~150 (เรดาร์) | 1,000 |
| GitHub Actions (private) | 30 นาที/ครั้ง ≈ 1,440 นาที/เดือน | 2,000 นาที/เดือน |

### 2.10 ⚪ อนาคต: ขยายทั้งประเทศ / ต่างประเทศ

- เพิ่มพื้นที่ที่ `packages/core/src/regions.ts` (`REGIONS` + `ACTIVE_REGION_IDS`)
- ข้อมูล BMA มีเฉพาะ กทม. — จังหวัดอื่นต้องหาแหล่งน้ำท่วม/ฝนแทน (เช่น ThaiWater)
- ข้อมูล ThaiWater ทั้งประเทศมี ~808 สถานี snapshot จะใหญ่ขึ้น อาจต้องแยก key ตามภูมิภาค
- ต่างประเทศ: ต้องเพิ่ม adapter ของประเทศนั้น + ภาษาใหม่ใน `messages.ts`

### 2.11 ⚪ อื่น ๆ

- Mockup (claude.ai artifact) ยังใช้ชื่อเก่า "ฟ้าฝนกรุงเทพ"

---

## 3. การตัดสินใจที่รออยู่

1. วิธีดึงข้อมูล BMA (ข้อ 2.1): ก / ข / ค
2. อนุญาตดาวน์โหลดขอบเขตพื้นที่จาก OCHA HDX (ข้อ 2.3)
3. สถานะพื้นที่: "แย่ที่สุด" หรือ "สัดส่วน" (ข้อ 2.3)
4. ผู้ให้บริการแผนที่พื้นหลัง (ข้อ 2.8)
5. เกณฑ์ฝน/ระดับน้ำ มีมาตรฐานอ้างอิงไหม (ข้อ 2.8)

---

## 4. เริ่มทำงานใน VS Code

ต้องมี Node 22 และ pnpm 10 (pnpm 12 ผ่าน corepack ใช้กับ Node 22.19 ไม่ได้)

```bash
corepack install -g pnpm@10.34.6
pnpm install
cp apps/ingest/.dev.vars.example apps/ingest/.dev.vars
cp apps/web/.env.example apps/web/.env.local
```

รันในเครื่อง (เปิด 3 terminal):

```bash
pnpm --filter @hw/ingest dev
```

```bash
INGEST_URL=http://localhost:8787 INGEST_TOKEN=dev-token-change-me pnpm --filter @hw/ingest runner
```

```bash
pnpm --filter @hw/web dev
```

- เว็บ: http://localhost:3000 · API: http://localhost:8787
- สั่งให้ cron ทำงานทันที (local): `curl "localhost:8787/__scheduled?cron=*/10+*+*+*+*"`

ตรวจก่อน commit:

```bash
pnpm typecheck && pnpm test
```

Deploy:

```bash
pnpm --filter @hw/ingest run deploy
```

```bash
cd apps/web && NEXT_PUBLIC_API_BASE=https://hw-ingest.pdouvch.workers.dev pnpm run deploy
```

สั่งดึงข้อมูล edge บนเซิร์ฟเวอร์จริงทันที (ต้องมี token):

```bash
curl -X POST -H "Authorization: Bearer $INGEST_TOKEN" https://hw-ingest.pdouvch.workers.dev/ingest/run-edge
```

---

## 5. ข้อมูลอ้างอิงที่ควรรู้

| เรื่อง | ความหมาย |
|---|---|
| BMA `flood_sub_status` | 1 = ปกติ, 2 = ท่วมเล็กน้อย, 3 = ท่วม, 0/5 = ขัดข้อง · `flood` = ความลึก (ซม.) |
| BMA endpoint | ต้องเรียกแบบ **POST** body `{}` ไม่มีเอกสารทางการ อาจเปลี่ยนได้ |
| ThaiWater `situation_level` | ตามเปอร์เซ็นต์ตลิ่ง: 1 ≤10%, 2 10–30%, 3 30–70%, 4 70–100%, 5 >100% (ล้นตลิ่ง) |
| ThaiWater จาก Cloudflare | โดน **429** (จำกัดการใช้) — จึงดึงผ่าน GitHub Actions |
| ภาพเรดาร์ ThaiWater | `/api/v1/thaiwater30/shared/image?image=<media_path>` |
| ที่อยู่ของค่าตั้งต่าง ๆ | เกณฑ์: `packages/core/src/config.ts` · พื้นที่: `regions.ts` · ข้อความ 2 ภาษา: `i18n/messages.ts` |
| Mockup | https://claude.ai/artifact/RB1Kaztz8X1cM5y1ue5vew |
