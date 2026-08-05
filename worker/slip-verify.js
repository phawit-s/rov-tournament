/**
 * ตัวกลางตรวจสลิป (Cloudflare Worker)
 * ------------------------------------------------------------------
 * ทำไมต้องมีไฟล์นี้
 *   หน้าเว็บของเราเป็น static export (ไม่มีเซิร์ฟเวอร์ ไม่มี API route)
 *   ถ้าเอา API key ของผู้ให้บริการตรวจสลิปไปใส่ในหน้าเว็บ ใครเปิด devtools ก็อ่านได้
 *   แล้วเอาโควตาเราไปใช้ฟรี อีกอย่างผู้ให้บริการส่วนใหญ่ไม่เปิด CORS
 *   เรียกจากเบราว์เซอร์ตรงๆ ไม่ได้อยู่ดี
 *
 *   Worker ตัวนี้เลยทำหน้าที่ "คนกลาง" คือถือคีย์ไว้ฝั่งเซิร์ฟเวอร์
 *   รับ payload จาก QR บนสลิป ยิงต่อไปหาผู้ให้บริการ แล้วคืนผลรูปแบบเดียวกันกลับมา
 *
 * ไม่ deploy ไฟล์นี้ก็ยังใช้งานเว็บได้ ระบบจะตรวจแค่ "สลิปซ้ำ" ซึ่งกันการโกง
 * ที่เจอบ่อยที่สุดได้อยู่แล้ว (ดู worker/README.md)
 *
 * สัญญาการเรียก
 *   POST /  JSON { payload, expectAmount?, expectAccount? }
 *   ตอบ    200 เสมอ  { ok, reason?, amount, at, bank, receiver, raw }
 *
 * ตอบ 200 เสมอโดยตั้งใจ เพราะฝั่งเว็บถือว่า "ตรวจไม่ผ่าน" กับ "ตรวจไม่ได้"
 * เป็นคนละเรื่องกับ "เว็บพัง" การคืน 500 เปล่าๆ จะทำให้ fetch ฝั่งเว็บ
 * ต้องไปเดาเองว่าเกิดอะไรขึ้น
 */

/* ------------------------------------------------------------------ *
 * ตาราง adapter ของผู้ให้บริการ
 *
 * !! คำเตือน !!
 * endpoint, ชื่อฟิลด์ และรูปแบบ header ของแต่ละเจ้า "เปลี่ยนได้ตลอด"
 * ข้อมูลชุดนี้รวบรวมไว้ ณ ก.ค. 2026 ก่อนใช้จริงให้เปิดเอกสารล่าสุด
 * ของผู้ให้บริการเทียบอีกรอบ ถ้าเจ้าไหนเปลี่ยน แก้แค่ในตารางนี้พอ
 *
 * แต่ละ adapter มีสองหน้าที่เท่านั้น
 *   request(payload, env) -> { url, init }   สร้างคำขอ
 *   ส่วนการอ่านผลลัพธ์ใช้ตัวแกะกลาง (normalize) ร่วมกัน เพราะทุกเจ้า
 *   ใช้ชื่อฟิลด์คล้ายกันมาก ต่างแค่ระดับความลึกของ object
 * ------------------------------------------------------------------ */

const ADAPTERS = {
  /**
   * EasySlip — GET พร้อม payload ใน query string
   * เอกสาร: https://document.easyslip.com
   * ผลลัพธ์ประมาณ { status: 200, data: { amount: { amount }, sender, receiver, date } }
   */
  easyslip: {
    label: "EasySlip",
    request(payload, env) {
      const url =
        "https://developer.easyslip.com/api/v1/verify?payload=" +
        encodeURIComponent(payload);
      return {
        url,
        init: {
          method: "GET",
          headers: { Authorization: `Bearer ${env.API_KEY}` },
        },
      };
    },
  },

  /**
   * SlipOK — POST เข้า endpoint ที่ผูกกับสาขา (branch id) ของเรา
   * ต้องตั้ง env.BRANCH_ID ด้วย ไม่งั้นไม่รู้ว่ายิงเข้าสาขาไหน
   * เอกสาร: https://slipok.com
   * ผลลัพธ์ประมาณ { success: true, data: { amount, transDate, transTime, sendingBank, receiver } }
   */
  slipok: {
    label: "SlipOK",
    request(payload, env) {
      const branch = (env.BRANCH_ID || "").trim();
      // ไม่มี branch id ก็ยิงไม่ได้ โยนออกไปให้ตัวเรียกจับแล้วแปลงเป็น reason
      if (!branch) throw new Error("missing-branch-id");
      return {
        url: `https://api.slipok.com/api/line/apikey/${encodeURIComponent(branch)}`,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // สังเกตว่าเจ้านี้ใช้ header ชื่อ x-authorization ไม่ใช่ Authorization
            "x-authorization": env.API_KEY,
          },
          body: JSON.stringify({ data: payload }),
        },
      };
    },
  },

  /**
   * Thunder — เจ้าเดียวที่มีโควตาฟรี (150 สลิป/เดือน) จึงตั้งเป็นค่าเริ่มต้น
   * เอกสาร: https://document.thunder.in.th/en/examples/javascript
   *
   * ตอบกลับ
   *   { success: true,
   *     data: { rawSlip: { transRef, date,
   *                        amount: { amount, local: { amount, currency } },
   *                        sender:   { bank: { id, name, short }, account: { name: { th, en } } },
   *                        receiver: { bank: {...}, account: { name: {...} } } },
   *             isDuplicate: false },
   *     error: null, message: null }
   *
   * ไม่ส่ง matchAmount ไปให้เขาเช็คโดยตั้งใจ เพราะถ้าไม่ตรงเขาจะตอบเป็น error
   * ซึ่งเราแยกไม่ออกว่า "ยอดไม่ตรง" หรือ "สลิปเสีย" — เทียบยอดเองข้างล่างชัดกว่า
   *
   * checkDuplicate ปิดไว้เพราะเรากันสลิปซ้ำที่ Firestore (slipRefs) ไปแล้ว
   * ซึ่งทำงานตั้งแต่ยังไม่ได้ต่อ API และไม่กินโควตา
   */
  thunder: {
    label: "Thunder",
    request(payload, env) {
      return {
        url: "https://api.thunder.in.th/v2/verify/bank",
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${env.API_KEY}`,
          },
          body: JSON.stringify({
            payload,
            checkDuplicate: false,
            matchAccount: false,
          }),
        },
      };
    },
  },
};

/* ------------------------------------------------------------------ *
 * ตัวช่วยแกะค่าออกจากผลลัพธ์
 * ------------------------------------------------------------------ */

/** เดินตาม path แบบ "data.amount.amount" ถ้าเจอ undefined ระหว่างทางก็คืน undefined */
function at(obj, path) {
  let cur = obj;
  for (const key of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[key];
  }
  return cur;
}

/** ลอง path หลายอันตามลำดับ คืนอันแรกที่ผ่านเงื่อนไข */
function firstOf(obj, paths, accept) {
  for (const path of paths) {
    const value = at(obj, path);
    if (accept(value)) return value;
  }
  return undefined;
}

/**
 * แปลงเป็นตัวเลขยอดเงิน
 * บางเจ้าคืนเป็นสตริง "1,000.00" บางเจ้าคืนเป็น number ตรงๆ
 */
function toAmount(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[, ]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

const AMOUNT_PATHS = [
  // Thunder v2 ห่อไว้ใต้ data.rawSlip ต้องมาก่อน ไม่งั้นตกไปเจอ path ตื้นกว่าที่เป็น object
  "data.rawSlip.amount.amount",
  "data.rawSlip.amount.local.amount",
  "amount",
  "data.amount",
  "data.amount.amount",
  "data.amount.local.amount",
  "amount.amount",
  "data.transAmount",
  "data.paid_local_amount",
  "result.amount",
];

/**
 * ดึงยอดเงิน — ต้องมีตัวนี้แยกจาก firstOf เพราะบางเจ้า (EasySlip) ใส่ data.amount
 * เป็น "object" ที่มียอดซ้อนอยู่ข้างใน ถ้าเอาอันแรกที่ไม่ว่างจะได้ object มาแทนตัวเลข
 * จึงต้องไล่จนกว่าจะแปลงเป็นตัวเลขได้จริง
 */
function pickAmount(json) {
  for (const path of AMOUNT_PATHS) {
    const n = toAmount(at(json, path));
    if (n !== null) return n;
  }
  return null;
}

const DATE_PATHS = [
  "data.rawSlip.date",
  "data.date",
  "data.transDate",
  "data.transTimestamp",
  "date",
  "transDate",
  "data.transaction_date",
  "result.date",
];

const TIME_PATHS = ["data.transTime", "transTime", "data.time"];

const BANK_PATHS = [
  "data.rawSlip.sender.bank.name",
  "data.rawSlip.sender.bank.short",
  "data.sendingBank",
  "data.sender.bank.name",
  "data.sender.bank.short",
  "data.sender.bank.id",
  "sender.bank.name",
  "data.sender.bankName",
  "sendingBank",
];

const RECEIVER_NAME_PATHS = [
  "data.rawSlip.receiver.account.name.th",
  "data.rawSlip.receiver.account.name.en",
  "data.receiver.displayName",
  "data.receiver.name",
  "data.receiver.account.name",
  "receiver.displayName",
  "receiver.name",
  "data.receiverName",
];

/**
 * เลขบัญชีปลายทาง — เก็บ "ทุก" path ที่เจอ ไม่ใช่อันแรกที่เจอ
 *
 * ปลายทางใบเดียวมีได้หลายเลขพร้อมกัน: เลขบัญชีธนาคาร กับพร็อกซีพร้อมเพย์
 * (เบอร์มือถือ/เลขบัตร) ซึ่งไม่เท่ากันเลยสักหลัก ถ้าเอาแค่อันแรกที่เจอมาเทียบ
 * ช่องที่ตั้งพร้อมเพย์เป็นเบอร์มือถือจะถูกตัดสินว่า "บัญชีไม่ตรง" ทั้งที่โอนถูกบัญชี
 * — เทียบทีละอันแล้วผ่านถ้ามีอันไหนตรง จึงเป็นวิธีเดียวที่ไม่ปัดตกสลิปที่ถูกต้อง
 *
 * Thunder v2 ห่อของจริงไว้ใต้ data.rawSlip เหมือน AMOUNT/DATE/BANK ต้องมีให้ครบ
 * ไม่งั้นจะอ่านเลขปลายทางไม่เจอเลย แล้วกลายเป็น "เทียบไม่ได้" ทุกใบ
 */
const RECEIVER_ACCOUNT_PATHS = [
  "data.rawSlip.receiver.account.value",
  "data.rawSlip.receiver.account.bank.account",
  "data.rawSlip.receiver.account.proxy.account",
  "data.rawSlip.receiver.account.proxy.value",
  "data.rawSlip.receiver.proxy.value",
  "data.receiver.account.value",
  "data.receiver.account.bank.account",
  "data.receiver.account.proxy.account",
  "data.receiver.account.proxy.value",
  "data.receiver.proxy.value",
  "data.receiver.account",
  "data.receivingBank",
  "receiver.account.value",
  "receiver.account",
];

/**
 * ข้อความบอกเหตุจากผู้ให้บริการ ส่งต่อให้ผู้จัดเห็นจะได้แก้ถูก
 * Thunder ห่อไว้ใต้ error ที่เป็น object เช่น
 *   { success:false, error:{ code:"VALIDATION_ERROR", message:"Invalid bank slip format..." } }
 * ถ้าไล่แค่ "error" เฉยๆ จะได้ object ซึ่งไม่ผ่าน isNonEmptyString แล้วตกไปเป็น null
 */
const MESSAGE_PATHS = [
  "error.message",
  "error.code",
  "message",
  "data.message",
  "error",
];

const isNonEmptyString = (v) => typeof v === "string" && v.trim() !== "";
const isSomething = (v) => v !== undefined && v !== null && v !== "";

/**
 * ผลลัพธ์ของแต่ละเจ้าหน้าตาไม่เหมือนกันเลย
 * ฟังก์ชันนี้ยุบให้เหลือรูปเดียว { amount, at, bank, receiver, receiverAccount }
 * โดยไล่ลองชื่อฟิลด์ที่เป็นไปได้ทั้งหมด แทนที่จะเขียนแยกทีละเจ้า
 * (เพิ่มเจ้าใหม่ส่วนใหญ่จึงไม่ต้องแตะฟังก์ชันนี้ แค่เติม path ถ้าชื่อแปลกจริงๆ)
 */
function normalize(json) {
  const amount = pickAmount(json);

  const rawDate = firstOf(json, DATE_PATHS, isSomething);
  const rawTime = firstOf(json, TIME_PATHS, isNonEmptyString);
  const when = toIso(rawDate, rawTime);

  const bank = firstOf(json, BANK_PATHS, isNonEmptyString) ?? null;
  const receiver = firstOf(json, RECEIVER_NAME_PATHS, isNonEmptyString) ?? null;

  const receiverAccounts = collectAccounts(json);

  return {
    amount,
    at: when,
    bank,
    receiver,
    // อันแรกไว้โชว์ในใบ ส่วนการเทียบใช้ทั้งลิสต์
    receiverAccount: receiverAccounts[0] ?? null,
    receiverAccounts,
  };
}

/**
 * เก็บเลขบัญชีปลายทางที่เป็นไปได้ทั้งหมดจากผลของผู้ให้บริการ
 * แต่ละ path อาจเป็นสตริงตรงๆ หรือเป็น object ที่ห่อเลขไว้อีกชั้น
 */
function collectAccounts(json) {
  const found = [];
  const push = (value) => {
    if (typeof value !== "string" && typeof value !== "number") return;
    const text = String(value).trim();
    if (text && !found.includes(text)) found.push(text);
  };

  for (const path of RECEIVER_ACCOUNT_PATHS) {
    const value = at(json, path);
    if (value && typeof value === "object") {
      for (const key of ["value", "account", "bank.account", "proxy.account", "proxy.value"]) {
        push(at(value, key));
      }
    } else {
      push(value);
    }
  }
  return found;
}

/**
 * ทำวันเวลาให้เป็น ISO ถ้าแปลงไม่ได้ก็คืนสตริงดิบ ดีกว่าทิ้งข้อมูลไป
 * รองรับรูปแบบที่เจอบ่อย
 *   - ISO อยู่แล้ว "2026-07-29T10:20:30+07:00"
 *   - "20260729" + transTime "10:20:30" (SlipOK)
 *   - epoch เป็นวินาทีหรือมิลลิวินาที
 */
function toIso(rawDate, rawTime) {
  if (rawDate === undefined || rawDate === null || rawDate === "") return null;

  if (typeof rawDate === "number") {
    // ตัวเลขสั้น = วินาที ตัวเลขยาว = มิลลิวินาที
    const ms = rawDate < 1e12 ? rawDate * 1000 : rawDate;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? String(rawDate) : d.toISOString();
  }

  const text = String(rawDate).trim();

  // "20260729" ล้วน — ต่อกับ transTime ถ้ามี แล้วตีความเป็นเวลาไทย (+07:00)
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (compact) {
    const time = rawTime && /^\d{2}:\d{2}/.test(rawTime) ? rawTime : "00:00:00";
    const padded = time.length === 5 ? `${time}:00` : time;
    const d = new Date(
      `${compact[1]}-${compact[2]}-${compact[3]}T${padded}+07:00`,
    );
    return Number.isNaN(d.getTime()) ? text : d.toISOString();
  }

  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text : d.toISOString();
}

/* ------------------------------------------------------------------ *
 * การตรวจฝั่ง Worker
 *
 * สำคัญ: ห้ามเชื่อฝั่งเบราว์เซอร์อย่างเดียว เพราะใครก็ยิง POST มาที่ Worker
 * เองได้ ถ้าให้เบราว์เซอร์เป็นคนตัดสินว่า "ยอดตรง" ก็แค่แก้ค่าใน devtools
 * เราจึงเทียบยอดและเลขบัญชีปลายทางซ้ำอีกรอบตรงนี้
 * ------------------------------------------------------------------ */

/** ยอมให้ยอดต่างได้ไม่เกินเท่านี้ (บาท) กันปัญหาปัดเศษ/ค่าธรรมเนียม */
const AMOUNT_TOLERANCE = 1;

/** จำนวนหลักท้ายที่ใช้เทียบเลขบัญชี สลิปมักปิดเลขกลางเป็น x */
const ACCOUNT_TAIL = 4;

/** เหลือเฉพาะตัวเลข ใช้เทียบเลขบัญชีที่ฟอร์แมตต่างกัน (xxx-x-x1234-x) */
function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * เทียบเลขบัญชีปลายทาง — ดูแค่หลักท้าย เพราะสลิปกับ API ปิดเลขไม่เหมือนกัน
 * ถ้าฝั่งใดฝั่งหนึ่งสั้นเกินจนเทียบไม่ได้ ให้ถือว่า "เทียบไม่ได้" (null)
 * ไม่ใช่ "ไม่ตรง" จะได้ไม่ปัดตกสลิปที่ถูกต้อง
 *
 * actual รับได้ทั้งค่าเดียวและลิสต์ ปลายทางใบเดียวมีทั้งเลขบัญชีและพร็อกซี
 * ตรงอันไหนก็ถือว่าตรง จะไม่ตรงได้ก็ต่อเมื่อเทียบได้ครบทุกอันแล้วไม่ตรงสักอัน
 */
function accountMatches(expect, actual) {
  const a = digitsOnly(expect);
  if (a.length < ACCOUNT_TAIL) return null;

  const list = (Array.isArray(actual) ? actual : [actual])
    .map(digitsOnly)
    .filter((b) => b.length >= ACCOUNT_TAIL);
  if (list.length === 0) return null;

  return list.some((b) => b.slice(-ACCOUNT_TAIL) === a.slice(-ACCOUNT_TAIL));
}

/* ------------------------------------------------------------------ *
 * อนุมัติใบให้เองหลังตรวจสลิปผ่าน
 *
 * ทำไมต้องให้ Worker เป็นคนอนุมัติ ไม่ใช่หน้าเว็บ:
 * เว็บเป็น static ไม่มีเซิร์ฟเวอร์ ถ้าให้เบราว์เซอร์ของผู้จัดเป็นคนอนุมัติ
 * มันจะทำงานเฉพาะตอนผู้จัดเปิดหน้าตั้งค่าค้างไว้ ซึ่งตอนไลฟ์จริงไม่มีใครเปิด
 * ใบเลยค้าง pending แล้ว widget ไม่เด้ง ทั้งที่สลิปผ่านการตรวจแล้ว
 *
 * ส่วนจะให้เบราว์เซอร์ของ "คนโอน" เขียนสถานะเองก็ไม่ได้ เพราะใครก็แก้โค้ด
 * ฝั่งหน้าเว็บให้เขียน approved โดยไม่โอนจริงได้ ต้องมีตัวที่เชื่อถือได้เป็นคนเขียน
 * Worker คือตัวนั้น เพราะมันถือความลับและผู้ใช้แก้โค้ดมันไม่ได้
 *
 * วิธีให้สิทธิ์: ใช้บัญชี Firebase ธรรมดาหนึ่งบัญชี ("บอท") แล้วใส่ uid ของมัน
 * ลงคอลเลกชัน admins กติกาเดิมจะปล่อยให้มันแก้ใบโดเนทของทุกช่องได้เอง
 * ไม่ต้องใช้ service account และไม่ต้องเซ็น JWT เอง
 *
 * ไม่ตั้ง BOT_EMAIL/BOT_PASSWORD ก็ยังใช้งานได้ Worker จะแค่ตรวจแล้วตอบผลกลับ
 * ปล่อยให้ผู้จัดกดอนุมัติเองเหมือนเดิม
 * ------------------------------------------------------------------ */

/** เก็บ token ไว้ใช้ซ้ำ ไม่ต้องล็อกอินใหม่ทุกใบ (idToken ของ Firebase อยู่ได้ 1 ชม.) */
let botToken = null;
let botExpiry = 0;
/** uid ของบัญชีบอท เอาไว้โชว์ในหน้า health จะได้เอาไปใส่ admins ได้เลย */
let lastBotUid = null;

async function botLogin_(env) {
  const now = Date.now();
  if (botToken && now < botExpiry) return botToken;

  const r = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: env.BOT_EMAIL,
        password: env.BOT_PASSWORD,
        returnSecureToken: true,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const j = await r.json();
  if (!j.idToken) {
    // ส่งรหัสเหตุของ Google ต่อออกไป จะได้รู้ว่าต้องแก้อะไร
    // (EMAIL_NOT_FOUND = ยังไม่ได้สร้างบัญชี, INVALID_LOGIN_CREDENTIALS = อีเมล
    //  หรือรหัสผ่านผิด, API key not valid = FIREBASE_API_KEY ผิด)
    // ไม่มีความลับอยู่ในข้อความพวกนี้ มีแต่บอกว่าเราตั้งค่าพลาดตรงไหน
    const why =
      j?.error?.message ?? (r.status === 400 ? "BAD_REQUEST" : `HTTP_${r.status}`);
    throw new Error(`bot-login-failed: ${why}`);
  }

  lastBotUid = j.localId ?? null;
  botToken = j.idToken;
  // เผื่อเวลาไว้ 5 นาที กันหมดอายุกลางคัน
  botExpiry = now + (Number(j.expiresIn || 3600) - 300) * 1000;
  return botToken;
}

const fsUrl = (env, path) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT}/databases/(default)/documents/${path}`;

/**
 * อนุมัติใบ — คืนเหตุผลถ้าทำไม่ได้ ไม่ throw ออกไป
 *
 * อ่านใบก่อนเสมอ แล้วเทียบยอดกับที่เพิ่งตรวจได้จริง
 * เพราะคนเรียก Worker เป็นเบราว์เซอร์ของคนโอน ซึ่งจะส่ง donationId อะไรมาก็ได้
 * ถ้าไม่เทียบ ก็เท่ากับใครก็สั่งอนุมัติใบของคนอื่นได้ด้วยสลิปของตัวเอง
 *
 * เทียบ "ปลายทาง" ด้วย ไม่ใช่แค่ยอด และต้องอ่านเลขพร้อมเพย์จาก Firestore เอง
 * ห้ามใช้ expectAccount ที่เบราว์เซอร์ส่งมาเด็ดขาด เพราะคนยิงเป็นคนโอน:
 * โอนเข้าบัญชี "ตัวเอง" ให้ยอดตรงกับใบ แล้วบอก Worker ว่าปลายทางคือบัญชีตัวเอง
 * สลิปก็จริงทุกอย่าง ผ่านการตรวจกับธนาคารจริง แต่เงินไม่เคยไปถึงเจ้าของช่อง
 * — ใบขึ้นจอสตรีมพร้อมยอดเต็ม และไปบวกเงินรางวัลทัวร์ด้วย โดยไม่มีใครจ่ายอะไรเลย
 */
async function approveDonation(env, channelId, donationId, verified) {
  if (!env.BOT_EMAIL || !env.BOT_PASSWORD || !env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT) {
    return "no-bot";
  }
  if (!channelId || !donationId) return "no-target";

  const token = await botLogin_(env);
  const auth = { Authorization: `Bearer ${token}` };
  const path = `channels/${encodeURIComponent(channelId)}/donations/${encodeURIComponent(donationId)}`;
  const channelPath = `channels/${encodeURIComponent(channelId)}`;

  // ดึงพร้อมกัน คนโอนรออยู่หน้าเว็บ ไม่ต้องต่อคิวสองรอบ
  const [cur, channel] = await Promise.all([
    fetch(fsUrl(env, path), { headers: auth }).then((r) => r.json()),
    fetch(fsUrl(env, channelPath), { headers: auth }).then((r) => r.json()),
  ]);

  if (!cur.fields) return "donation-not-found";
  if (cur.fields.status?.stringValue !== "pending") return "not-pending";

  const claimed = toAmount(
    cur.fields.amount?.integerValue ?? cur.fields.amount?.doubleValue,
  );
  if (claimed === null || Math.abs(claimed - verified.amount) > AMOUNT_TOLERANCE) {
    return "amount-mismatch";
  }

  /*
    ปลายทางต้องเป็นบัญชีของช่องนี้จริง

    เทียบไม่ได้ (null) ไม่ใช่เรื่องเล็กตรงนี้ เพราะขาตัดสินใจนี้ไม่มีคนดูอยู่
    ปล่อยผ่านเมื่อ "ไม่รู้" = เปิดช่องให้สลิปที่โอนเข้าบัญชีตัวเองผ่านได้ทันที
    ที่ผู้ให้บริการไม่ส่งเลขปลายทางกลับมา จึงต้องตกไปให้เจ้าของช่องดูด้วยตาแทน
    (ใบยังอยู่ครบในสถานะ pending ไม่ได้หายไปไหน)
  */
  const payTo =
    channel?.fields?.donate?.mapValue?.fields?.promptPayId?.stringValue ?? "";
  if (!payTo) return "channel-has-no-account";

  const toUs = accountMatches(
    payTo,
    verified.receiverAccounts ?? verified.receiverAccount,
  );
  if (toUs === false) return "account-mismatch";
  if (toUs === null) return "account-unconfirmed";

  // เขียนเฉพาะฟิลด์ที่ตั้งใจ updateMask กันเผลอทับฟิลด์อื่นทั้งเอกสาร
  const mask = [
    "status",
    "autoApproved",
    "slipCheck",
    "slipAmount",
    "slipAt",
    "slipBank",
    "slip",
  ]
    .map((f) => `updateMask.fieldPaths=${f}`)
    .join("&");

  const w = await fetch(`${fsUrl(env, path)}?${mask}`, {
    method: "PATCH",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: {
        status: { stringValue: "approved" },
        autoApproved: { booleanValue: true },
        slipCheck: { stringValue: "verified" },
        slipAmount: { doubleValue: verified.amount },
        slipAt: verified.at ? { stringValue: verified.at } : { nullValue: null },
        slipBank: verified.bank ? { stringValue: verified.bank } : { nullValue: null },
        // ใบที่อนุมัติแล้วอ่านได้แบบสาธารณะ (widget ไม่ล็อกอิน) รูปสลิปต้องไม่ติดไปด้วย
        slip: { nullValue: null },
      },
    }),
  });

  return w.ok ? "approved" : `write-failed-${w.status}`;
}

/* ------------------------------------------------------------------ *
 * rate limit แบบง่าย
 *
 * นับในหน่วยความจำของ instance เดียว
 * ข้อจำกัด: Cloudflare รัน Worker หลาย instance กระจายตาม data center
 * แต่ละตัวนับแยกกัน และหน่วยความจำหายเมื่อ instance ถูกรีไซเคิล
 * ตัวเลขจริงจึงอาจสูงกว่าที่ตั้งไว้ ถือว่าเป็นแค่กันยิงรัวๆ
 * ถ้าต้องการนับแม่นจริง ให้ย้ายไปใช้ KV (พอสำหรับหยาบๆ)
 * หรือ Durable Object (แม่นที่สุด เพราะมีจุดนับจุดเดียว)
 * ------------------------------------------------------------------ */

const hits = new Map();

/** คืน true ถ้ายังยิงได้ / false ถ้าเกินโควตานาทีนี้ */
function allow(key, maxPerMin) {
  if (!maxPerMin || maxPerMin <= 0) return true; // ไม่ได้ตั้งค่า = ไม่จำกัด

  const now = Date.now();
  const bucket = Math.floor(now / 60000); // เปลี่ยนถังทุก 1 นาที

  // เก็บกวาดถังเก่าไปด้วย ไม่งั้น Map โตไม่หยุดถ้า instance อยู่ยาว
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.bucket !== bucket) hits.delete(k);
  }

  const prev = hits.get(key);
  if (!prev || prev.bucket !== bucket) {
    hits.set(key, { bucket, count: 1 });
    return true;
  }
  if (prev.count >= maxPerMin) return false;
  prev.count += 1;
  return true;
}

/* ------------------------------------------------------------------ *
 * HTTP
 * ------------------------------------------------------------------ */

/**
 * เลือก Access-Control-Allow-Origin
 *
 * ALLOWED_ORIGIN ใส่ได้หลายโดเมนคั่นด้วยจุลภาค เช่น
 *   "https://phawit-s.github.io,http://localhost:3000"
 * เพราะเว็บจริงกับตอนพัฒนาในเครื่องคนละ origin กัน แต่สเปก CORS
 * ให้ตอบกลับได้ทีละหนึ่งค่าเท่านั้น จึงต้องสะท้อน origin ที่ยิงเข้ามา
 * เฉพาะตัวที่อยู่ในรายการ ที่เหลือปฏิเสธ
 *
 * ไม่ตั้งค่าไว้เลย = "*" ซึ่งแปลว่าเว็บไหนก็เรียก Worker เราได้
 * และเอาโควตาที่เราจ่ายไปใช้ฟรี — ห้ามปล่อยแบบนั้นตอนใช้จริง
 */
function pickOrigin(request, env) {
  const raw = (env.ALLOWED_ORIGIN || "*").trim();
  if (raw === "*") return "*";

  const list = raw
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const origin = (request.headers.get("Origin") || "").replace(/\/+$/, "");

  if (origin && list.includes(origin)) return origin;
  // ไม่ตรงสักอัน — ตอบโดเมนแรกไป เบราว์เซอร์จะบล็อกให้เอง
  return list[0] || "*";
}

function corsHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": pickOrigin(request, env),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    // คำตอบขึ้นกับ Origin ต้องบอก cache ไม่งั้นโดเมนหนึ่งจะได้ header ของอีกโดเมน
    Vary: "Origin",
  };
}

/**
 * ตอบกลับเป็น JSON status 200 เสมอ (ดูเหตุผลที่หัวไฟล์)
 * รับ cors ที่คำนวณไว้แล้วแทน env เพราะการเลือก origin ต้องดู request
 * ซึ่งเก็บไว้ในตัวแปรระดับโมดูลไม่ได้ — Worker รับหลายคำขอพร้อมกัน
 */
function reply(body, cors) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}

/** รูปแบบ "ไม่ผ่าน" มาตรฐาน ฟิลด์ครบเหมือนกรณีผ่าน ฝั่งเว็บจะได้ไม่ต้องเช็ค undefined */
function fail(reason, cors, extra) {
  return reply(
    {
      ok: false,
      reason,
      amount: null,
      at: null,
      bank: null,
      receiver: null,
      raw: null,
      ...extra,
    },
    cors,
  );
}

const handler = {
  async fetch(request, env) {
    // คำนวณครั้งเดียวต่อคำขอ แล้วส่งต่อให้ทุกทางออก จะได้ไม่มีทางลืมใส่ CORS
    const cors = corsHeaders(request, env);

    // จับทุกอย่างไว้ชั้นนอกสุด ห้ามให้หลุดเป็น 500 เปล่าๆ
    try {
      if (request.method === "OPTIONS") {
        // preflight — ไม่มี body
        return new Response(null, { status: 204, headers: cors });
      }

      /*
        เช็คสถานะการตั้งค่า — เปิดด้วย GET ?health=1
        มีไว้เพราะถ้าไม่มีทางนี้ จะรู้ว่าตั้งค่าครบไหมก็ต่อเมื่อมีคนโอนจริง
        คืนแค่ว่า "ตั้งแล้วหรือยัง" กับ "ล็อกอินบอทผ่านไหม" ไม่คืนค่าความลับใดๆ
      */
      if (new URL(request.url).searchParams.get("health") === "1") {
        /*
          รายงานความยาวกับอักขระหัวท้ายด้วย ไม่ใช่แค่ "มีค่าไหม"
          เพราะเคยเจอว่าเครื่องมือบางตัวใส่ newline ต่อท้ายค่าที่ pipe เข้ามา
          แล้วรหัสผ่านกลายเป็นคนละตัวโดยไม่มีอะไรฟ้อง — ไม่เปิดเผยค่าจริง
        */
        const shape = (v) =>
          typeof v === "string"
            ? { len: v.length, clean: v === v.trim() }
            : { len: 0, clean: true };

        const botVars = {
          BOT_EMAIL: shape(env.BOT_EMAIL),
          BOT_PASSWORD: shape(env.BOT_PASSWORD),
          FIREBASE_API_KEY: shape(env.FIREBASE_API_KEY),
          FIREBASE_PROJECT: env.FIREBASE_PROJECT || null,
        };
        const complete =
          botVars.BOT_EMAIL.len > 0 &&
          botVars.BOT_PASSWORD.len > 0 &&
          botVars.FIREBASE_API_KEY.len > 0 &&
          !!botVars.FIREBASE_PROJECT;

        let botLogin = "ไม่ได้ตั้งค่า";
        let botUid = null;
        if (complete) {
          try {
            await botLogin_(env);
            botLogin = "ผ่าน";
            botUid = lastBotUid;
          } catch (e) {
            botLogin = `ไม่ผ่าน: ${e && e.message ? e.message : "unknown"}`;
          }
        }

        return reply(
          {
            ok: true,
            provider: String(env.PROVIDER || "(ไม่ได้ตั้ง)"),
            hasApiKey: !!env.API_KEY,
            allowedOrigin: env.ALLOWED_ORIGIN || "*",
            autoApprove: { ...botVars, พร้อมใช้งาน: complete, botLogin, botUid },
          },
          cors,
        );
      }

      /*
        ค้นหาเพลงบน YouTube — เปิดด้วย GET ?search=<คำค้น>

        ทำไมต้องผ่าน Worker: การค้นหาต้องใช้ YouTube Data API ซึ่งต้องมีคีย์
        และเว็บเป็นไฟล์ static ล้วน ถ้าใส่คีย์ในหน้าเว็บใครก็หยิบไปใช้จนโควตาหมด
        ตรงนี้คีย์อยู่ฝั่งเซิร์ฟเวอร์ และมี ALLOWED_ORIGIN คุมว่าใครเรียกได้อยู่แล้ว

        (ลองทางที่ไม่ต้องใช้คีย์มาแล้วสองทาง — listType:'search' ของตัวเล่นฝัง
        ถูกปิดไปแล้ว ส่วน endpoint คำแนะนำของ Google ก็โดน CORS บล็อก)
      */
      const search = new URL(request.url).searchParams.get("search");
      if (search !== null) {
        const ip = request.headers.get("CF-Connecting-IP") || "unknown";
        if (!allow(ip, Number(env.MAX_PER_MIN || 0))) return fail("rate-limited", cors);

        const q = search.trim().slice(0, 100);
        if (!q) return fail("empty-query", cors);
        if (!env.YT_API_KEY) return fail("no-youtube-key", cors);

        const api = new URL("https://www.googleapis.com/youtube/v3/search");
        api.searchParams.set("part", "snippet");
        api.searchParams.set("type", "video");
        api.searchParams.set("maxResults", "12");
        // เอาเฉพาะคลิปที่ฝังเล่นในเว็บอื่นได้ ไม่งั้นกดแล้วไปค้างที่ตัวเล่น
        api.searchParams.set("videoEmbeddable", "true");
        api.searchParams.set("q", q);
        api.searchParams.set("key", env.YT_API_KEY);

        const res = await fetch(api.toString());
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return fail("youtube-error", cors, {
            status: res.status,
            message: data?.error?.message ?? null,
          });
        }

        return reply(
          {
            ok: true,
            items: (data?.items ?? [])
              .filter((it) => it?.id?.videoId)
              .map((it) => ({
                videoId: it.id.videoId,
                title: it.snippet?.title ?? "",
                author: it.snippet?.channelTitle ?? "",
                thumb: it.snippet?.thumbnails?.medium?.url ?? null,
              })),
          },
          cors,
        );
      }

      if (request.method !== "POST") {
        return fail("method-not-allowed", cors);
      }

      // ---- rate limit ----
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const maxPerMin = Number(env.MAX_PER_MIN || 0);
      if (!allow(ip, maxPerMin)) return fail("rate-limited", cors);

      // ---- อ่าน body ----
      let body;
      try {
        body = await request.json();
      } catch {
        return fail("bad-json", cors);
      }
      if (!body || typeof body !== "object") return fail("bad-json", cors);

      const payload = typeof body.payload === "string" ? body.payload.trim() : "";
      if (!payload) return fail("no-payload", cors);

      // ---- เลือก adapter ----
      const providerKey = String(env.PROVIDER || "").trim().toLowerCase();
      const adapter = ADAPTERS[providerKey];
      if (!adapter) return fail("unknown-provider", cors);
      if (!env.API_KEY) {
        // ลืม `wrangler secret put API_KEY`
        return fail("not-configured", cors);
      }

      // ---- ยิงหาผู้ให้บริการ ----
      let upstream;
      try {
        const { url, init } = adapter.request(payload, env);
        upstream = await fetch(url, {
          ...init,
          headers: { Accept: "application/json", ...init.headers },
          // กันค้าง ถ้าปลายทางช้าเกินไปให้ยอมแพ้แล้วให้คนตรวจด้วยตาแทน
          signal: AbortSignal.timeout(15000),
        });
      } catch (err) {
        // รวมทั้ง missing-branch-id ที่ adapter โยนออกมา และ network/timeout
        const reason =
          err && err.message === "missing-branch-id"
            ? "missing-branch-id"
            : "network-error";
        return fail(reason, cors);
      }

      // ---- อ่านผล ----
      const text = await upstream.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (!upstream.ok) {
        // ผู้ให้บริการมักใส่ข้อความบอกเหตุมาด้วย ส่งต่อไปให้ผู้จัดเห็นจะได้แก้ถูก
        const message =
          firstOf(json ?? {}, MESSAGE_PATHS, isNonEmptyString) ?? null;
        // 404 ของหลายเจ้าแปลว่า "หาสลิปนี้ไม่เจอ" ไม่ใช่ระบบพัง
        const reason =
          upstream.status === 404 ? "slip-not-found" : `provider-${upstream.status}`;
        return fail(reason, cors, { message });
      }

      if (!json) return fail("provider-bad-response", cors);

      // บางเจ้าคืน 200 แต่ในตัว body บอกว่าไม่สำเร็จ
      const flagged = firstOf(
        json,
        ["success", "status", "data.success"],
        (v) => v !== undefined && v !== null,
      );
      const bodySaysFail =
        flagged === false ||
        (typeof flagged === "number" && flagged >= 400) ||
        (typeof flagged === "string" && /fail|error/i.test(flagged));
      if (bodySaysFail) {
        const message =
          firstOf(json, MESSAGE_PATHS, isNonEmptyString) ?? null;
        return fail("provider-rejected", cors, { message });
      }

      // Thunder ตอบ isDuplicate มาให้ตอนเปิด checkDuplicate ไว้ ถ้าเจอก็ตัดจบเลย
      if (at(json, "data.isDuplicate") === true) {
        return fail("duplicate-slip", cors, { raw: json });
      }

      const info = normalize(json);

      // อ่านยอดไม่ได้เลย = ตรวจไม่ได้ ให้คนดูเอง ดีกว่าเดาว่าผ่าน
      if (info.amount === null) {
        return fail("no-amount", cors, { raw: json });
      }

      const base = {
        amount: info.amount,
        at: info.at,
        bank: info.bank,
        receiver: info.receiver,
        raw: json,
      };

      // ---- ตรวจยอด ----
      const expectAmount = toAmount(body.expectAmount);
      if (expectAmount !== null) {
        if (Math.abs(info.amount - expectAmount) > AMOUNT_TOLERANCE) {
          return reply({ ok: false, reason: "amount-mismatch", ...base }, cors);
        }
      }

      /* ---- ตรวจบัญชีปลายทาง ----
         ค่านี้มาจากเบราว์เซอร์ จึงเป็นได้แค่ "ตัวกรองชั้นแรก" ไว้บอกคนโอนเร็วๆ
         ว่าโอนผิดบัญชี — เชื่อเป็นหลักฐานไม่ได้ เพราะคนยิงแก้ค่าเองได้
         ตัวที่นับจริงคือการเทียบกับเลขพร้อมเพย์ของช่องใน approveDonation */
      const expectAccount =
        typeof body.expectAccount === "string" ? body.expectAccount.trim() : "";
      if (expectAccount) {
        const match = accountMatches(expectAccount, info.receiverAccounts);
        // match === null คือข้อมูลไม่พอเทียบ ปล่อยผ่านแต่ติดธงไว้ให้ผู้จัดรู้
        if (match === false) {
          return reply({ ok: false, reason: "account-mismatch", ...base }, cors);
        }
        if (match === null) {
          return reply(
            { ok: true, reason: "account-unchecked", ...base, ...(await tryApprove()) },
            cors,
          );
        }
      }

      return reply({ ok: true, ...base, ...(await tryApprove()) }, cors);

      /**
       * ตรวจผ่านแล้วก็อนุมัติให้เลย ไม่ต้องรอผู้จัดเปิดหน้าเว็บ
       * ถ้าไม่ได้ตั้งบัญชีบอทไว้ หรืออนุมัติไม่สำเร็จ ก็แค่ไม่อนุมัติ
       * ผลการตรวจยังส่งกลับให้หน้าเว็บครบเหมือนเดิม ผู้จัดกดเองได้อยู่
       */
      async function tryApprove() {
        try {
          const outcome = await approveDonation(
            env,
            typeof body.channelId === "string" ? body.channelId : "",
            typeof body.donationId === "string" ? body.donationId : "",
            info,
          );
          return { approved: outcome === "approved", approveNote: outcome };
        } catch (e) {
          return {
            approved: false,
            approveNote: e && e.message ? String(e.message) : "approve-error",
          };
        }
      }
    } catch (err) {
      // ตาข่ายชั้นสุดท้าย — อะไรหลุดมาถึงตรงนี้ก็ยังตอบ 200 เพื่อไม่ให้เว็บพัง
      return fail("worker-error", cors, {
        message: err && err.message ? String(err.message) : null,
      });
    }
  },
};

// Cloudflare Workers เรียกใช้ผ่าน default export ตัวนี้
export default handler;
