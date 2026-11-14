/**
 * ลัดคิวด้วยของขวัญ TikTok (ส่วนต่อของ Worker เดียวกับที่ตรวจสลิป)
 * ------------------------------------------------------------------
 * คนดูส่งของขวัญในไลฟ์รวมถึงจำนวนเหรียญที่สตรีมเมอร์ตั้งไว้ (songs.giftSkip.min)
 * → โปรแกรมสะพานบนเครื่องสตรีมเมอร์เห็นอีเวนต์ gift แล้วส่งมาที่นี่ (bridge/core.mjs onGift)
 * → เพลงแรกที่คนนั้นขอไว้ในคิว ขึ้นชั้นลัดคิว (ฟิลด์ paid เหมือนโดเนท EasyDonate)
 *
 * ต่างจาก EasyDonate ตรงที่ของขวัญไม่มีข้อความแนบ จึงสร้างเพลงใหม่ไม่ได้ ทำได้แค่เลื่อนเพลง
 * ที่ขอไว้แล้ว จับคู่ด้วย byUid "tiktok:<ชื่อ>" ตัวเดียวกับที่ song-ingest.js เขียนตอนขอจากแชท
 * ไม่มีเพลงรอคิว = ไม่เกิดอะไรขึ้น ไม่เก็บสิทธิ์ไว้ใช้ทีหลัง (เจ้าของเลือกแบบนี้ พ.ย. 2569)
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
 * ค่าอ่านต่อครั้งที่ถึงขั้นต่ำ: ช่อง 1 + เพลงที่รอคิวของคนนั้น (ปกติ 1–2) + เขียน 1
 */

import {
  checkBridgeKey,
  docsRoot,
  keyRevoked,
  loadChannel,
  num,
  plainFields,
  str,
} from "./song-ingest.js";

/** ป้ายหน่วยของ paid — ใบที่ไม่มีป้ายนี้คือบาท (โดเนท EasyDonate) ดู lib/song/types.ts */
const UNIT = "coin";

/** เพลงที่รอคิวของคนนี้ — เรียงแบบเดียวกับคิวจริง (sortKeyOf ใน lib/song/store.ts) */
async function loadQueuedOf(env, token, channelId, byUid) {
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
                    field: { fieldPath: "byUid" },
                    op: "EQUAL",
                    value: { stringValue: byUid },
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

  const key = (s) => s.orderKey || s.createdAt || "";
  return {
    songs: rows
      .filter((row) => row?.document?.fields)
      .map((row) => ({
        ...plainFields(row.document.fields),
        name: row.document.name,
        updateTime: row.document.updateTime,
      }))
      .sort((a, b) => key(a).localeCompare(key(b)) || a.name.localeCompare(b.name)),
  };
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

  /* ลองสองรอบ — รอบแรกพลาดเพราะใบเพิ่งเปลี่ยน (เพลงแรกของเขาเพิ่งเริ่มเล่นพอดี)
     อ่านใหม่แล้วยกเพลงถัดไปของเขาแทน */
  for (let round = 0; round < 2; round++) {
    const mine = await loadQueuedOf(env, token, channel.id, byUid);
    if (mine.error) return bad(mine.error, { min });

    // ใบที่ลัดคิวอยู่แล้ว (โดเนทหรือของขวัญรอบก่อน) ข้ามไป ยกเพลงถัดไปของเขาแทน
    const target = mine.songs.find((s) => !(num(s.paid) > 0));
    if (!target) return bad(mine.songs.length ? "already-skipped" : "no-song", { min });

    const done = await promote(token, target, coins);
    if (done.ok) {
      return reply(
        {
          ok: true,
          min,
          coins,
          id: target.name.split("/").pop(),
          title: target.title,
          videoId: target.videoId,
        },
        cors,
      );
    }
    if (!done.changed) return bad(`write-failed-${done.status}`, { min, title: target.title });
  }
  return bad("song-changed", { min });
}
