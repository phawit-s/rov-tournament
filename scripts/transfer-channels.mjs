/**
 * ย้ายเจ้าของช่อง + ปรับสิทธิ์ (แอดมิน → สตรีมเมอร์)
 *
 * ใช้ครั้งเดียวแล้วเก็บไว้เป็นตัวอย่างของงานแบบเดียวกันในอนาคต
 *
 * ────────────────────────────────────────────────────────────────
 * วิธีรัน
 * ────────────────────────────────────────────────────────────────
 *
 *  1. ลง SDK ฝั่งเซิร์ฟเวอร์แบบไม่ผูกเข้าโปรเจกต์ (มันตัวใหญ่ และเว็บไม่ได้ใช้)
 *     npm i --no-save firebase-admin
 *
 *  2. เอากุญแจของเซิร์ฟเวอร์มา (ไม่ต้องส่งให้ใคร เก็บไว้ในเครื่องคุณ)
 *     https://console.firebase.google.com/project/rov-tournament/settings/serviceaccounts/adminsdk
 *     → Generate new private key → ได้ไฟล์ .json มา
 *
 *  3. ดูก่อนว่าจะแก้อะไรบ้าง — โหมดนี้ไม่เขียนอะไรเลย
 *     node scripts/transfer-channels.mjs
 *     node scripts/transfer-channels.mjs --key="C:\path\ไฟล์ที่โหลดมา.json"
 *
 *  4. พอใจแล้วค่อยลงมือจริง
 *     node scripts/transfer-channels.mjs --apply
 *
 *  กุญแจหาได้จากสามที่ ตามลำดับ: --key=... → GOOGLE_APPLICATION_CREDENTIALS
 *  → scripts/service-account.json
 *
 * ────────────────────────────────────────────────────────────────
 * ★ ยังมีอีกหนึ่งอย่างที่สคริปต์นี้ทำให้ไม่ได้ ★
 * ────────────────────────────────────────────────────────────────
 *
 * warissaramala@gmail.com เป็นผู้ดูแลเพราะอีเมลถูกเขียนไว้ใน firestore.rules
 * (ฟังก์ชัน ownerEmails) ไม่ใช่เพราะมีเอกสาร admins/{uid} — ลบเอกสารจึงไม่มีผล
 *
 * ต้องแก้ไฟล์ firestore.rules เอง:
 *     return ['phawit.ps@gmail.com', 'warissaramala@gmail.com'];
 *   → return ['phawit.ps@gmail.com'];
 * แล้ว publish กติกาใหม่ ไม่งั้นบัญชีนั้นยังเป็นผู้ดูแลเต็มยศอยู่
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/** ฐานข้อมูลที่สคริปต์นี้ตั้งใจจะแตะ — กุญแจของโปรเจกต์อื่นต้องถูกปฏิเสธ */
const EXPECT_PROJECT = "rov-tournament";

/** งานที่จะทำ — แก้ตรงนี้ที่เดียวถ้าจะย้ายช่องอื่นในอนาคต */
const JOBS = [
  { handle: "affarain", newOwnerEmail: "warissaramala@gmail.com" },
  { handle: "bammmmyyi", newOwnerEmail: "bam130544@gmail.com" },
];

/** บัญชีที่ต้องถอดจากผู้ดูแล แล้วเปลี่ยนเป็นสตรีมเมอร์แทน */
const DEMOTE_TO_STREAMER = [
  "warissaramala@gmail.com",
  "bam130544@gmail.com",
];

const APPLY = process.argv.includes("--apply");
const here = dirname(fileURLToPath(import.meta.url));

/**
 * หากุญแจจากที่ที่คนน่าจะวางไว้จริง
 *
 * ไฟล์ที่โหลดจาก Firebase Console ชื่อยาวและมักตกอยู่ใน Downloads
 * การบังคับให้ย้ายมาวางชื่อเป๊ะๆ ที่เดียวเป็นขั้นตอนที่พลาดง่ายโดยไม่จำเป็น
 */
function findKeyPath() {
  const fromArg = process.argv.find((a) => a.startsWith("--key="))?.slice(6);
  const candidates = [
    fromArg,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    join(here, "service-account.json"),
  ].filter(Boolean);

  for (const c of candidates) {
    const full = isAbsolute(c) ? c : resolve(process.cwd(), c);
    if (existsSync(full)) return full;
  }
  return null;
}

function die(lines) {
  console.error(`\n${lines.join("\n")}\n`);
  process.exit(1);
}

const keyPath = findKeyPath();
if (!keyPath) {
  die([
    "❌ ยังไม่เจอกุญแจของเซิร์ฟเวอร์ (service account key)",
    "",
    "สคริปต์นี้เขียนข้อมูลจริงบน Firestore จึงต้องใช้กุญแจฝั่งเซิร์ฟเวอร์",
    "ล็อกอินเว็บด้วยบัญชีแอดมินอย่างเดียวไม่พอ",
    "",
    "วิธีเอามา (ทำครั้งเดียว ~1 นาที):",
    "  1. เปิด https://console.firebase.google.com/project/rov-tournament/settings/serviceaccounts/adminsdk",
    "  2. กด “Generate new private key” → ยืนยัน → เบราว์เซอร์จะโหลดไฟล์ .json มาให้",
    "  3. เลือกทางใดทางหนึ่ง",
    "",
    "     ก. ย้ายไฟล์มาวางที่  scripts/service-account.json  แล้วรันคำสั่งเดิม",
    "",
    "     ข. ไม่ต้องย้าย ชี้ไปที่ไฟล์ตรงๆ เลย",
    '        node scripts/transfer-channels.mjs --key="C:\\Users\\phawit-s\\Downloads\\ชื่อไฟล์ที่โหลดมา.json"',
    "",
    "ไฟล์นี้คือกุญแจผ่านทุกด่านของฐานข้อมูล — เก็บไว้ในเครื่องคุณเท่านั้น",
    "ห้ามส่งให้ใคร ห้ามขึ้น git (ใส่ .gitignore ไว้ให้แล้ว) ใช้เสร็จลบทิ้งได้เลย",
  ]);
}

let key;
try {
  key = JSON.parse(readFileSync(keyPath, "utf8"));
} catch (err) {
  die([
    `❌ อ่านกุญแจไม่ได้: ${keyPath}`,
    `   ${err.message}`,
    "",
    "ไฟล์อาจโหลดมาไม่ครบ หรือเป็นไฟล์คนละชนิด — โหลดใหม่จาก Console อีกครั้ง",
  ]);
}

if (!key.project_id || !key.client_email) {
  die([
    `❌ ไฟล์นี้ไม่ใช่ service account key: ${keyPath}`,
    "   ในไฟล์ต้องมีทั้ง project_id และ client_email",
    "",
    "ระวังสับสนกับ “ค่าตั้งค่าฝั่งเว็บ” (apiKey/authDomain) ซึ่งคนละอย่างกัน",
  ]);
}

/*
  กันจับกุญแจผิดโปรเจกต์

  สคริปต์นี้เขียนทับเจ้าของช่องและสิทธิ์ผู้ใช้ ถ้าเผลอชี้ไปฐานข้อมูลของโปรเจกต์อื่น
  ความเสียหายเกิดทันทีและย้อนกลับไม่ได้ — ยอมหยุดดีกว่าเดาว่าคงตั้งใจ
*/
if (key.project_id !== EXPECT_PROJECT) {
  die([
    "❌ กุญแจนี้เป็นของคนละโปรเจกต์ — หยุดไว้ก่อน",
    `   ในไฟล์ : ${key.project_id}`,
    `   ต้องการ : ${EXPECT_PROJECT}`,
    "",
    `โหลดกุญแจของ ${EXPECT_PROJECT} มาใหม่ หรือถ้าตั้งใจจริงให้แก้ EXPECT_PROJECT ในสคริปต์`,
  ]);
}

initializeApp({ credential: cert(key) });
const db = getFirestore();
const auth = getAuth();

console.log(`ฐานข้อมูล : ${key.project_id}`);
console.log(`กุญแจ     : ${keyPath}`);
console.log(`บัญชีระบบ : ${key.client_email}\n`);

const log = (...a) => console.log(...a);
const warn = (...a) => console.log("  ⚠ ", ...a);

log(APPLY ? "โหมด: เขียนจริง\n" : "โหมด: ดูอย่างเดียว (ใส่ --apply เพื่อเขียนจริง)\n");

/** uid ของอีเมลนี้ — ไม่มีบัญชีก็ต้องหยุด ไม่ใช่เขียนสิทธิ์ให้ uid ที่ไม่มีตัวตน */
async function uidOf(email) {
  try {
    return (await auth.getUserByEmail(email)).uid;
  } catch {
    return null;
  }
}

/* ───────────────── 1. ย้ายเจ้าของช่อง ───────────────── */

log("── ย้ายเจ้าของช่อง ──");
for (const job of JOBS) {
  const snap = await db
    .collection("channels")
    .where("handle", "==", job.handle)
    .limit(2)
    .get();

  if (snap.empty) {
    warn(`@${job.handle} — ไม่เจอช่องนี้ ข้าม`);
    continue;
  }
  if (snap.size > 1) {
    // handle ซ้ำแปลว่ามีอะไรผิดปกติอยู่ก่อนแล้ว อย่าเดาว่าจะเอาใบไหน
    warn(`@${job.handle} — เจอ ${snap.size} ใบที่ handle ซ้ำกัน ข้ามไว้ก่อน ต้องดูด้วยตา`);
    continue;
  }

  const doc = snap.docs[0];
  const data = doc.data();
  const newUid = await uidOf(job.newOwnerEmail);

  if (!newUid) {
    warn(`@${job.handle} — ยังไม่มีบัญชี ${job.newOwnerEmail} (ต้องล็อกอินเว็บหนึ่งครั้งก่อน) ข้าม`);
    continue;
  }
  if (data.ownerUid === newUid) {
    log(`  @${job.handle} — เป็นของ ${job.newOwnerEmail} อยู่แล้ว ไม่ต้องทำอะไร`);
    continue;
  }

  log(`  @${job.handle}  (เอกสาร ${doc.id})`);
  log(`     เจ้าของเดิม : ${data.ownerEmail ?? "-"}  [${data.ownerUid}]`);
  log(`     เจ้าของใหม่ : ${job.newOwnerEmail}  [${newUid}]`);

  /*
    ชื่อเอกสารบังเอิญเท่ากับ uid ของเจ้าของเดิม = ช่องแรกที่เขาสร้างเอง

    ย้ายได้ตามปกติ แต่ต้องแน่ใจว่าเว็บเลิกเดา "ชื่อเอกสาร = uid" แล้ว
    ไม่งั้นเจ้าของเดิมที่ไม่เหลือช่องจะเปิดหน้าช่องแล้วมาเจอเอกสารนี้พอดี
    แล้วหน้าจะขึ้นว่าเป็นช่องของเขา (แก้ไปแล้วที่ ChannelSettings)
  */
  if (doc.id === data.ownerUid) {
    warn("ชื่อเอกสารเท่ากับ uid ของเจ้าของเดิม — ต้องใช้เว็บรุ่นที่หาช่องจาก ownerUid");
  }

  if (APPLY) {
    /*
      แก้แค่สองฟิลด์ ไม่ย้ายเอกสาร

      หน้าเว็บถูกแก้ให้หา "ช่องของฉัน" จาก ownerUid แล้ว (ไม่เดาจากชื่อเอกสาร)
      ชื่อเอกสารจึงไม่ต้องเปลี่ยนตาม — ซึ่งดีกว่ามาก เพราะลิงก์ widget ที่แจกไป
      แล้วใช้ ?ch=<ชื่อเอกสาร> และใบสลิป/คิวเพลงทั้งหมดอยู่ใต้เอกสารนี้
    */
    await doc.ref.update({
      ownerUid: newUid,
      ownerEmail: job.newOwnerEmail,
      updatedAt: new Date().toISOString(),
      syncedAt: FieldValue.serverTimestamp(),
    });
    log("     ✓ ย้ายแล้ว");
  }
}

/* ───────────────── 2. แอดมิน → สตรีมเมอร์ ───────────────── */

log("\n── ถอดจากผู้ดูแล เปลี่ยนเป็นสตรีมเมอร์ ──");

const ROOT_OWNERS_IN_RULES = ["phawit.ps@gmail.com", "warissaramala@gmail.com"];

for (const email of DEMOTE_TO_STREAMER) {
  const uid = await uidOf(email);
  if (!uid) {
    warn(`${email} — ยังไม่มีบัญชี ข้าม`);
    continue;
  }

  const adminRef = db.collection("admins").doc(uid);
  const hasAdminDoc = (await adminRef.get()).exists;
  const streamerRef = db.collection("streamers").doc(uid);
  const alreadyStreamer = (await streamerRef.get()).exists;

  log(`  ${email}  [${uid}]`);
  log(`     เอกสารผู้ดูแล : ${hasAdminDoc ? "มี → จะลบ" : "ไม่มี"}`);
  log(`     สิทธิ์สตรีมเมอร์ : ${alreadyStreamer ? "มีแล้ว" : "ยังไม่มี → จะเพิ่ม"}`);

  if (ROOT_OWNERS_IN_RULES.includes(email)) {
    warn(
      `${email} อยู่ใน ownerEmails() ของ firestore.rules —\n` +
        "        ต้องเอาอีเมลออกจากไฟล์นั้นแล้ว publish เอง ไม่งั้นยังเป็นผู้ดูแลอยู่",
    );
  }

  if (APPLY) {
    if (hasAdminDoc) await adminRef.delete();
    if (!alreadyStreamer) {
      await streamerRef.set({
        uid,
        label: email,
        email,
        grantedAt: new Date().toISOString(),
        grantedBy: "migration script",
      });
    }
    log("     ✓ ปรับสิทธิ์แล้ว");
  }
}

/* ---------------- 3. อ่านกลับมาตรวจ ----------------
   เขียนสำเร็จไม่ได้แปลว่าผลถูก — อ่านของจริงกลับมาดูถูกกว่าเชื่อว่าคงผ่าน */

if (APPLY) {
  log("");
  log("-- ตรวจผลจากของจริง --");
  let bad = 0;

  for (const job of JOBS) {
    const snap = await db
      .collection("channels")
      .where("handle", "==", job.handle)
      .limit(1)
      .get();
    const got = snap.docs[0]?.data();
    const want = await uidOf(job.newOwnerEmail);
    const ok = !!got && !!want && got.ownerUid === want;
    if (!ok) bad++;
    log(`  @${job.handle} -> ${ok ? "OK เป็นของเจ้าของใหม่แล้ว" : "!! ยังไม่ถูก"}`);
  }

  for (const email of DEMOTE_TO_STREAMER) {
    const uid = await uidOf(email);
    if (!uid) continue;
    const stillAdmin = (await db.collection("admins").doc(uid).get()).exists;
    const isStreamer = (await db.collection("streamers").doc(uid).get()).exists;
    const ok = !stillAdmin && isStreamer;
    if (!ok) bad++;
    log(
      `  ${email} -> ${ok ? "OK สตรีมเมอร์" : `!! ผู้ดูแล=${stillAdmin} สตรีมเมอร์=${isStreamer}`}`,
    );
  }

  log("");
  log(bad === 0 ? "ทุกอย่างตรงตามที่ตั้งใจ" : `!! มี ${bad} อย่างที่ยังไม่ถูก ดูข้างบน`);
}

log("");
if (APPLY) {
  log("ยังเหลืออีกหนึ่งอย่างที่ต้องทำเอง:");
  log("  แก้ ownerEmails() ใน firestore.rules ให้เหลือ ['phawit.ps@gmail.com']");
  log("  แล้ว publish กติกา ไม่งั้น warissaramala@gmail.com ยังเป็นผู้ดูแลอยู่");
} else {
  log("ยังไม่ได้เขียนอะไรเลย · ใส่ --apply เมื่อพร้อม");
}
