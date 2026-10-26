/**
 * แกนของสะพานแชท TikTok Live → คิวขอเพลง
 * ------------------------------------------------------------------
 * ใช้ร่วมกันสองทาง
 *   tiktok-song-bridge.mjs  แบบพิมพ์คำสั่ง อ่านค่าจาก .env (เจ้าของระบบ/คนที่ถนัด)
 *   app.mjs                 โปรแกรมที่แจกสตรีมเมอร์ (.exe มีหน้าตั้งค่าในเบราว์เซอร์)
 *
 * ไฟล์นี้ไม่พิมพ์อะไรเองและไม่สั่งปิดโปรแกรม — ทุกอย่างที่เกิดขึ้นส่งออกทาง onEvent
 * แล้วให้ตัวเรียกเลือกเองว่าจะแสดงยังไง (ลงจอดำพร้อมสี หรือขึ้นหน้าสถานะ)
 *
 * event = { at, kind, text, detail?, ...ข้อมูลประกอบ }
 *   kind  ask      มีคนพิมพ์คำสั่ง กำลังส่งต่อ
 *         ok       เข้าคิวแล้ว
 *         skip     คนดูขอไม่ผ่าน (คิวเต็ม ซ้ำ ค้นไม่เจอ ...) — ไม่ใช่ความผิดของการตั้งค่า
 *         wait     ขอถี่เกินไป ตัดทิ้งตั้งแต่ต้นทาง
 *         setup    ตั้งค่าผิด ต้องมีคนไปแก้ (รหัสผิด ช่องปิดรับ บอทเขียนไม่ได้ ...)
 *         error    อย่างอื่นที่ล้ม (เน็ต Worker ล่ม)
 *         status   สถานะการต่อไลฟ์เปลี่ยน — มี state: connecting | waiting | live | retry
 *         warn / info
 * ------------------------------------------------------------------ */

/*
  คำสั่งเดียว "!เพลง" (ต.ค. 2569 เจ้าของสั่ง) — เดิมรับ !ขอเพลง !song !sr ด้วย
  หลายคำสั่งทำให้คนดูสับสนว่าต้องพิมพ์แบบไหน และคำอย่าง !sr ชนกับบอทตัวอื่นในห้องแชท
  ระวัง: เทียบแบบขึ้นต้นด้วย "!เพลง" — "!ขอเพลง" ไม่ขึ้นต้นด้วย "!เพลง" จึงไม่ถูกรับแล้ว
*/
export const DEFAULT_COMMANDS = ["!เพลง"];

/** คำอธิบายเหตุผลที่ Worker ตอบกลับมา — แปลเป็นภาษาคนเพื่อแก้ได้ถูกจุด */
export const WHY = {
  "ingest-disabled": "Worker ยังไม่ได้ตั้ง INGEST_TOKEN (wrangler secret put INGEST_TOKEN)",
  "bad-token": "กุญแจไม่ถูกต้อง — รหัสเชื่อมต่อ (หรือ INGEST_TOKEN ใน .env) ไม่ตรงกับที่ Worker รู้จัก",
  "key-revoked": "รหัสเชื่อมต่อนี้ถูกยกเลิกแล้ว — สร้างรหัสใหม่ในสตูดิโอแล้ววางใหม่",
  "no-channel": "ยังไม่ได้บอกว่าเป็นช่องไหน",
  "channel-not-found": "หาช่องไม่เจอ — ไอดีช่องหรือ handle ต้องมีอยู่จริง",
  "db-quota":
    "ฐานข้อมูลใช้โควตาอ่านของวันนี้หมดแล้ว (แพ็กเกจฟรีของ Firebase) — กลับมาเองราวบ่ายสอง–บ่ายสามโมงตามเวลาไทย (เที่ยงคืนเวลาแปซิฟิก) หรืออัปเกรดเป็น Blaze",
  "songs-closed": "ช่องนี้ปิดรับคำขอเพลงอยู่ — เปิดสวิตช์ที่หน้าตั้งค่าช่องก่อน",
  "no-bot": "Worker ยังไม่ได้ตั้งบัญชีบอท (BOT_EMAIL / BOT_PASSWORD / FIREBASE_API_KEY)",
  "bot-login-failed": "บอทล็อกอิน Firebase ไม่ผ่าน — เช็ครหัสผ่านและ FIREBASE_API_KEY",
  "no-youtube-key": "Worker ไม่มีคีย์ YouTube จึงค้นด้วยชื่อเพลงไม่ได้ (วางลิงก์ยังใช้ได้)",
  "youtube-quota": "โควตาค้นหาของวันนี้หมดแล้ว — วางลิงก์ YouTube แทนได้",
  "youtube-error": "YouTube ปฏิเสธคำขอค้นหา",
  "no-match": "ค้นไม่เจอเพลงที่ขอ",
  "video-not-found": "เปิดคลิปนี้ไม่ได้ (ถูกลบ เป็นส่วนตัว หรือลิงก์ผิด)",
  duplicate: "เพลงนี้อยู่ในคิวแล้ว",
  "too-many": "คนนี้ขอครบโควตาต่อคนแล้ว",
  "queue-full": "คิวเต็มแล้ว",
  cooldown: "คนนี้ขอถี่เกินไป",
  "rate-limited": "คำขอเข้ามาถี่เกินเพดานของช่อง",
  "empty-query": "พิมพ์คำสั่งมาเปล่าๆ ไม่มีชื่อเพลง",
  "bad-platform": "platform ที่ส่งไปไม่อยู่ในรายการที่ Worker รับ",
};

/** เหตุผลที่แปลว่า "ตั้งค่าผิด" ไม่ใช่ "คนดูขอไม่ผ่าน" — ต้องเห็นเด่นๆ */
const SETUP_PROBLEMS = new Set([
  "ingest-disabled",
  "bad-token",
  "key-revoked",
  "no-channel",
  "channel-not-found",
  "db-quota",
  "songs-closed",
  "no-bot",
  "bot-login-failed",
  "no-youtube-key",
]);

export function explain(reason, message) {
  if (String(reason).startsWith("write-failed")) {
    return `เขียนคิวไม่ผ่าน (${reason}) — uid ของบอทอยู่ใน admins แล้วหรือยัง และ publish firestore.rules ตัวใหม่หรือยัง`;
  }
  const base = WHY[reason] ?? reason;
  return message ? `${base} — ${message}` : base;
}

const isSetupProblem = (reason) =>
  SETUP_PROBLEMS.has(reason) || String(reason).startsWith("write-failed");

/** คืนคำขอหลังคำสั่ง หรือ null ถ้าไม่ใช่คำสั่งขอเพลง */
export function parseCommand(comment, commands = DEFAULT_COMMANDS) {
  const text = String(comment ?? "").trim();
  const lower = text.toLowerCase();
  for (const cmd of commands) {
    if (lower.startsWith(cmd.toLowerCase())) return text.slice(cmd.length).trim();
  }
  return null;
}

/**
 * ดึงชื่อผู้ใช้ออกจาก payload ของแชท
 *
 * ชื่อฟิลด์ไม่เหมือนกันในแต่ละเวอร์ชันของไลบรารี และไม่มีทางรู้ล่วงหน้าว่า
 * ผู้ใช้จะ npm install ได้ตัวไหน
 *   v1  วางไว้ระดับบนสุดเป็น uniqueId / nickname
 *   v2  ส่ง proto ดิบมาใต้ user ซึ่งเก็บ @ ไว้ในชื่อ displayId (ไม่มี uniqueId)
 * ไล่ทุกชื่อที่เคยใช้ แล้วค่อยตกไปที่ไอดีตัวเลข ดีกว่าปล่อยคำขอตกหายเงียบๆ
 */
export function readUser(payload) {
  const u = payload?.user ?? {};
  const handle = u.uniqueId || u.displayId || payload?.uniqueId || "";
  const id = handle || String(u.id ?? payload?.userId ?? "");
  const name = u.nickname || payload?.nickname || id;
  return { id, name: String(name) };
}

/**
 * ข้อความแชท — ชื่อฟิลด์เปลี่ยนตามเวอร์ชันของไลบรารีเหมือนชื่อผู้ใช้
 *   v1  comment
 *   v2  content (proto ดิบ) — v2.4.3 ไม่มี comment แล้ว อ่านแค่ comment
 *       จะได้ข้อความว่างทุกบรรทัด แล้วคำขอทุกอันถูกทิ้งเงียบๆ เหมือนไม่มีใครพิมพ์
 * null = ไม่มีฟิลด์ไหนเลย (ไลบรารีเปลี่ยนรูปแบบอีก)
 */
export function readComment(payload) {
  const text = payload?.comment ?? payload?.content;
  return typeof text === "string" ? text : null;
}

/** ข้อความบอกเหตุจากไลบรารี มักยาวและมี stack ปน เอาแค่บรรทัดแรก
 *  event "error" ของไลบรารีส่งมาเป็น { info, exception } — ไม่แกะก่อนจะได้ "[object Object]" */
export const briefly = (e) => {
  const inner = e?.exception ?? e;
  const text = inner?.message ?? (typeof inner === "object" && inner ? e?.info : inner);
  return String(text ?? "unknown").split("\n")[0].slice(0, 160);
};

const errorName = (e) => e?.constructor?.name ?? "";

/** สตรีมเมอร์ยังไม่ได้ไลฟ์ — ไม่ใช่ความผิดพลาด
 *  v2.4.3 พูดว่า "The requested user isn't online :(" ซึ่งคำว่า offline / not live ไม่ครอบ
 *  เคยหลุดไปนับเป็น "ต่อไม่ติด" แล้วพิมพ์ลง log ทุกนาทีทั้งวัน */
export const isOffline = (e) =>
  errorName(e) === "UserOfflineError" ||
  /offline|isn'?t online|not.*live|LIVE has ended|user_not_found/i.test(briefly(e));

/** บริการลายเซ็นปฏิเสธเพราะใช้เกินโควตา (HTTP 429)
 *  v2.4.3 สร้าง SignatureRateLimitError ผิด (ส่ง body แทน response) เลยพังเป็น
 *  "Cannot read properties of undefined (reading 'retry-after')" แทน — ต้องจับทั้งสองแบบ */
export const isRateLimited = (e) =>
  errorName(e) === "SignatureRateLimitError" ||
  /retry-after|too many connections|rate.?limit|\b429\b/i.test(briefly(e));

/* ---------------- โควตาบริการลายเซ็น (Euler Stream) ----------------

   ทุกครั้งที่ต่อเข้าไลฟ์ ไลบรารีต้องขอลายเซ็นจาก Euler Stream หนึ่งครั้ง (เช็คว่าไลฟ์อยู่ไหม
   ไม่กิน เพราะถาม TikTok ตรง) ไม่ใส่คีย์ = โควตาฟรีต่อ IP นาทีละ 5 ชั่วโมงละ 30 วันละ 100
   สะพานทุกตัวที่ออกเน็ตเดียวกันใช้ก้อนเดียวกัน

   เคยหมดจริง (affarain 20 ต.ค. 2569): ไลฟ์จบแล้ว TikTok ยังบอกว่าห้องเดิมไลฟ์อยู่อีกหลายนาที
   สะพานต่อติด → ได้ streamEnd ทันที → 5 วิต่อใหม่ วนนาทีละ 5 รอบพอดีเพดาน แล้วโดน 429 ร้อยกว่าครั้ง
   ★ เจ้าของสั่ง: โควตาเต็มต้องหยุด ห้ามยิงต่อ ★ ด่านจึงมีสามชั้น
     1. ถามยอดคงเหลือก่อนต่อทุกครั้ง (ถามฟรี ไม่นับโควตา) หมดถังไหนก็รอถึงเวลารีเซ็ตของถังนั้น
     2. นับเองในโปรแกรมอีกชั้น เผื่อถามไม่ได้ หรือตัวเลขที่ได้ไม่ขยับ (เคยเห็น 100/100 ทั้งที่เพิ่งต่อ)
     3. โดน 429 = พักยาวทันที ไม่ไล่ถอยทีละ 5 วิแบบความผิดพลาดทั่วไป */

const SIGN_BUCKETS = [
  ["minute", 60_000],
  ["hour", 3_600_000],
  ["day", 86_400_000],
];
const FREE_LIMITS = { minute: 5, hour: 30, day: 100 };
/** Euler บอกว่าหมดแต่ไม่บอกเวลารีเซ็ต — รอเท่านี้แล้วถามใหม่ (ถามฟรี จึงไม่ต้องรอเต็มถัง) */
const RECHECK_MS = { minute: 60_000, hour: 10 * 60_000, day: 30 * 60_000 };
/** ลองซ้ำหลังต่อพลาด เก็บโควตาส่วนนี้ไว้ให้ตอนไลฟ์เริ่มจริง ไม่เผาหมดกับปัญหาที่ลองกี่ทีก็ไม่หาย */
const RETRY_RESERVE = { hour: 3, day: 10 };
/** โดน 429 ครั้งที่ 1, 2, 3, ... ติดกัน — พักอย่างน้อยเท่านี้ (นาที) */
const LIMITED_BACKOFF_MS = [2, 5, 15, 30, 60].map((m) => m * 60_000);

const BUCKET_TEXT = {
  minute: (max) => `ต่อถี่เกินเพดานบริการเชื่อมต่อแชท (${max} ครั้ง/นาที)`,
  hour: (max) => `โควตาบริการเชื่อมต่อแชทของชั่วโมงนี้เต็ม (${max} ครั้ง/ชั่วโมง)`,
  day: (max) => `โควตาบริการเชื่อมต่อแชทของวันนี้เต็ม (${max} ครั้ง/วัน)`,
};

/** ยอดคงเหลือจาก Euler — { minute, hour, day: { max, remaining, reset_at } } หรือ null ถ้าถามไม่ได้ */
export async function fetchSignLimits(key) {
  const base = (process.env.SIGN_API_URL || "https://api.eulerstream.com").replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/webcast/rate_limits`, {
      headers: key ? { "x-api-key": key } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return SIGN_BUCKETS.every(([b]) => typeof data?.[b]?.remaining === "number") ? data : null;
  } catch {
    return null;
  }
}

/** reset_at ไม่รู้ว่ามาเป็นแบบไหน รับไว้ทุกแบบ: วินาทีที่เหลือ, epoch วินาที, epoch มิลลิวินาที, ISO */
export function resetTime(value, now = Date.now()) {
  if (value == null || value === "") return null;
  const n = /^\d+(\.\d+)?$/.test(String(value)) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(n)) return null;
  const at = n < 1e9 ? now + n * 1000 : n < 1e12 ? n * 1000 : n;
  return at > now ? at : null;
}

/**
 * ต้องพักไหม — คืน { bucket, until, max } หรือ null ถ้าต่อได้
 *   limits   คำตอบจาก fetchSignLimits (null = ถามไม่ได้ ใช้ตัวนับเองอย่างเดียว)
 *   used     เวลาที่สะพานนี้ขอลายเซ็นไปเอง
 *   reserve  เหลือไม่เกินเท่านี้ก็ถือว่าหมด แยกรายถัง
 */
export function signHold({ limits, used = [], reserve = {}, now = Date.now() }) {
  for (const [bucket, span] of SIGN_BUCKETS) {
    const keep = reserve[bucket] ?? 0;
    const srv = limits?.[bucket];
    const max = srv?.max ?? FREE_LIMITS[bucket];
    let until = 0;

    if (srv && srv.remaining <= keep) until = resetTime(srv.reset_at, now) ?? now + RECHECK_MS[bucket];

    // ตัวนับเอง: ต้องรอให้ครั้งเก่าสุดหลุดหน้าต่างไปกี่ครั้งถึงจะเหลือมากกว่า keep
    const mine = used.filter((t) => t > now - span).sort((a, b) => a - b);
    const over = mine.length - (max - keep) + 1;
    if (over > 0) until = Math.max(until, (mine[Math.min(over, mine.length) - 1] ?? now) + span);

    if (until) return { bucket, until, max };
  }
  return null;
}

/** เวลาแบบ 14:05 น. — ถ้าข้ามวันใส่วันที่ด้วย */
const clock = (ms) => {
  const d = new Date(ms);
  const hm = d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false });
  return d.toDateString() === new Date().toDateString()
    ? `${hm} น.`
    : `${d.toLocaleDateString("th-TH", { day: "numeric", month: "short" })} ${hm} น.`;
};

/**
 * @param cfg {
 *   user        ชื่อ TikTok ที่ไลฟ์ (ไม่มี @)
 *   workerUrl   ลิงก์ Worker
 *   token       INGEST_TOKEN หรือรหัสต่อช่อง "k1.<รุ่น>.<ลายเซ็น>"
 *   channel     ไอดีช่อง (รหัสต่อช่องต้องเป็นไอดี) หรือ handle (ใช้ได้กับ INGEST_TOKEN)
 *   commands    คำสั่งนำหน้า (ตัวพิมพ์เล็ก)
 *   cooldown    วินาทีระหว่างคำขอของคนเดียวกัน — 0 = ไม่หน่วง
 *   signKey     คีย์ Euler Stream (ไม่ใส่ได้)
 * }
 */
export function createBridge(cfg, onEvent = () => {}) {
  const emit = (kind, text, extra = {}) => onEvent({ at: new Date(), kind, text, ...extra });
  const commands = cfg.commands?.length ? cfg.commands : DEFAULT_COMMANDS;

  /* ---------------- ส่งต่อให้ Worker ---------------- */

  async function submit(user, query) {
    const url = new URL(cfg.workerUrl);
    url.searchParams.set("ingest", "1");

    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.token}`,
        },
        body: JSON.stringify({ channelId: cfg.channel, platform: "tiktok", user, query }),
        signal: AbortSignal.timeout(20000),
      });
    } catch (e) {
      emit("error", `เรียก Worker ไม่ได้ — ${e?.message ?? "network error"}`, { user: user.id, query });
      return null;
    }

    const data = await res.json().catch(() => null);
    if (!data) {
      emit("error", `Worker ตอบกลับมาไม่ใช่ JSON (HTTP ${res.status})`, { user: user.id, query });
      return null;
    }

    if (data.ok) {
      emit("ok", `คิวที่ ${data.position} · ${data.title}`, {
        detail: `ขอโดย @${user.id}`,
        user: user.id,
        query,
        title: data.title,
        position: data.position,
      });
    } else if (isSetupProblem(data.reason)) {
      emit("setup", explain(data.reason, data.message), { reason: data.reason, user: user.id, query });
    } else {
      emit("skip", explain(data.reason, data.message), {
        detail: `@${user.id}: ${query}`,
        reason: data.reason,
        user: user.id,
        query,
      });
    }
    return data;
  }

  /* ---------------- อ่านแชท ---------------- */

  /**
   * หน่วงรายคน — ตัดคำขอซ้ำๆ ทิ้งตั้งแต่ต้นทาง
   *
   * Worker มีเพดานของตัวเองอยู่แล้ว แต่การกันที่นี่ประหยัดกว่า เพราะคำขอที่
   * โดนตัดตรงนี้ไม่ได้เดินทางไปถึงโควตาค้นหาของ YouTube ซึ่งมีวันละ ~100 ครั้ง
   */
  const lastAsk = new Map();
  const coolingDown = (id) => {
    if (!cfg.cooldown) return 0;
    const prev = lastAsk.get(id) ?? 0;
    const left = Math.ceil((prev + cfg.cooldown * 1000 - Date.now()) / 1000);
    return left > 0 ? left : 0;
  };

  // เตือนครั้งเดียวพอ ไม่งั้นแชทรัวๆ จะท่วมหน้าจอด้วยข้อความเดียวกัน
  let warnedUnknownUser = false;
  let warnedUnknownText = false;

  function onChat(payload) {
    const comment = readComment(payload);
    if (comment === null) {
      if (!warnedUnknownText) {
        warnedUnknownText = true;
        emit("warn", "อ่านข้อความแชทไม่ออก", {
          detail: `ไลบรารีอาจเปลี่ยนรูปแบบ (ฟิลด์ที่มี: ${Object.keys(payload ?? {}).slice(0, 10).join(", ")})`,
        });
      }
      return;
    }

    const { id, name } = readUser(payload);
    if (!id) {
      if (!warnedUnknownUser) {
        warnedUnknownUser = true;
        emit("warn", "อ่านชื่อคนพิมพ์ไม่ออก", {
          detail: `ไลบรารีอาจเปลี่ยนรูปแบบ (ฟิลด์ที่มี: ${Object.keys(payload?.user ?? payload ?? {}).slice(0, 8).join(", ")})`,
        });
      }
      return;
    }

    const query = parseCommand(comment, commands);
    if (query === null) return; // แชทคุยเล่นทั่วไป ไม่ต้องสนใจ

    if (!query) {
      emit("skip", `@${id} พิมพ์คำสั่งเปล่าๆ`, { detail: `${commands[0]} ชื่อเพลง`, user: id });
      return;
    }

    const wait = coolingDown(id);
    if (wait) {
      emit("wait", `@${id} ขอถี่ไป รออีก ${wait} วิ`, { user: id });
      return;
    }
    lastAsk.set(id, Date.now());

    emit("ask", `@${id}: ${query}`, { user: id, query });
    void submit({ id, name: String(name).slice(0, 40) }, query);
  }

  /* ---------------- ต่อกับ TikTok ---------------- */

  async function makeConnection() {
    let mod;
    try {
      mod = await import("tiktok-live-connector");
    } catch {
      throw new Error('ยังไม่ได้ติดตั้งไลบรารี — รัน "npm install" ในโฟลเดอร์ bridge/ ก่อน');
    }

    /* ไลบรารีตัวนี้เปลี่ยนชื่อคลาสตอนขึ้นเวอร์ชัน 2 (WebcastPushConnection →
       TikTokLiveConnection) รับทั้งสองชื่อไว้ จะได้ไม่พังเวลาผู้ใช้ npm install
       แล้วได้คนละเวอร์ชันกับที่เขียนไว้ */
    const src = mod.default ?? mod;
    const Ctor =
      mod.TikTokLiveConnection ??
      mod.WebcastPushConnection ??
      src.TikTokLiveConnection ??
      src.WebcastPushConnection;
    if (!Ctor) throw new Error("ไม่รู้จักเวอร์ชันของ tiktok-live-connector ที่ติดตั้งไว้");

    /* คีย์ของบริการลายเซ็น (ไม่ใส่ก็ใช้โควตาสาธารณะซึ่งจำกัดกว่า)
       v2 รับผ่าน SignConfig ที่เป็นตัวแปรระดับโมดูล ส่วน v1 รับผ่าน options
       ตอนสร้าง — ส่งผิดช่องแล้วมันเงียบ ไม่ฟ้อง จึงต้องดูก่อนว่ามีตัวไหน */
    const SignConfig = mod.SignConfig ?? src.SignConfig;
    if (cfg.signKey && SignConfig) SignConfig.apiKey = cfg.signKey;
    const options = cfg.signKey && !SignConfig ? { signApiKey: cfg.signKey } : {};

    /* ไม่เอาแชทย้อนหลัง — ตอนต่อเข้าห้อง TikTok ส่งแชทล่าสุดที่พิมพ์ไว้ก่อนแล้วมาให้ด้วย
       ถ้ารับไว้ ทุกครั้งที่สะพานต่อใหม่ (เปิดใหม่ / เน็ตหลุดแล้วต่อเอง) คำขอเก่าในแชท
       จะถูกส่งซ้ำ กินโควตาค้นหาฟรีๆ ทั้งที่เพลงพวกนั้นอาจเล่นไปแล้ว — ชื่อตัวเลือกเหมือนกันทั้ง v1/v2 */
    options.processInitialData = false;

    return new Ctor(cfg.user, options);
  }

  let stopped = false;
  let conn = null;
  let reconnecting = false;

  /* รอแบบปลุกได้ — พักรอโควตาอาจนานเป็นชั่วโมง กดหยุดแล้วต้องจบทันที ไม่ค้างรอจนครบ */
  const naps = new Set();
  const nap = (ms) =>
    new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        naps.delete(done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(0, ms));
      naps.add(done);
    });

  /** เวลาที่สะพานนี้ขอลายเซ็นไป — ต่อสำเร็จ หรือพลาดด้วยเหตุอื่นที่ไม่ใช่ "ยังไม่ไลฟ์" */
  const signUsed = [];
  let limitedStreak = 0;
  let lastHold = "";

  async function holdOff(until, why) {
    // พักซ้ำด้วยเหตุเดิม (ถามใหม่แล้วยังหมด) ไม่ต้องพิมพ์ซ้ำทุกรอบ
    const loud = why !== lastHold;
    lastHold = why;
    emit("status", `พักการต่อ — ${why}`, { state: "limited", detail: `ลองใหม่ ${clock(until)}`, until, loud });
    await nap(until - Date.now());
  }

  /* ต่อไม่ติดแล้วลองใหม่เรื่อยๆ ด้วยการถอยหลังแบบทวีคูณ

     เคสที่เจอบ่อยที่สุดคือ "ยังไม่ได้เริ่มไลฟ์" ซึ่งไม่ใช่ความผิดพลาด —
     สตรีมเมอร์เปิดสะพานทิ้งไว้ก่อนแล้วค่อยกดไลฟ์เป็นเรื่องปกติ
     จึงต้องรอต่อไปเงียบๆ ไม่ใช่ตายทิ้ง · คืน null ถ้าถูกสั่งหยุดระหว่างรอ */
  async function connectLoop() {
    const c = await makeConnection();
    c.on("chat", onChat);
    // ไลบรารีโยน error ระหว่างทางได้ ถ้าไม่ดักไว้ process จะตายทั้งตัว
    c.on("error", (e) => {
      // พลาดตอนต่อ ไลบรารีแจ้งซ้ำกับที่ connect() โยนออกมา — ลูปข้างล่างรายงานเองแล้ว
      if (e?.info === "Error while connecting") return;
      emit("info", `(ไลบรารีแจ้ง: ${briefly(e)})`);
    });

    let attempt = 0;
    let lastOffline = false;
    while (!stopped) {
      // ลองซ้ำหลังพลาดด้วยเหตุอื่น เก็บโควตาไว้ส่วนหนึ่ง · ครั้งแรกหรือรอไลฟ์อยู่ใช้ได้จนหมด
      const hold = signHold({
        limits: await fetchSignLimits(cfg.signKey),
        used: signUsed,
        reserve: attempt > 0 && !lastOffline ? RETRY_RESERVE : {},
      });
      if (stopped) break;
      if (hold) {
        await holdOff(hold.until, BUCKET_TEXT[hold.bucket](hold.max));
        continue;
      }
      lastHold = "";

      emit("status", `กำลังต่อกับไลฟ์ของ @${cfg.user}`, { state: "connecting", loud: attempt === 0 });
      try {
        const state = await c.connect();
        signUsed.push(Date.now());
        if (stopped) {
          c.disconnect?.();
          return null;
        }
        limitedStreak = 0;
        liveSince = Date.now();
        emit("status", "ต่อกับไลฟ์แล้ว", {
          state: "live",
          detail: `ห้อง ${state?.roomId ?? "?"}`,
          loud: true,
        });
        return c;
      } catch (e) {
        if (stopped) break;

        if (isRateLimited(e)) {
          signUsed.push(Date.now());
          limitedStreak += 1;
          const floor = Date.now() + LIMITED_BACKOFF_MS[Math.min(limitedStreak, LIMITED_BACKOFF_MS.length) - 1];
          const known = signHold({ limits: await fetchSignLimits(cfg.signKey), used: signUsed });
          await holdOff(
            Math.max(floor, known?.until ?? 0),
            known ? BUCKET_TEXT[known.bucket](known.max) : "บริการเชื่อมต่อแชทปฏิเสธ (ใช้เกินโควตา)",
          );
          continue;
        }

        attempt += 1;
        const offline = isOffline(e);
        lastOffline = offline;
        // ยังไม่ไลฟ์ = ถาม TikTok อย่างเดียว ไม่ได้ขอลายเซ็น จึงไม่นับ
        if (!offline) signUsed.push(Date.now());
        const wait = offline
          ? attempt <= 10
            ? 60
            : 120
          : Math.min(120, 5 * 2 ** Math.min(attempt - 1, 5));
        /* เปิดค้างข้ามวัน ช่วงไม่ไลฟ์จะลองทุกนาที — บอกทุกครั้งก็ท่วม log วันละพันบรรทัด
           บอกครั้งแรกแล้วเว้นทุกสิบครั้ง พอให้รู้ว่ายังรออยู่ ส่วนต่อไม่ติดด้วยเหตุอื่นบอกทุกครั้ง */
        emit("status", offline ? "ยังไม่ได้เริ่มไลฟ์" : `ต่อไม่ติด — ${briefly(e)}`, {
          state: offline ? "waiting" : "retry",
          detail: `ลองใหม่ใน ${wait} วิ`,
          loud: !offline || attempt === 1 || attempt % 10 === 0,
        });
        await nap(wait * 1000);
      }
    }
    return null;
  }

  /* หลุดกลางคันหรือไลฟ์จบแล้วต่อใหม่ — เน็ตสะดุดตอนไลฟ์เป็นเรื่องปกติ

     ทุกการเชื่อมต่อใหม่ต้องผูกตัวดักซ้ำ (watch) — รุ่นแรกผูกไว้แค่ตัวแรก
     ไลฟ์แรกจบก็ต่อใหม่ได้ แต่พอไลฟ์ที่สองจบไม่มีใครรู้ สะพานค้างเงียบไปตลอด
     และ streamEnd กับ disconnected มักมาคู่กัน — ต่อใหม่ครั้งเดียวพอ ไม่งั้นได้
     สองการเชื่อมต่อ แล้วทุกคำขอเข้าคิวสองรอบ

     ไลฟ์จบแล้ว TikTok ยังบอกว่าห้องเดิมไลฟ์อยู่อีกพักหนึ่ง ต่อเข้าไปก็ได้ streamEnd ทันที
     ถ้าต่อใหม่ใน 5 วิจะวนเผาโควตาลายเซ็นนาทีละ 5 ครั้ง (ดูหัวข้อโควตาข้างบน)
     จึงรอหลังไลฟ์จบอย่างน้อยหนึ่งนาที และถ้าต่อติดไม่ถึง 3 นาทีแล้วหลุดอีก ให้ถอยยาวขึ้นเรื่อยๆ */
  let liveSince = 0;
  let shortStreak = 0;
  const SHORT_LIVE_MS = 3 * 60_000;

  async function reconnect(from, label, ended) {
    if (stopped || reconnecting || from !== conn) return;
    reconnecting = true;
    shortStreak = Date.now() - liveSince < SHORT_LIVE_MS ? shortStreak + 1 : 0;
    const wait = ended
      ? Math.min(900, 60 * 2 ** shortStreak) // 60 → 120 → 240 → 480 → 900 วิ
      : shortStreak > 1
        ? Math.min(900, 30 * 2 ** (shortStreak - 1))
        : 5;
    emit("status", `${label} — จะลองต่อใหม่`, {
      state: ended ? "waiting" : "connecting",
      detail: `อีก ${wait} วิ`,
      loud: true,
    });
    // ตัวเก่าห้ามส่งแชทต่อ เผื่อไลบรารีต่อเองข้างในแล้วซ้อนกับตัวใหม่
    from.removeAllListeners?.("chat");
    try {
      from.disconnect();
    } catch {
      /* หลุดอยู่แล้ว */
    }
    await nap(wait * 1000);
    try {
      conn = await connectLoop();
      if (conn) watch(conn);
    } catch (e) {
      emit("error", briefly(e));
    } finally {
      reconnecting = false;
    }
  }

  function watch(c) {
    c.on("disconnected", () => void reconnect(c, "หลุดจากไลฟ์", false));
    c.on("streamEnd", () => void reconnect(c, "ไลฟ์จบแล้ว", true));
  }

  return {
    submit,
    /** ต่อไลฟ์แล้วฟังไปเรื่อยๆ — resolve เมื่อต่อสำเร็จครั้งแรก (หรือถูกสั่งหยุดก่อน) */
    async start() {
      conn = await connectLoop();
      if (conn) watch(conn);
    },
    stop() {
      stopped = true;
      for (const wake of [...naps]) wake();
      if (!conn) return;
      conn.removeAllListeners?.("chat");
      try {
        conn.disconnect();
      } catch {
        /* ปิดไม่ลงก็ไม่เป็นไร */
      }
      conn = null;
    },
  };
}
