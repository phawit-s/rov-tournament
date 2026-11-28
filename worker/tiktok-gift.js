/**
 * ลัดคิวด้วยของขวัญ TikTok (ส่วนต่อของ Worker เดียวกับที่ตรวจสลิป)
 * ------------------------------------------------------------------
 * คนดูส่งของขวัญในไลฟ์รวมถึงจำนวนเหรียญที่สตรีมเมอร์ตั้งไว้ (songs.giftSkip.min)
 * → โปรแกรมสะพานบนเครื่องสตรีมเมอร์เห็นอีเวนต์ gift แล้วส่งมาที่นี่ (bridge/core.mjs onGift)
 * → เพลงแรกที่คนนั้นขอไว้ในคิว ขึ้นชั้นลัดคิว (ฟิลด์ paid เหมือนโดเนท EasyDonate)
 *
 * ต่างจาก EasyDonate ตรงที่ของขวัญไม่มีข้อความแนบ จึงสร้างเพลงใหม่ไม่ได้ ทำได้แค่เลื่อนเพลง
 * ที่ขอไว้แล้ว ไม่มีเพลงรอคิว = ไม่เกิดอะไรขึ้น ไม่เก็บสิทธิ์ไว้ใช้ทีหลัง (เจ้าของเลือกแบบนี้ พ.ย. 2569)
 *
 * เพลงของ "คนนี้" มีสองแบบ (candidatesOf) ลัดให้ตามลำดับนี้
 *   1. ขอจากแชท — byUid "tiktok:<ชื่อผู้ใช้>" ตัวเดียวกับที่ song-ingest.js เขียน ยืนยันได้ว่าเป็นบัญชีนั้นจริง
 *   2. ขอจากหน้าเว็บ โดยกรอก "ชื่อของคุณ" เป็นชื่อผู้ใช้ TikTok (เจ้าของขอเพิ่ม 28 พ.ย. 2569)
 *      เทียบแบบไม่สนตัวพิมพ์และ @ · เทียบกับชื่อผู้ใช้ (@) เท่านั้น ไม่ใช่ชื่อเล่นในไลฟ์ซึ่งซ้ำกันง่าย
 *      ช่องชื่อในหน้าเว็บใครจะพิมพ์อะไรก็ได้ (แอบใช้ชื่อคนอื่นได้) จึงมาหลังเพลงจากแชทเสมอ
 *
 * ความปลอดภัย
 *   Worker ตรวจเองไม่ได้ว่ามีของขวัญจริง ต้องเชื่อสะพานที่ถือรหัสเชื่อมต่อของช่อง (k1.)
 *   ระดับเดียวกับคำขอเพลงจากแชท — รหัสหลุด = ปลอมการลัดคิวช่องนั้นได้ แก้ด้วยการสร้างรหัสใหม่
 *
 * สัญญาการเรียก
 *   POST /?gift=1
 *   Authorization: Bearer <INGEST_TOKEN หรือรหัสต่อช่อง k1.>
 *   JSON { channelId, user: { id, name }, coins }
 *     coins = เหรียญรวม (ราคาของขวัญ × จำนวนที่กดรัว) สะพานรวมของหลายครั้งของคนเดียวกันมาให้แล้ว
 *   ตอบ 200 เสมอ { ok, reason?, min?, title?, ... }
 *     min ส่งกลับทุกครั้งที่อ่านช่องได้ — สะพานจำไว้ ของขวัญเล็กๆ ที่ยังไม่ถึงจะได้ไม่ต้องส่งมา
 *     ไม่งั้นกุหลาบ 1 เหรียญทุกดอกในไลฟ์จะกลายเป็นค่าอ่าน Firestore
 *
 * ค่าอ่านต่อครั้งที่ถึงขั้นต่ำ: ช่อง 1 + คิวสรุป 1 + ใบที่จะลัด 1 + เขียน 1
 *   ตัวเล่นไม่ได้เปิด (ไม่มีคิวสรุป) ค้นตรงแทน: 3 คำค้น ใบละอย่างน้อย 1
 */

import {
  checkBridgeKey,
  docsRoot,
  keyRevoked,
  loadChannel,
  loadSnapshot,
  num,
  plainFields,
  str,
} from "./song-ingest.js";

/** ป้ายหน่วยของ paid — ใบที่ไม่มีป้ายนี้คือบาท (โดเนท EasyDonate) ดู lib/song/types.ts */
const UNIT = "coin";

/** ชื่อแบบเทียบกันได้ — "@Phawit-S " กับ "phawit-s" ถือว่าตรงกัน */
const norm = (s) => String(s ?? "").trim().replace(/^@+/, "").trim().toLowerCase();

/** ใบที่คนดูขอเองจากหน้าเว็บ — ใบเก่าไม่มี source ถือว่ามาจากหน้าเว็บ (lib/song/types.ts) */
const fromWeb = (s) => !s.source || s.source === "viewer";

/** ลำดับเดียวกับคิวจริง (sortKeyOf ใน lib/song/store.ts) */
const sortKey = (s) => s.orderKey || s.createdAt || "";
const byQueue = (a, b) => sortKey(a).localeCompare(sortKey(b)) || String(a.id).localeCompare(String(b.id));

/** แปลงแถวจาก REST เป็นใบเพลง พร้อม name (พาธเต็ม) และ updateTime ไว้เขียนแบบมีเงื่อนไข */
const songOf = (doc) => ({
  ...plainFields(doc.fields),
  id: doc.name.split("/").pop(),
  name: doc.name,
  updateTime: doc.updateTime,
});

/** ใบเดียวตามไอดี — ใบจากคิวสรุปไม่มี updateTime และอาจช้ากว่าของจริงไม่กี่วินาที จึงอ่านซ้ำก่อนเขียน */
async function fetchSong(env, token, channelId, id) {
  const res = await fetch(
    `${docsRoot(env)}/channels/${encodeURIComponent(channelId)}/songRequests/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) return null;
  const doc = await res.json().catch(() => null);
  return doc?.fields ? songOf(doc) : null;
}

/** ใบที่รอคิวและ field เท่ากับ value — คืน { songs } หรือ { error } */
async function queryQueued(env, token, channelId, field, value) {
  const res = await fetch(
    `${docsRoot(env)}/channels/${encodeURIComponent(channelId)}:runQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "songRequests" }],
          // เท่ากับสองฟิลด์ล้วน Firestore รวมดัชนีฟิลด์เดี่ยวให้เอง ไม่ต้องสร้างดัชนีผสม
          where: {
            compositeFilter: {
              op: "AND",
              filters: [
                {
                  fieldFilter: {
                    field: { fieldPath: field },
                    op: "EQUAL",
                    value: { stringValue: value },
                  },
                },
                {
                  fieldFilter: {
                    field: { fieldPath: "status" },
                    op: "EQUAL",
                    value: { stringValue: "queued" },
                  },
                },
              ],
            },
          },
          limit: 20,
        },
      }),
    },
  );
  if (res.status === 429) return { error: "db-quota" };
  const rows = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(rows)) return { error: `read-failed-${res.status}` };
  return { songs: rows.filter((row) => row?.document?.fields).map((row) => songOf(row.document)) };
}

/**
 * เพลงที่รอคิวของคนนี้ เรียงตามที่จะลัดให้: ขอจากแชทก่อน แล้วค่อยขอจากหน้าเว็บที่ชื่อตรง
 * (ในแต่ละกลุ่มเรียงตามลำดับคิวจริง) — คืน { free, total } หรือ { error }
 *   free  = ใบที่ยังไม่ได้ลัดคิว · total = ทุกใบที่รอคิว ไว้แยก "ไม่มีเพลง" กับ "ลัดอยู่แล้วทุกเพลง"
 *
 * คิวสรุปก่อน (1 read เทียบชื่อแบบไม่สนตัวพิมพ์ได้) ตัวเล่นไม่ได้เปิดค่อยค้นตรง
 * ซึ่ง Firestore เทียบแบบตรงตัว จึงจับได้แค่ชื่อที่พิมพ์ตัวเล็กเหมือนชื่อผู้ใช้ TikTok (มี/ไม่มี @)
 */
async function candidatesOf(env, token, channelId, byUid, handle) {
  const want = norm(handle);
  const isWeb = (s) => !!want && fromWeb(s) && norm(s.byName) === want;

  let chat;
  let web;
  const snap = await loadSnapshot(env, token, channelId);
  if (snap) {
    const queued = snap.filter((s) => s?.status === "queued" && s.id);
    chat = queued.filter((s) => s.byUid === byUid);
    web = queued.filter(isWeb);
  } else {
    const found = await Promise.all([
      queryQueued(env, token, channelId, "byUid", byUid),
      ...(want
        ? [
            queryQueued(env, token, channelId, "byName", want),
            queryQueued(env, token, channelId, "byName", `@${want}`),
          ]
        : []),
    ]);
    const failed = found.find((f) => f.error);
    if (failed) return { error: failed.error };
    chat = found[0].songs;
    web = found.slice(1).flatMap((f) => f.songs).filter(isWeb);
  }

  const free = (list) => list.filter((s) => !(num(s.paid) > 0)).sort(byQueue);
  return { free: [...free(chat), ...free(web)], total: chat.length + web.length };
}

/**
 * ยกใบขึ้นชั้นลัดคิว
 *
 * orderKey = ตอนนี้ — ในชั้นลัดคิวเรียงตามเวลาที่จ่าย (โดเนท EasyDonate ใช้ createdAt ซึ่งก็คือเวลาโดเนท)
 * ถ้าไม่ตั้ง ใบที่ขอไว้ตั้งแต่ต้นไลฟ์จะแซงคนที่โดเนทลัดคิวไปก่อนหน้า
 *
 * currentDocument.updateTime — ใบต้องยังเป็นตัวเดียวกับที่เพิ่งอ่าน ถ้าระหว่างนั้นเพลงเริ่มเล่น
 * หรือสตรีมเมอร์ลบทิ้ง Firestore จะปฏิเสธ แทนที่จะไปติดป้ายลัดคิวให้เพลงที่เล่นไปแล้ว
 */
async function promote(token, song, coins) {
  const url = new URL(`https://firestore.googleapis.com/v1/${song.name}`);
  for (const f of ["paid", "paidUnit", "orderKey"]) url.searchParams.append("updateMask.fieldPaths", f);
  url.searchParams.set("currentDocument.updateTime", song.updateTime);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      fields: {
        paid: { integerValue: String(coins) },
        paidUnit: { stringValue: UNIT },
        orderKey: { stringValue: new Date().toISOString() },
      },
    }),
  });
  if (res.ok) return { ok: true };
  const json = await res.json().catch(() => null);
  const status = json?.error?.status;
  return {
    ok: false,
    changed: status === "FAILED_PRECONDITION" || status === "NOT_FOUND" || res.status === 404,
    status: res.status,
  };
}

/**
 * @param helpers { reply, allow, botLogin } — ยืมจาก slip-verify.js
 */
export async function handleGiftSkip(request, env, cors, helpers) {
  const { reply, allow, botLogin } = helpers;
  const bad = (reason, extra) => reply({ ok: false, reason, ...extra }, cors);

  if (request.method !== "POST") return bad("method-not-allowed");
  if (!env.INGEST_TOKEN) return bad("ingest-disabled");

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("bad-json");
  }
  if (!body || typeof body !== "object") return bad("bad-json");

  const ref = str(body.channelId);
  if (!ref) return bad("no-channel");
  const key = await checkBridgeKey(env, request, ref);
  if (key.reason) return bad(key.reason);

  /* ชื่อคนต้องแปลงแบบเดียวกับ handleSongIngest ทุกตัวอักษร ไม่งั้นจับคู่กับเพลงที่เขาขอไม่ติด */
  const who = body.user && typeof body.user === "object" ? body.user : {};
  const handle = str(who.id) || str(who.name);
  if (!handle) return bad("no-user");
  const byUid = `tiktok:${handle.replace(/^@/, "").slice(0, 60)}`;

  const coins = Math.floor(num(body.coins));
  if (!(coins > 0)) return bad("no-coins");

  // สะพานกรองของขวัญที่ไม่ถึงขั้นต่ำไว้แล้ว ที่เข้ามาถึงตรงนี้ควรนับได้ไม่กี่ครั้งต่อนาที
  if (!allow(`gift:${ref}`, num(env.MAX_GIFT_PER_MIN) || 30)) return bad("rate-limited");

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
  if (channel?.error) return bad(channel.error);
  if (!channel) return bad("channel-not-found");
  if (keyRevoked(key.scoped, channel)) return bad("key-revoked");

  const min = Math.max(0, Math.floor(num(channel.data?.songs?.giftSkip?.min)));
  if (!(min > 0)) return bad("gift-off", { min: 0 });
  if (coins < min) return bad("below-min", { min });

  // เทียบกับเพลงจากหน้าเว็บด้วยชื่อผู้ใช้ (who.id) เท่านั้น ไม่ใช้ชื่อเล่น
  const mine = await candidatesOf(env, token, channel.id, byUid, str(who.id));
  if (mine.error) return bad(mine.error, { min });
  // ใบที่ลัดคิวอยู่แล้ว (โดเนทหรือของขวัญรอบก่อน) ไม่อยู่ใน free — ยกเพลงถัดไปของเขาแทน
  if (!mine.free.length) return bad(mine.total ? "already-skipped" : "no-song", { min });

  /* ลองไม่เกินสามใบ — ใบที่เพิ่งเปลี่ยนระหว่างนั้น (เพลงเพิ่งเริ่มเล่น ถูกลบ ถูกลัดไปแล้ว)
     ข้ามไปเพลงถัดไปของเขา ใบจากคิวสรุปอ่านซ้ำก่อนเพื่อเอา updateTime และสถานะล่าสุด */
  for (const s of mine.free.slice(0, 3)) {
    const target = s.updateTime ? s : await fetchSong(env, token, channel.id, s.id);
    if (!target || target.status !== "queued" || num(target.paid) > 0) continue;

    const done = await promote(token, target, coins);
    if (done.ok) {
      return reply(
        {
          ok: true,
          min,
          coins,
          id: target.id,
          title: target.title,
          videoId: target.videoId,
          via: fromWeb(target) ? "web" : "chat",
        },
        cors,
      );
    }
    if (!done.changed) return bad(`write-failed-${done.status}`, { min, title: target.title });
  }
  return bad("song-changed", { min });
}
