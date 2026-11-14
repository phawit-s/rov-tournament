/**
 * ลัดคิวด้วยโดเนท EasyDonate (ส่วนต่อของ Worker เดียวกับที่ตรวจสลิป)
 * ------------------------------------------------------------------
 * คนดูโดเนทผ่าน EasyDonate ถึงยอดที่สตรีมเมอร์ตั้งไว้ แล้วพิมพ์ในข้อความโดเนทว่า
 *   "!เพลง ชื่อเพลง"  หรือวางลิงก์ YouTube ไว้ที่ไหนก็ได้ในข้อความ
 * EasyDonate ยิง webhook มาที่นี่ → เพลงเข้าคิวแบบลัดคิว (ฟิลด์ paid)
 * splitQueue ฝั่งเว็บจัดใบที่มี paid ไว้หน้าเพลงที่ขอฟรีทั้งหมด เรียงกันเองตามเวลาที่โดเนท
 *
 * ทำไมไม่ต้องจับคู่ตัวคน: เงินกับเพลงมาในโดเนทใบเดียวกัน ไม่ต้องรู้ว่าคนจ่ายคือใครในแชท
 *
 * ความปลอดภัย
 *   EasyDonate ไม่เซ็นลายเซ็นมากับ webhook (ดูเอกสาร ณ พ.ย. 2569) ลิงก์จึงเป็นกุญแจเอง:
 *   ลิงก์มีรหัสต่อช่อง d1.<รุ่น>.<HMAC> ที่สตูดิโอออกให้ (?pair=1 kind "donate")
 *   ใครได้ลิงก์ไปก็ยัดเพลงลัดคิวช่องนั้นได้ จึงต้องอยู่แค่ในแดชบอร์ด EasyDonate
 *   หลุดเมื่อไหร่กด "สร้างลิงก์ใหม่" ในสตูดิโอ — รุ่นขยับ ลิงก์เก่าใช้ไม่ได้ทันที
 *   (ทางที่แน่นกว่าคือเอา referenceNo ไปถาม API ของ EasyDonate ด้วยคีย์ของสตรีมเมอร์
 *    แต่เอกสาร API ยังไม่บอกรูปคำตอบ เลยยังไม่ทำ)
 *
 * สัญญาการเรียก
 *   POST /?easydonate=1&c=<ไอดีช่อง>&k=d1.<รุ่น>.<ลายเซ็น>
 *   JSON แบบ webhook ประเภท "ปกติ" ของ EasyDonate
 *     { referenceNo, channelName, donatorName, donateMessage, amount, time }
 *   หรือ { test: true } จากปุ่มทดสอบในสตูดิโอ (ไม่แตะคิว แค่ตรวจว่าต่อถึงกันและจดลงบันทึก)
 *   ตอบ 200 เสมอ { ok, reason?, ... } — EasyDonate ไม่ได้อ่านคำตอบ ไว้ให้คนไล่ปัญหาอ่าน
 *
 * ผลของทุกโดเนทที่เข้ามาถูกจดไว้ 10 รายการล่าสุดที่ channels/{id}/private/easydonate
 * (เจ้าของช่องอ่านได้คนเดียว) สตรีมเมอร์จะได้เห็นว่าโดเนทไหนได้เพลง ไหนไม่ได้เพราะอะไร
 * — คนดูจ่ายเงินแล้ว ถ้าเพลงไม่เข้าเงียบๆ สตรีมเมอร์ต้องรู้เพื่อใส่ให้เอง
 */

import {
  KEY_KINDS,
  createSong,
  docsRoot,
  keyFor,
  loadChannel,
  lookupVideo,
  num,
  pickVideo,
  plainFields,
  safeEqual,
  searchOne,
  str,
} from "./song-ingest.js";

const DONATE_KEY = /^d1\.(\d{1,6})\.([A-Za-z0-9_-]{32})$/;

/** คำสั่งเดียวกับแชท (song-ingest.js COMMANDS) คนดูจะได้จำแบบเดียว */
const COMMAND = "!เพลง";

/** จดผลไว้กี่รายการ — พอให้ดูย้อนหลังระหว่างไลฟ์ ใบเดียวไม่โต */
const LOG_MAX = 10;

/** ยอดโดเนท — EasyDonate ส่งเป็นตัวเลข แต่เผื่อเครื่องมืออื่นส่งสตริงมีจุลภาค */
function amountOf(v) {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

/** ชื่อคนโดเนท — ตัดอักขระควบคุมและช่องว่างซ้อน ให้ผ่านกติกา byName (1–40 ตัว) */
function nameOf(v) {
  const clean = str(v)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  return clean || "ไม่ระบุชื่อ";
}

/**
 * หาคำขอเพลงในข้อความโดเนท — คืน null ถ้าไม่ได้ขอเพลง (โดเนทให้กำลังใจธรรมดา)
 *
 * ต่างจากแชทตรงที่ข้อความโดเนทมักเป็นประโยคยาวที่ถูกอ่านออกเสียงบนไลฟ์
 * จึงรับลิงก์ที่อยู่ตรงไหนก็ได้ และรับคำสั่งที่อยู่กลางประโยค ("รักนะ !เพลง ทางผ่าน")
 * แต่ไม่เอาทั้งข้อความไปค้นหาเอง — "สู้ๆ นะครับ" จะกลายเป็นเพลงสุ่มเข้าคิว และเสียโควตาฟรีๆ
 */
function requestOf(message) {
  const text = str(message).replace(/\s+/g, " ").trim();
  if (!text) return null;

  const link = pickVideo(text);
  if (link?.fromLink) return { videoId: link.videoId, fromLink: true, query: null };

  const at = text.indexOf(COMMAND);
  if (at < 0) return null;
  const query = text.slice(at + COMMAND.length).trim().slice(0, 100);
  if (!query) return null;
  // ไอดีคลิปโดดๆ หลังคำสั่ง ("!เพลง dQw4w9WgXcQ") ยังเป็นแค่การเดา ไม่เจอก็ค้นต่อ
  const guess = pickVideo(query);
  return { videoId: guess?.videoId ?? null, fromLink: false, query };
}

/** ชื่อเอกสารจากเลขอ้างอิงโดเนท — โดเนทเดียวกันยิงซ้ำ = ชื่อซ้ำ = Firestore ไม่สร้างใบที่สอง */
function docIdOf(referenceNo) {
  const ref = str(referenceNo).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return ref ? `ezdn-${ref}` : undefined;
}

/* ------------------------------------------------------------------ *
 * บันทึกผล (channels/{id}/private/easydonate)
 * ------------------------------------------------------------------ */

/** ค่า JS → ค่าแบบมีชนิดของ Firestore REST (กลับด้านของ plain() ใน song-ingest.js) */
function typed(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(typed) } };
  const fields = {};
  for (const [k, x] of Object.entries(v)) if (x !== undefined) fields[k] = typed(x);
  return { mapValue: { fields } };
}

/**
 * ต่อผลใหม่ไว้หัวรายการ — อ่านหนึ่ง เขียนหนึ่งต่อโดเนท
 * สองโดเนทเข้าพร้อมกันอาจทับกันจนรายการหายไปหนึ่ง ยอมได้ เป็นแค่บันทึกให้ดู
 * ตัวคิวจริงไม่ได้พึ่งใบนี้ บันทึกพลาดก็ไม่ทำให้เพลงหาย
 */
async function appendLog(env, token, channelId, entry) {
  const url = `${docsRoot(env)}/channels/${encodeURIComponent(channelId)}/private/easydonate`;
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const cur = await fetch(url, { headers: auth, signal: AbortSignal.timeout(8000) });
    const old = cur.ok ? plainFields((await cur.json())?.fields).log : [];
    const log = [entry, ...(Array.isArray(old) ? old : [])].slice(0, LOG_MAX);
    await fetch(url, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { log: typed(log), updatedAt: typed(entry.at) } }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* บันทึกไม่ลงก็ช่างมัน — ไม่ทำให้ webhook ล้ม */
  }
}

/* ------------------------------------------------------------------ *
 * ตัวจัดการ
 * ------------------------------------------------------------------ */

/**
 * @param helpers { reply, allow, botLogin } — ยืมจาก slip-verify.js
 *   (botLogin ตัวเดียวกับที่นั่น จะได้แชร์ token ที่แคชไว้)
 */
export async function handleEasyDonate(request, env, cors, helpers) {
  const { reply, allow, botLogin } = helpers;
  const bad = (reason, extra) => reply({ ok: false, reason, ...extra }, cors);

  if (request.method !== "POST") return bad("method-not-allowed");
  if (!env.INGEST_TOKEN) return bad("ingest-disabled");

  /* ตรวจลายเซ็นของลิงก์ก่อนแตะ Firestore เสมอ ลิงก์ปลอมจึงไม่ทำให้บอทต้องล็อกอินหรืออ่านอะไร */
  const params = new URL(request.url).searchParams;
  const channelId = str(params.get("c"));
  const m = DONATE_KEY.exec(str(params.get("k")));
  if (!channelId || !m) return bad("bad-token");
  const gen = Number(m[1]);
  const kind = KEY_KINDS.donate;
  if (!safeEqual(m[2], await keyFor(env, kind.label, channelId, gen))) return bad("bad-token");

  // โดเนทจริงไม่มาถี่ขนาดนี้ เกินนี้คือลิงก์หลุดแล้วโดนยิงรัว
  if (!allow(`ezdn:${channelId}`, num(env.MAX_DONATE_PER_MIN) || 30)) {
    return bad("rate-limited");
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return bad("bad-json");
  }
  if (!body || typeof body !== "object") return bad("bad-json");

  if (!env.BOT_EMAIL || !env.BOT_PASSWORD || !env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT) {
    return bad("no-bot");
  }
  let token;
  try {
    token = await botLogin(env);
  } catch (e) {
    return bad("bot-login-failed", { message: e?.message ?? null });
  }

  const channel = await loadChannel(env, token, channelId);
  if (channel?.error) return bad(channel.error);
  // loadChannel ถอยไปหาด้วย handle ได้ — ลิงก์ผูกกับไอดีเอกสาร ต้องตรงตัวเท่านั้น
  if (!channel || channel.id !== channelId) return bad("channel-not-found");
  // ลิงก์ของรุ่นก่อน = เจ้าของกด "สร้างลิงก์ใหม่" ไปแล้ว
  if (num(channel.data?.[kind.genField]) !== gen) return bad("key-revoked");

  const cfg = channel.data?.songs ?? {};
  const min = num(cfg.paidSkip?.min);
  const at = new Date().toISOString();

  /* ปุ่มทดสอบในสตูดิโอ — พิสูจน์ว่าลิงก์ถูก บอทล็อกอินได้ และบันทึกเขียนลง โดยไม่แตะคิว */
  if (body.test === true) {
    await appendLog(env, token, channelId, { at, name: "ทดสอบจากสตูดิโอ", amount: 0, result: "test" });
    return reply({ ok: true, test: true, min, songsOpen: cfg.enabled === true }, cors);
  }

  const name = nameOf(body.donatorName);
  const amount = amountOf(body.amount);
  const ask = requestOf(body.donateMessage);
  const base = { at, name, amount };
  const done = async (result, extra = {}) => {
    await appendLog(env, token, channelId, { ...base, result, ...extra });
    return reply({ ok: result === "queued", reason: result === "queued" ? undefined : result, ...extra }, cors);
  };

  // โดเนทธรรมดาที่ไม่ได้ขอเพลง — จดไว้แค่ชื่อกับยอด (ข้อความไม่เกี่ยวกับคิว ไม่เก็บ)
  if (!ask) return done("no-song");
  const query = ask.query ?? undefined;
  if (!(min > 0)) return done("off", { query });
  if (amount < min) return done("below-min", { query, min });
  // ปิดรับเพลงอยู่ — กติกาของ Firestore ก็ไม่ยอมให้เขียนอยู่ดี บอกให้ชัดดีกว่าเขียนแล้วพัง
  if (cfg.enabled !== true) return done("songs-closed", { query });

  /* หาคลิป — ลิงก์ไม่กินโควตา ชื่อเพลงกิน (ขั้นเดียวกับ song-ingest.js) */
  let track = ask.videoId ? await lookupVideo(ask.videoId) : null;
  if (!track && ask.fromLink) return done("video-not-found");
  const viaSearch = !track;
  if (!track) {
    try {
      track = await searchOne(env, ask.query);
    } catch (e) {
      return done(e?.message ?? "search-failed", { query });
    }
    if (!track) return done("no-match", { query });
  }

  /* ไม่เช็คเพดานของช่อง (คิวเต็ม/กี่เพลงต่อคน/เพลงซ้ำ) — คนดูจ่ายเงินมาแล้ว
     ปัดตกตรงนี้ = เงินไปแต่เพลงไม่มา ให้สตรีมเมอร์เป็นคนตัดสินใจข้ามเองจากหน้าคิวดีกว่า */
  const written = await createSong(
    env,
    token,
    channelId,
    {
      videoId: track.videoId,
      title: track.title,
      author: track.author,
      byUid: `easydonate:${name}`,
      byName: name,
      // ค้นจากชื่อเพลง: เก็บคำที่เขาพิมพ์ไว้ ค้นได้คลิปผิดตัวสตรีมเมอร์จะได้เห็นว่าเขาตั้งใจขออะไร
      message: viaSearch ? `โดเนท: ${ask.query}`.slice(0, 120) : null,
      source: "easydonate",
      paid: amount,
    },
    docIdOf(body.referenceNo),
  );

  // EasyDonate ยิงโดเนทเดิมซ้ำ — ใบแรกเข้าคิวไปแล้ว ไม่ต้องจดซ้ำ
  if (!written.ok && written.status === 409) {
    return reply({ ok: true, duplicated: true }, cors);
  }
  if (!written.ok) {
    return done(`write-failed-${written.status}`, { query, title: track.title });
  }
  return done("queued", { title: track.title, videoId: track.videoId, query });
}
