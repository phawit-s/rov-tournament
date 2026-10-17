# คิวเพลง

ระบบขอเพลงสำหรับไลฟ์ — คนดูวางลิงก์ YouTube ส่งเข้าคิวของช่อง สตรีมเมอร์เปิดตัวเล่นที่เล่นตามคิวให้เอง
และวางกราฟิก "เพลงที่กำลังเล่น" ใน OBS ได้ ทำเป็น static site บน GitHub Pages หลังบ้านเป็น Firebase

**เว็บจริง:** [phawit-s.github.io/rov-tournament](https://phawit-s.github.io/rov-tournament/)

> ตุลาคม 2569 ตัดระบบทัวร์นาเมนต์ สุ่มทีม วงล้อ นาฬิกา และโดเนทออกทั้งหมด เหลือแค่ระบบขอเพลง
> ข้อมูลเก่าใน Firestore ไม่ได้ลบ (ช่องยังมีฟิลด์ donate/member/timer ค้างอยู่ เว็บแค่ไม่อ่าน)
> ดีไซน์ใหม่อธิบายไว้ที่ [docs/DESIGN.md](docs/DESIGN.md) — อ่านก่อนแก้หน้าตา

## หน้า

| หน้า | ใคร | ทำอะไร |
| --- | --- | --- |
| `/` | ทุกคน | ช่องที่เปิดรับเพลง แต่ละช่องโชว์ปกเพลงที่กำลังเล่นอยู่จริง |
| `/song/#h=ชื่อลิงก์` | คนดู | ขอเพลงกับช่องนั้น (ลิงก์นี้อยู่ใน QR บนไลฟ์ — ห้ามเปลี่ยนที่อยู่) |
| `/widget/song/?ch=รหัสช่อง` | OBS | กราฟิกเพลงที่กำลังเล่น พื้นโปร่งใส สามทรง (ดูด้านล่าง) |
| `/player/#ch=รหัสช่อง` | สตรีมเมอร์ | ตัวเล่น เปิดค้างไว้อีกหน้าต่างทั้งไลฟ์ เล่นตามคิวเอง |
| `/studio/` | สตรีมเมอร์ | ภาพรวม: เพลงที่เล่นอยู่ เปิด/ปิดรับเพลง ป้ายไลฟ์ ลิงก์ + QR |
| `/studio/queue/` | สตรีมเมอร์ | จัดคิว: เล่นเลย ข้าม ลบ ย้ายขึ้นหัวคิว ประวัติ |
| `/studio/channel/` | สตรีมเมอร์ | ชื่อช่อง ชื่อลิงก์ รูป กติกาการขอเพลง ลิงก์ค้นหาเพลง |
| `/studio/widgets/` | สตรีมเมอร์ | สร้างลิงก์ widget สำหรับ OBS พร้อมพรีวิวจริง |
| `/studio/roles/` 👑 | ผู้ดูแล | อนุมัติคำขอเป็นสตรีมเมอร์ จัดการผู้ดูแล |
| `/account/` | ผู้ใช้ | ชื่อที่แสดงเวลาขอเพลง ออกจากระบบ |

ทุกหน้าในสตูดิโอรู้ว่ากำลังทำงานกับช่องไหนจาก `#c=รหัสช่อง` (ดู `hooks/useStudioChannel.ts`)

ที่อยู่เก่าที่ยังเปิดได้: `/c/#h=` → `/song/#h=` · `/songs/` → `/` · `/channel/` `/widgets/` → สตูดิโอ

## Widget สำหรับ OBS

| ทรง | ลิงก์ | Browser Source |
| --- | --- | --- |
| แถบยาว + คิวถัดไป | `/widget/song/?ch=รหัสช่อง` | 620 × 300 |
| การ์ดสูง | `…&card=1` | 380 × 530 |
| การ์ดนอน | `…&card=wide` | 500 × 160 |

`&scale=` ขยาย/ย่อ · `&accent=` สีสำรองตอนยังไม่มีปก — คัดลอกลิงก์ที่ถูกต้องได้จาก `/studio/widgets/`
widget ใช้แคชในหน่วยความจำ (ไม่ใช่ IndexedDB) เพราะ browser source ทุกตัวใน OBS ใช้ที่เก็บข้อมูลร่วมกัน
และถ้าต่อฐานข้อมูลไม่ติดเกิน 15 วินาทีจะขึ้นป้ายบอก ไม่ใช่ "ไม่พบช่องนี้"

ตัวเล่น (`/player/`) ห้ามใส่เป็น Browser Source — ใน OBS ไม่ได้ล็อกอิน YouTube จะมีโฆษณาคั่น
ให้เปิดในเบราว์เซอร์ปกติแล้วดึงเสียงเข้า OBS ทาง Desktop Audio

## สิทธิ์

| บทบาท | ได้อะไร | ใครให้ |
| --- | --- | --- |
| **คนดู** | ขอเพลง ถอนเพลงของตัวเอง | ไม่ต้องสมัคร (ล็อกอินนิรนามให้ตอนกดส่ง) |
| **สตรีมเมอร์** | + สตูดิโอ ช่องของตัวเอง ตัวเล่น | ผู้ดูแลอนุมัติคำขอ (เอกสาร `streamers/{uid}`) |
| **ผู้ดูแล** 👑 | + ทุกช่องในระบบ ให้/ถอนสิทธิ์ | อีเมลใน `ownerEmails()` หรือเอกสาร `admins/{uid}` |

ขอเป็นสตรีมเมอร์: ล็อกอิน → เปิด `/studio/` → กรอกชื่อช่อง → ผู้ดูแลกดอนุมัติที่ `/studio/roles/`
สิทธิ์มีผลทันที ถอนสิทธิ์แล้วใบคำขอเดิมถูกลบด้วย คนนั้นยื่นใหม่ได้

### ตั้งผู้ดูแลคนแรก — ทำครั้งเดียว

1. แก้ `ownerEmails()` ใน [`firestore.rules`](firestore.rules) เป็นอีเมลที่ใช้ล็อกอิน
2. ส่งกติกาขึ้นไป: `npx firebase-tools deploy --only firestore:rules --project rov-tournament`
   หรือวางทั้งไฟล์ที่ Firebase Console → Firestore → Rules → Publish

> กติกาไม่ขึ้นตามตอน deploy เว็บ ต้องสั่งแยกทุกครั้งที่แก้ `firestore.rules`

## ตั้งค่า Firebase

1. สร้างโปรเจกต์ที่ [console.firebase.google.com](https://console.firebase.google.com)
2. Authentication → Sign-in method เปิด **Google**, **Email/Password** และ **Anonymous**
   (Anonymous ใช้กับคนดูที่ขอเพลง ไม่ต้องสมัครแต่ระบบได้ uid ไว้นับโควตาต่อคน)
3. Firestore Database → Create database แล้ว publish [firestore.rules](firestore.rules)
4. คัดลอกค่า Web app config ใส่ `.env.local` (ดู `.env.example`) และใส่เป็น GitHub Actions secrets ชื่อเดียวกัน
5. Authentication → Settings → Authorized domains เพิ่ม `phawit-s.github.io`

ช่องที่ไลฟ์ทุกคืนสะสมใบขอเพลงเป็นพันใบ หน้าเว็บจึงอ่านแค่คิวที่ยังไม่จบ ประวัติอ่านเฉพาะตอนเปิดดู
และล้างได้ที่ `/studio/queue/` (แพ็กเกจฟรีของ Firestore อ่านได้ 50,000 ครั้งต่อวัน)

## ค้นหาเพลง และขอเพลงจากแชท TikTok

- **ค้นหาในตัวเล่น** ต้องใช้คีย์ YouTube Data API ซึ่งฝังในหน้าเว็บไม่ได้ จึงอยู่ใน Cloudflare Worker ที่ [`worker/`](worker/)
  (`wrangler secret put YT_API_KEY` แล้ว `wrangler deploy`) จากนั้นวางลิงก์ Worker ที่ `/studio/channel/`
- **แชท TikTok** — คนดูพิมพ์ `!เพลง ชื่อเพลง` ในแชทไลฟ์ แล้วเพลงเข้าคิว ต้องรันโปรแกรมใน [`bridge/`](bridge/) บนเครื่องที่ไลฟ์

แก้ไฟล์ใน `worker/` แล้วต้อง `wrangler deploy` เอง — deploy เว็บไม่ได้ส่ง Worker ขึ้นไปด้วย

## รันในเครื่อง

```bash
npm install
npm run dev        # เปิดที่ http://localhost:3000 (ใช้ localhost ไม่ใช่ 127.0.0.1 — dev ของ Next 16 จะไม่ hydrate)
npm run build      # static export ไว้ที่ ./out
```

อย่ารัน `npm run build` ตอน `npm run dev` เปิดอยู่ในโฟลเดอร์เดียวกัน — `.next` ถูกเขียนทับแล้ว dev เพี้ยน

## Deploy

push ขึ้น `main` แล้ว [.github/workflows/deploy.yml](.github/workflows/deploy.yml) build และ deploy ขึ้น GitHub Pages ให้เอง
`basePath` ตั้งจากชื่อ repo อัตโนมัติ

## เทคโนโลยี

Next.js 16 (App Router, static export) · React 19 · Tailwind CSS v4 (ธีมสว่าง/มืดด้วย `data-theme` + CSS variables)
· ฟอนต์ Anuphan ผ่าน `next/font` · Firebase Auth + Firestore · YouTube IFrame API · Motion (เฉพาะการเคลื่อนไหวที่ตอบการกด)

## ความปลอดภัย

ความปลอดภัยอยู่ที่ Firestore Security Rules ไม่ใช่โค้ดหน้าเว็บ (API key ของ Firebase เป็นค่าสาธารณะตามการออกแบบ)

- คนดูสร้างได้แค่ใบขอเพลงสถานะ `queued` ที่ `byUid` เป็นตัวเอง และถอนได้เฉพาะใบของตัวเองที่ยังรอคิว
- จัดคิว (เปลี่ยนสถานะ ย้ายลำดับ) ได้เฉพาะเจ้าของช่องกับผู้ดูแล
- อนุมัติตัวเองเป็นสตรีมเมอร์ไม่ได้ และเปิดช่องใหม่ต้องมีสิทธิ์สตรีมเมอร์ก่อน
- URL ที่มาจากข้อมูลผู้ใช้ถูกกรองก่อนใส่ `href`/`src` ([lib/safe.ts](lib/safe.ts))
- เพดาน "กี่เพลงต่อคน / คิวยาวสุด" เช็คฝั่งหน้าเว็บ (กติกา Firestore นับเอกสารไม่ได้) — กันมือลั่น ไม่ใช่กันคนตั้งใจสแปม
