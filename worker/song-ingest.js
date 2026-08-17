/**
 * รับคำขอเพลงจากแชทไลฟ์ (ส่วนต่อของ Worker เดียวกับที่ตรวจสลิป)
 * ------------------------------------------------------------------
 * ทำไมต้องมีไฟล์นี้
 *   TikTok ไม่มี API สาธารณะให้อ่านคอมเมนต์ในไลฟ์ ตัวที่อ่านได้คือ
 *   สคริปต์ที่รันบนเครื่องสตรีมเมอร์ (ดู bridge/) ซึ่งเป็นโปรแกรมที่คนอื่น
 *   ก็เขียนเลียนแบบได้ ถ้าปล่อยให้มันเขียน Firestore ตรงๆ ก็เท่ากับใครก็ยัด
 *   เพลงเข้าคิวช่องไหนก็ได้ในนามคนดูปลอม
 *
 *   ตัวกลางตรงนี้จึงเป็นคนถือกุญแจ: ตรวจ token ของสะพาน ตรวจว่าช่องเปิดรับอยู่
 *   บังคับเพดานเดียวกับหน้าเว็บ แล้วค่อยเขียนใบด้วยบัญชีบอท
 *   (บัญชีเดียวกับที่ใช้อนุมัติสลิป — ดู slip-verify.js หัวข้อ "อนุมัติใบให้เอง")
 *
 * สัญญาการเรียก
 *   POST /?ingest=1
 *   Authorization: Bearer <INGEST_TOKEN>
 *   JSON { channelId | handle, user: { id, name }, query | text, platform? }
 *
 *   query = ข้อความที่ตัดคำสั่งออกแล้ว ("แสงสุดท้าย bodyslam")
 *   text  = บรรทัดแชทดิบ ("!เพลง แสงสุดท้าย") — ตัวนี้จะถูกเมินถ้าไม่ขึ้นต้นด้วยคำสั่ง
 *   มีสองแบบเพราะสะพานที่เราเขียนเองตัดคำสั่งมาให้แล้ว ส่วนเครื่องมือของคนอื่น
 *   (เช่น Social Stream Ninja) ยิง webhook มาเป็นบรรทัดแชทดิบ
 *
 *   ตอบ 200 เสมอ { ok, reason?, ... } ด้วยเหตุผลเดียวกับที่หัว slip-verify.js
 */

/* ------------------------------------------------------------------ *
 * ลิงก์ YouTube — คู่แฝดของ lib/song/youtube.ts ฝั่งเว็บ
 *
 * ต้องมีสำเนาตรงนี้เพราะ Worker deploy แยกจากเว็บ import ข้ามกันไม่ได้
 * แก้ที่ไหนแก้อีกที่ด้วย
 * ------------------------------------------------------------------ */

const ID = /^[A-Za-z0-9_-]{11}$/;

export function videoIdFrom(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (ID.test(text)) return text;

  let url;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return ID.test(parts[0] ?? "") ? parts[0] : null;

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const v = url.searchParams.get("v");
    if (v && ID.test(v)) return v;
    if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) {
      return ID.test(parts[1] ?? "") ? parts[1] : null;
    }
  }
  return null;
}

/**
 * หาลิงก์คลิปในข้อความแชท
 *
 * ต่างจากหน้าเว็บที่มีช่องให้วางลิงก์อย่างเดียว ในแชทลิงก์มักปนอยู่กับคำพูด
 * ("!เพลง https://youtu.be/xxx เพราะมาก") จึงต้องไล่ดูทีละคำ
 *
 * "ไอดีโดดๆ" รับเฉพาะตอนที่ทั้งข้อความมีแค่คำเดียว และยังถือว่าเป็นแค่การเดา
 * (fromLink = false) เพราะคำภาษาอังกฤษยาว 11 ตัวอักษรก็ผ่าน ID ได้เหมือนกัน
 * — คนพิมพ์ว่า "wonderwall1" ตั้งใจจะให้ค้นหา ไม่ได้ตั้งใจส่งไอดีคลิป
 * ตัวเรียกจึงต้องถอยไปค้นหาให้ถ้าเปิดคลิปตามไอดีที่เดาแล้วไม่เจอ
 */
function pickVideo(query) {
  for (const token of query.split(/\s+/)) {
    if (!/youtu/i.test(token)) continue;
    // ตัดเครื่องหมายวรรคตอนท้ายคำที่คนมักพิมพ์ติดมากับลิงก์
    const id = videoIdFrom(token.replace(/[.,!?)\]]+$/, ""));
    if (id) return { videoId: id, fromLink: true };
  }
  if (ID.test(query)) return { videoId: query, fromLink: false };
  return null;
}

const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}`;

/** ถามชื่อคลิปจาก oEmbed — ไม่ต้องใช้คีย์ ไม่กินโควตา และได้ตรวจว่าคลิปมีจริงไปในตัว */
async function lookupVideo(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        watchUrl(videoId),
      )}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      videoId,
      title: String(data?.title ?? "").slice(0, 140) || "ไม่ทราบชื่อเพลง",
      author: String(data?.author_name ?? "").slice(0, 80),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * ค้นหาด้วยชื่อเพลง + แคช
 *
 * โควตาฟรีของ YouTube Data API คือ 10,000 หน่วย/วัน และการค้นหาครั้งละ
 * 100 หน่วย = ค้นได้ราววันละ 100 ครั้งเท่านั้น ซึ่งน้อยมากเมื่อเทียบกับ
 * ความเร็วที่คนพิมพ์ในแชทไลฟ์ แคชจึงไม่ใช่ของฟุ่มเฟือย แต่เป็นตัวที่ทำให้
 * ระบบนี้ใช้ได้จริง — คนดูขอเพลงฮิตเพลงเดียวกันซ้ำๆ ทั้งไลฟ์อยู่แล้ว
 *
 * แคชในหน่วยความจำหายเมื่อ instance ถูกรีไซเคิล และ Cloudflare รันหลาย
 * instance ที่ไม่เห็นแคชของกัน ถ้าผูก KV ชื่อ SONG_CACHE ไว้ใน wrangler.toml
 * จะใช้ KV เป็นชั้นที่สองให้เอง (ไม่ผูกก็ทำงานได้ แค่ยิงซ้ำบ่อยขึ้น)
 * ------------------------------------------------------------------ */

const memCache = new Map();
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const cacheKey = (q) => `song:${q.toLowerCase().replace(/\s+/g, " ").trim()}`;

async function cacheGet(env, key) {
  const hit = memCache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  if (hit) memCache.delete(key);

  if (!env.SONG_CACHE) return undefined;
  try {
    /* ห่อไว้ในอ็อบเจกต์ ไม่เก็บค่าดิบ เพราะ KV คืน null ทั้งกรณี "ไม่มีคีย์นี้"
       และกรณี "เคยเก็บ null ไว้" — ซึ่งเป็นคนละเรื่องกัน: อย่างหลังคือคำที่
       ค้นแล้วไม่เจอ ถ้าแยกไม่ออกก็จะไปค้นซ้ำแล้วเสียโควตาฟรีๆ ทุกครั้ง */
    const raw = await env.SONG_CACHE.get(key, "json");
    if (raw && typeof raw === "object" && "track" in raw) {
      memCache.set(key, { value: raw.track, until: Date.now() + CACHE_TTL_MS });
      return raw.track;
    }
  } catch {
    /* KV ล่มก็แค่ไม่มีแคช ไม่ต้องทำให้ทั้งคำขอพัง */
  }
  return undefined;
}

async function cachePut(env, key, value) {
  // กัน Map โตไม่หยุดถ้า instance อยู่ยาว — ทิ้งตัวที่หมดอายุก่อน แล้วค่อยตัดหัวแถว
  if (memCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of memCache) if (v.until <= now) memCache.delete(k);
    while (memCache.size > 400) memCache.delete(memCache.keys().next().value);
  }
  memCache.set(key, { value, until: Date.now() + CACHE_TTL_MS });

  if (!env.SONG_CACHE) return;
  try {
    await env.SONG_CACHE.put(key, JSON.stringify({ track: value }), {
      expirationTtl: CACHE_TTL_MS / 1000,
    });
  } catch {
    /* เหมือนกัน แคชเขียนไม่ลงไม่ใช่เรื่องคอขาดบาดตาย */
  }
}

/** ค้นหาเพลงหนึ่งเพลงจากชื่อ — คืน null เมื่อไม่เจอ, โยน Error เมื่อค้นไม่ได้ */
async function searchOne(env, query) {
  const key = cacheKey(query);
  const cached = await cacheGet(env, key);
  // เก็บ "ไม่เจอ" ไว้ในแคชด้วย (null) ไม่งั้นคำที่ค้นยังไงก็ไม่เจอจะกินโควตาซ้ำทุกครั้ง
  if (cached !== undefined) return cached;

  if (!env.YT_API_KEY) throw new Error("no-youtube-key");

  const api = new URL("https://www.googleapis.com/youtube/v3/search");
  api.searchParams.set("part", "snippet");
  api.searchParams.set("type", "video");
  // จำนวนผลลัพธ์ไม่มีผลกับโควตา (100 หน่วยเท่ากันหมด) ขอน้อยๆ ให้ payload เล็กพอ
  api.searchParams.set("maxResults", "1");
  api.searchParams.set("videoEmbeddable", "true");
  api.searchParams.set("q", query.slice(0, 100));
  api.searchParams.set("key", env.YT_API_KEY);

  const res = await fetch(api.toString(), { signal: AbortSignal.timeout(10000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = data?.error?.message ?? `HTTP_${res.status}`;
    throw new Error(/quota/i.test(msg) ? "youtube-quota" : "youtube-error");
  }

  const hit = (data?.items ?? []).find((it) => it?.id?.videoId);
  const track = hit
    ? {
        videoId: hit.id.videoId,
        title: String(hit.snippet?.title ?? "").slice(0, 140) || "ไม่ทราบชื่อเพลง",
        author: String(hit.snippet?.channelTitle ?? "").slice(0, 80),
      }
    : null;

  await cachePut(env, key, track);
  return track;
}

/* ------------------------------------------------------------------ *
 * Firestore REST
 *
 * ใช้ REST ตรงๆ ไม่ใช่ SDK เพราะ Workers ไม่มี Node runtime เต็ม
 * และเราไม่ต้องการ service account — บอทล็อกอินด้วยอีเมล/รหัสผ่านธรรมดา
 * แล้วเดินผ่านกติกา firestore.rules เหมือนผู้ใช้คนหนึ่ง (ดูเหตุผลใน slip-verify.js)
 * ------------------------------------------------------------------ */

const docsRoot = (env) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT}/databases/(default)/documents`;

/** แปลงค่าแบบมีชนิดของ Firestore กลับเป็นค่า JS ธรรมดา */
function plain(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return plainFields(v.mapValue?.fields);
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map(plain);
  return null;
}

function plainFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = plain(v);
  return out;
}

/**
 * หาช่อง — รับได้ทั้งไอดีเอกสารและ handle
 *
 * รับสองแบบเพราะสตรีมเมอร์จำ handle ของตัวเองได้ (มันคือชื่อในลิงก์ที่แจกคนดู)
 * แต่จำไอดีเอกสารที่เป็นตัวอักษรสุ่มไม่ได้ ให้ตั้งค่าสะพานผิดยากขึ้นหน่อย
 */
async function loadChannel(env, token, ref) {
  const auth = { Authorization: `Bearer ${token}` };

  const direct = await fetch(
    `${docsRoot(env)}/channels/${encodeURIComponent(ref)}`,
    { headers: auth, signal: AbortSignal.timeout(10000) },
  ).then((r) => r.json());
  if (direct?.fields) {
    return { id: ref, data: plainFields(direct.fields) };
  }

  const found = await fetch(`${docsRoot(env)}:runQuery`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "channels" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "handle" },
            op: "EQUAL",
            value: { stringValue: ref.toLowerCase() },
          },
        },
        limit: 1,
      },
    }),
  }).then((r) => r.json());

  const doc = Array.isArray(found) ? found.find((row) => row?.document)?.document : null;
  if (!doc) return null;
  return { id: doc.name.split("/").pop(), data: plainFields(doc.fields) };
}

/**
 * คิวที่ยังไม่จบของช่อง — เอาไว้บังคับเพดานให้ตรงกับหน้าเว็บ
 *
 * ขอเฉพาะฟิลด์ที่ใช้ตัดสิน (select) ไม่ดึงทั้งใบ เพราะชื่อเพลงกับข้อความ
 * ของทั้งคิวรวมกันแล้วใหญ่โดยไม่จำเป็น ตรงนี้อยู่ในเส้นทางที่คนดูรออยู่
 */
async function loadOpenQueue(env, token, channelId) {
  const res = await fetch(
    `${docsRoot(env)}/channels/${encodeURIComponent(channelId)}:runQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "songRequests" }],
          select: {
            fields: [
              { fieldPath: "videoId" },
              { fieldPath: "byUid" },
              { fieldPath: "status" },
              { fieldPath: "source" },
            ],
          },
          where: {
            fieldFilter: {
              field: { fieldPath: "status" },
              op: "IN",
              value: {
                arrayValue: {
                  values: [{ stringValue: "queued" }, { stringValue: "playing" }],
                },
              },
            },
          },
          limit: 300,
        },
      }),
    },
  ).then((r) => r.json());

  if (!Array.isArray(res)) return [];
  return res
    .filter((row) => row?.document?.fields)
    .map((row) => plainFields(row.document.fields));
}

/** เขียนใบใหม่เข้าคิว */
async function createSong(env, token, channelId, song) {
  const S = (v) => ({ stringValue: v });
  const res = await fetch(
    `${docsRoot(env)}/channels/${encodeURIComponent(channelId)}/songRequests`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        fields: {
          channelId: S(channelId),
          videoId: S(song.videoId),
          title: S(song.title),
          author: S(song.author),
          url: S(watchUrl(song.videoId)),
          byUid: S(song.byUid),
          byName: S(song.byName),
          message: song.message ? S(song.message) : { nullValue: null },
          source: S(song.source),
          status: S("queued"),
          createdAt: S(new Date().toISOString()),
          playedAt: { nullValue: null },
        },
      }),
    },
  );

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, message: json?.error?.message ?? null };
  }
  return { ok: true, id: String(json?.name ?? "").split("/").pop() };
}

/* ------------------------------------------------------------------ *
 * ตัวจัดการคำขอ
 * ------------------------------------------------------------------ */

/** คำสั่งที่ยอมรับเมื่อรับบรรทัดแชทดิบมา (สะพานของเราตัดให้ก่อนแล้ว) */
const COMMANDS = [
  "!เพลง",
  "!ขอเพลง",
  "!song",
  "!sr",
  "!play",
  "/เพลง",
  "/song",
];

/** คืนข้อความหลังคำสั่ง หรือ null ถ้าไม่ใช่คำขอเพลง (แชทคุยเล่นทั่วไป) */
function stripCommand(text) {
  const t = text.trim();
  const lower = t.toLowerCase();
  for (const cmd of COMMANDS) {
    if (lower.startsWith(cmd)) return t.slice(cmd.length).trim();
  }
  return null;
}

/**
 * เทียบ token แบบไม่แพ้เวลา
 *
 * เทียบด้วย === ธรรมดาจะหยุดทันทีที่เจอตัวอักษรตัวแรกที่ต่าง ซึ่งวัดเวลา
 * แล้วเดาทีละตัวได้ ความยาวยังรั่วอยู่ แต่ความยาวอย่างเดียวเดา token ไม่ได้
 */
function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* รับตัวเลขด้วย ไม่ใช่แค่สตริง — webhook ของเครื่องมืออื่นชอบส่งไอดีผู้ใช้
   มาเป็นตัวเลขดิบ ถ้าเมินไปเฉยๆ คำขอจะตกหายโดยไม่มีใครรู้ว่าเพราะอะไร */
const str = (v) =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** แพลตฟอร์มที่ยอมรับ — ต้องตรงกับที่ firestore.rules ยอมให้บอทเขียนแทน */
const PLATFORMS = ["tiktok", "youtube", "twitch"];

/**
 * @param helpers { reply, allow, botLogin } — ยืมจาก slip-verify.js
 *   botLogin ต้องเป็นตัวเดียวกับที่นั่นใช้ จะได้แชร์ token ที่แคชไว้ ไม่ต้อง
 *   ล็อกอินใหม่ทุกเพลง (idToken ของ Firebase อยู่ได้ชั่วโมงหนึ่ง)
 */
export async function handleSongIngest(request, env, cors, helpers) {
  const { reply, allow, botLogin } = helpers;
  const bad = (reason, extra) => reply({ ok: false, reason, ...extra }, cors);

  if (request.method !== "POST") return bad("method-not-allowed");

  // ไม่ตั้ง token = ปิดทางนี้ไว้ ไม่ใช่เปิดให้ใครก็ได้
  if (!env.INGEST_TOKEN) return bad("ingest-disabled");
  const header = request.headers.get("Authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!safeEqual(given, env.INGEST_TOKEN)) return bad("bad-token");

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("bad-json");
  }
  if (!body || typeof body !== "object") return bad("bad-json");

  const ref = str(body.channelId) || str(body.handle);
  if (!ref) return bad("no-channel");

  const platform = (str(body.platform) || "tiktok").toLowerCase();
  if (!PLATFORMS.includes(platform)) return bad("bad-platform");

  const who = body.user && typeof body.user === "object" ? body.user : {};
  const handle = str(who.id) || str(who.name);
  if (!handle) return bad("no-user");
  const name = (str(who.name) || handle).slice(0, 40);
  const byUid = `${platform}:${handle.replace(/^@/, "").slice(0, 60)}`;

  /* ข้อความ — query คือของที่ตัดคำสั่งมาแล้ว, text คือบรรทัดแชทดิบ */
  const hasQuery = str(body.query) !== "";
  const raw = hasQuery ? str(body.query) : stripCommand(str(body.text));
  if (raw === null) return bad("not-a-command");
  if (!raw) return bad("empty-query");
  const query = raw.slice(0, 100);

  /* เพดานกันสแปม — นับต่อช่องและต่อคน
     ตรงนี้กันการยิงรัวเข้ามาที่ Worker ส่วนกติกาของช่อง (กี่เพลงต่อคน)
     ไปเช็คทีหลังจากคิวจริง เพราะอันนั้นเป็นเรื่องความยุติธรรม ไม่ใช่ความปลอดภัย */
  if (!allow(`ingest:${ref}`, num(env.MAX_INGEST_PER_MIN) || 20)) {
    return bad("rate-limited");
  }
  if (!allow(`ingest-user:${byUid}`, num(env.MAX_INGEST_PER_USER_MIN) || 2)) {
    return bad("cooldown");
  }

  if (!env.BOT_EMAIL || !env.BOT_PASSWORD || !env.FIREBASE_API_KEY || !env.FIREBASE_PROJECT) {
    return bad("no-bot");
  }

  let token;
  try {
    token = await botLogin(env);
  } catch (e) {
    return bad("bot-login-failed", { message: e?.message ?? null });
  }

  const channel = await loadChannel(env, token, ref);
  if (!channel) return bad("channel-not-found");

  const cfg = channel.data?.songs ?? {};
  // ปิดรับแล้วต้องปิดจริง — กติกาฝั่ง Firestore ก็เช็คซ้ำอีกชั้นอยู่แล้ว
  if (cfg.enabled !== true) return bad("songs-closed");

  /* หาคลิป — ลิงก์ไม่กินโควตา ชื่อเพลงกิน จึงลองลิงก์ก่อนเสมอ */
  const guess = pickVideo(query);
  let track = guess ? await lookupVideo(guess.videoId) : null;

  // ลิงก์เต็มๆ ที่เปิดไม่ได้ = คลิปถูกลบหรือเป็นส่วนตัว บอกไปตรงๆ ดีกว่า
  // เอาลิงก์ที่เขาตั้งใจส่งไปค้นหาแล้วได้คลิปอื่นมาแทน
  if (!track && guess?.fromLink) return bad("video-not-found");

  const viaSearch = !track;
  if (!track) {
    try {
      track = await searchOne(env, query);
    } catch (e) {
      const why = e?.message ?? "search-failed";
      return bad(why);
    }
    if (!track) return bad("no-match");
  }

  /* เพดานของช่อง — คิดจากคิวจริง ให้ได้ผลเดียวกับหน้าเว็บ (lib/song/store.ts) */
  const queue = await loadOpenQueue(env, token, channel.id);
  const maxQueue = num(cfg.maxQueue);
  const maxPerUser = num(cfg.maxPerUser);

  if (maxQueue && queue.length >= maxQueue) return bad("queue-full");
  if (cfg.allowDuplicates !== true && queue.some((s) => s.videoId === track.videoId)) {
    return bad("duplicate", { title: track.title });
  }
  if (maxPerUser && queue.filter((s) => s.byUid === byUid).length >= maxPerUser) {
    return bad("too-many");
  }

  const written = await createSong(env, token, channel.id, {
    videoId: track.videoId,
    title: track.title,
    author: track.author,
    byUid,
    byName: name,
    // ใบที่มาจากการค้นหาเก็บคำที่เขาพิมพ์ไว้ด้วย เวลาค้นได้คลิปผิดตัว
    // สตรีมเมอร์จะได้เห็นว่าเขาตั้งใจขออะไร (ใบที่วางลิงก์มาไม่ต้อง ลิงก์คือคำตอบอยู่แล้ว)
    message: viaSearch ? `แชท: ${query}`.slice(0, 120) : null,
    source: platform === "tiktok" ? "tiktok" : "viewer",
  });

  if (!written.ok) {
    return bad(`write-failed-${written.status}`, { message: written.message });
  }

  // เพลงสำรองต่อท้ายเสมอ ใบจริงจึงแทรกขึ้นก่อน — นับตำแหน่งให้ตรงกับที่คนดูจะเห็น
  const ahead = queue.filter((s) => s.status === "queued" && s.source !== "filler").length;
  return reply(
    {
      ok: true,
      id: written.id,
      videoId: track.videoId,
      title: track.title,
      author: track.author,
      position: ahead + 1,
    },
    cors,
  );
}
