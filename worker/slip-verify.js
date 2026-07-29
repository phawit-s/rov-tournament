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

const RECEIVER_ACCOUNT_PATHS = [
  "data.receiver.account.value",
  "data.receiver.account.bank.account",
  "data.receiver.account.proxy.account",
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

  // เลขบัญชีปลายทางอาจเป็นสตริงตรงๆ หรือเป็น object ที่ห่อไว้อีกชั้น
  const account = firstOf(json, RECEIVER_ACCOUNT_PATHS, isSomething);
  let receiverAccount = null;
  if (typeof account === "string" || typeof account === "number") {
    receiverAccount = String(account);
  } else if (account && typeof account === "object") {
    receiverAccount =
      firstOf(
        account,
        ["value", "account", "bank.account", "proxy.account", "proxy.value"],
        isNonEmptyString,
      ) ?? null;
  }

  return { amount, at: when, bank, receiver, receiverAccount };
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
 */
function accountMatches(expect, actual) {
  const a = digitsOnly(expect);
  const b = digitsOnly(actual);
  if (a.length < ACCOUNT_TAIL || b.length < ACCOUNT_TAIL) return null;
  return a.slice(-ACCOUNT_TAIL) === b.slice(-ACCOUNT_TAIL);
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

function corsHeaders(env) {
  return {
    // ค่าเริ่มต้นเปิดให้ทุกโดเมนเพื่อให้ลองใช้ได้ทันที
    // แต่ก่อนใช้จริง "ต้อง" ตั้ง ALLOWED_ORIGIN เป็นโดเมนเว็บของเรา
    // ไม่งั้นใครก็เอา Worker (และโควตาที่เราจ่าย) ไปใช้ฟรี
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    // บอก cache ว่าคำตอบขึ้นกับ Origin เผื่ออนาคตตั้งหลายโดเมน
    Vary: "Origin",
  };
}

/** ตอบกลับเป็น JSON status 200 เสมอ (ดูเหตุผลที่หัวไฟล์) */
function reply(body, env) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(env),
    },
  });
}

/** รูปแบบ "ไม่ผ่าน" มาตรฐาน ฟิลด์ครบเหมือนกรณีผ่าน ฝั่งเว็บจะได้ไม่ต้องเช็ค undefined */
function fail(reason, env, extra) {
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
    env,
  );
}

const handler = {
  async fetch(request, env) {
    // จับทุกอย่างไว้ชั้นนอกสุด ห้ามให้หลุดเป็น 500 เปล่าๆ
    try {
      if (request.method === "OPTIONS") {
        // preflight — ไม่มี body
        return new Response(null, { status: 204, headers: corsHeaders(env) });
      }

      if (request.method !== "POST") {
        return fail("method-not-allowed", env);
      }

      // ---- rate limit ----
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      const maxPerMin = Number(env.MAX_PER_MIN || 0);
      if (!allow(ip, maxPerMin)) return fail("rate-limited", env);

      // ---- อ่าน body ----
      let body;
      try {
        body = await request.json();
      } catch {
        return fail("bad-json", env);
      }
      if (!body || typeof body !== "object") return fail("bad-json", env);

      const payload = typeof body.payload === "string" ? body.payload.trim() : "";
      if (!payload) return fail("no-payload", env);

      // ---- เลือก adapter ----
      const providerKey = String(env.PROVIDER || "").trim().toLowerCase();
      const adapter = ADAPTERS[providerKey];
      if (!adapter) return fail("unknown-provider", env);
      if (!env.API_KEY) {
        // ลืม `wrangler secret put API_KEY`
        return fail("not-configured", env);
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
        return fail(reason, env);
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
        return fail(reason, env, { message });
      }

      if (!json) return fail("provider-bad-response", env);

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
        return fail("provider-rejected", env, { message });
      }

      // Thunder ตอบ isDuplicate มาให้ตอนเปิด checkDuplicate ไว้ ถ้าเจอก็ตัดจบเลย
      if (at(json, "data.isDuplicate") === true) {
        return fail("duplicate-slip", env, { raw: json });
      }

      const info = normalize(json);

      // อ่านยอดไม่ได้เลย = ตรวจไม่ได้ ให้คนดูเอง ดีกว่าเดาว่าผ่าน
      if (info.amount === null) {
        return fail("no-amount", env, { raw: json });
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
          return reply({ ok: false, reason: "amount-mismatch", ...base }, env);
        }
      }

      // ---- ตรวจบัญชีปลายทาง ----
      const expectAccount =
        typeof body.expectAccount === "string" ? body.expectAccount.trim() : "";
      if (expectAccount) {
        const match = accountMatches(expectAccount, info.receiverAccount);
        // match === null คือข้อมูลไม่พอเทียบ ปล่อยผ่านแต่ติดธงไว้ให้ผู้จัดรู้
        if (match === false) {
          return reply({ ok: false, reason: "account-mismatch", ...base }, env);
        }
        if (match === null) {
          return reply(
            { ok: true, reason: "account-unchecked", ...base },
            env,
          );
        }
      }

      return reply({ ok: true, ...base }, env);
    } catch (err) {
      // ตาข่ายชั้นสุดท้าย — อะไรหลุดมาถึงตรงนี้ก็ยังตอบ 200 เพื่อไม่ให้เว็บพัง
      return fail("worker-error", env, {
        message: err && err.message ? String(err.message) : null,
      });
    }
  },
};

// Cloudflare Workers เรียกใช้ผ่าน default export ตัวนี้
export default handler;
