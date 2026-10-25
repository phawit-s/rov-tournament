"use client";

/**
 * ค้นหาเพลงบน YouTube ผ่าน Worker ของเราเอง
 *
 * ทำไมต้องผ่าน Worker: การค้นหาต้องใช้ YouTube Data API ซึ่งต้องมีคีย์
 * เว็บนี้เป็นไฟล์ static ล้วน ถ้าฝังคีย์ไว้ในหน้าเว็บใครเปิด devtools ก็หยิบไปใช้
 * จนโควตาที่เจ้าของจ่ายหมดได้ คีย์จึงต้องอยู่ฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * เคยลองทางที่ไม่ต้องใช้คีย์แล้วสองทาง ใช้ไม่ได้ทั้งคู่
 *   - listType:'search' ของตัวเล่นฝัง YouTube ปิดไปแล้ว คืนค่าว่าง
 *   - endpoint คำแนะนำการค้นหาของ Google โดน CORS บล็อกจากเบราว์เซอร์
 * ต่างจากการดึงเพลย์ลิสต์ที่ยังยืมตัวเล่นฝังทำได้อยู่ (ดู lib/song/playlist.ts)
 */

export type SearchHit = {
  videoId: string;
  title: string;
  author: string;
  thumb: string | null;
};

export type SearchResult =
  | { ok: true; items: SearchHit[]; cached?: boolean }
  | { ok: false; reason: string; waitMs?: number };

/** อธิบายสาเหตุที่ค้นไม่ได้เป็นภาษาคน ไม่ใช่รหัสดิบจากเซิร์ฟเวอร์ */
function explain(reason: string, message?: string | null): string {
  if (reason === "no-youtube-key") {
    return "Worker ยังไม่มีคีย์ YouTube — ใส่ด้วย wrangler secret put YT_API_KEY";
  }
  if (reason === "rate-limited" || reason === "search-rate-limited") {
    return "ค้นถี่เกินไป รอสักนาทีแล้วลองใหม่ หรือวางลิงก์ YouTube แทนก็ได้";
  }
  /* โควตาค้นหาเป็นของทั้งระบบ (ทุกช่องใช้คีย์ YouTube ตัวเดียวกัน) ไม่ใช่ของช่องนี้ช่องเดียว
     หมดแล้ว Worker หยุดถาม YouTube จนข้ามวัน (worker/yt-quota.js) — วางลิงก์ยังใช้ได้ตลอด */
  if (reason === "daily-budget" || reason === "youtube-quota") {
    return "วันนี้ค้นเพลงด้วยชื่อครบโควตาแล้ว วางลิงก์ YouTube แทนได้เลย พรุ่งนี้ค้นได้ใหม่";
  }
  if (reason === "query-too-short") return "พิมพ์ชื่อเพลงให้ยาวกว่านี้อีกนิด";
  if (reason === "empty-query") return "พิมพ์คำค้นก่อน";
  if (reason === "youtube-error") {
    return message?.includes("quota")
      ? "โควตาค้นหาของวันนี้หมดแล้ว (ฟรีวันละ 100 ครั้ง) พรุ่งนี้ใช้ได้ใหม่"
      : `YouTube ปฏิเสธคำขอ${message ? ` — ${message}` : ""}`;
  }
  return "ค้นหาไม่สำเร็จ";
}

export async function searchSongs(
  endpoint: string,
  query: string,
): Promise<SearchResult> {
  const q = query.trim();
  if (!q) return { ok: true, items: [] };

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { ok: false, reason: "ลิงก์ตัวค้นหาไม่ถูกต้อง" };
  }
  url.searchParams.set("search", q);

  try {
    const res = await fetch(url.toString());
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; items?: SearchHit[]; reason?: string; message?: string }
      | null;

    if (!data) return { ok: false, reason: "Worker ตอบกลับมาไม่ใช่ข้อมูลที่อ่านได้" };
    if (!data.ok) {
      return { ok: false, reason: explain(data.reason ?? "", data.message) };
    }
    return { ok: true, items: data.items ?? [] };
  } catch {
    // เรียกไม่ถึงเลย — ส่วนใหญ่คือลิงก์ผิด หรือโดเมนนี้ไม่ได้อยู่ใน ALLOWED_ORIGIN
    return {
      ok: false,
      reason: "เรียก Worker ไม่ได้ — เช็กลิงก์ และเช็กว่าโดเมนนี้อยู่ใน ALLOWED_ORIGIN",
    };
  }
}

/* ---------------- คนดูค้นเพลงจากหน้าขอเพลง ----------------

   ค้นหนึ่งครั้ง = โควตา YouTube 100 หน่วย (ฟรีวันละ ~100 ครั้งต่อ Worker)
   หน้าขอเพลงเปิดให้ใครก็ได้ ถ้าไม่หน่วง คนในไลฟ์ที่กดค้นรัวๆ หรือพิมพ์ทีละตัวแล้วค้นทุกตัว
   จะเผาโควตาของสตรีมเมอร์หมดในไม่กี่นาที แล้วสตรีมเมอร์เองก็ค้นไม่ได้ทั้งคืน

   ตรงนี้คือด่านแรก (ลดการยิงจากคนปกติ + บอกเวลารอให้เห็น) ด่านจริงอยู่ใน Worker
   (แคชตามคำค้น · จำกัดต่อ IP · เพดานต่อวัน) เพราะหน้าเว็บโดนแก้หรือข้ามได้เสมอ */

export const VIEWER_SEARCH = {
  /** ตัวอักษรขั้นต่ำ — คำเดียวตัวเดียวได้ผลมั่วแต่กินโควตาเท่ากัน */
  minChars: 2,
  /** เว้นระหว่างการค้นที่ต้องถาม Worker จริง */
  cooldownMs: 8_000,
  /** ค้นจริงได้ไม่เกินกี่ครั้งในช่วงเวลานี้ (นับต่อเครื่อง รีเฟรชแล้วไม่หาย) */
  maxPerWindow: 5,
  windowMs: 5 * 60_000,
} as const;

const LOG_KEY = "kiew/search-log";

/** ผลที่ค้นไปแล้วในแท็บนี้ — ค้นคำเดิมซ้ำไม่ถาม Worker ไม่นับครั้ง ไม่ต้องรอ */
const memo = new Map<string, SearchHit[]>();

const normQuery = (q: string) => q.toLowerCase().replace(/\s+/g, " ").trim();

/** เวลาที่ค้นจริงในช่วงล่าสุด (เก่าสุดก่อน) */
function readLog(now: number): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LOG_KEY) ?? "[]");
    return Array.isArray(raw)
      ? raw.filter((t): t is number => typeof t === "number" && now - t < VIEWER_SEARCH.windowMs)
      : [];
  } catch {
    return [];
  }
}

function writeLog(log: number[]) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-VIEWER_SEARCH.maxPerWindow)));
  } catch {
    // โหมดส่วนตัวบางตัวเขียนไม่ได้ — ยังมีด่านฝั่ง Worker อยู่
  }
}

/** ต้องรออีกกี่มิลลิวินาทีก่อนค้นจริงได้ — 0 = ค้นได้เลย */
export function viewerSearchWait(now = Date.now()): number {
  const log = readLog(now);
  if (log.length === 0) return 0;
  let wait = Math.max(0, VIEWER_SEARCH.cooldownMs - (now - log[log.length - 1]));
  if (log.length >= VIEWER_SEARCH.maxPerWindow) {
    wait = Math.max(wait, log[0] + VIEWER_SEARCH.windowMs - now);
  }
  return wait;
}

/** คำนี้ค้นไปแล้วในแท็บนี้ไหม — ค้นซ้ำได้ทันทีไม่ต้องรอ */
export function viewerSearchCached(query: string): boolean {
  return memo.has(normQuery(query));
}

/**
 * ค้นจากหน้าขอเพลง — ผ่านด่านหน่วงเวลาก่อนถึงจะถาม Worker
 *
 * นับครั้ง "ก่อน" ยิง ไม่ใช่หลังได้ผล — คนที่กดซ้ำตอน Worker ช้าหรือล้ม
 * ต้องโดนนับด้วย ไม่งั้นเน็ตกระตุกทีเดียวก็ยิงรัวได้ไม่จำกัด
 */
export async function viewerSearch(endpoint: string, query: string): Promise<SearchResult> {
  const key = normQuery(query);
  if (key.length < VIEWER_SEARCH.minChars) {
    return { ok: false, reason: explain("query-too-short") };
  }
  const hit = memo.get(key);
  if (hit) return { ok: true, items: hit, cached: true };

  const now = Date.now();
  const wait = viewerSearchWait(now);
  if (wait > 0) {
    return { ok: false, reason: `ค้นได้อีกครั้งใน ${Math.ceil(wait / 1000)} วินาที`, waitMs: wait };
  }
  writeLog([...readLog(now), now]);

  const res = await searchSongs(endpoint, query);
  if (res.ok) {
    if (memo.size > 50) memo.delete(memo.keys().next().value as string);
    memo.set(key, res.items);
  }
  return res;
}
