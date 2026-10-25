/**
 * ด่านโควตาค้นหา YouTube — ใช้ร่วมกันทุกทางที่ค้นเพลงด้วยชื่อ
 *
 *   ?search=      หน้าขอเพลงของคนดู + ช่องค้นหาในตัวเล่นของสตรีมเมอร์ (slip-verify.js)
 *   ?ingest=1     "!เพลง ชื่อเพลง" จากแชท TikTok ทุกช่อง (song-ingest.js)
 *
 * ทุกช่องในระบบใช้คีย์ YouTube ตัวเดียวกัน โควตาฟรีวันละ 10,000 หน่วย ค้นครั้งละ 100
 * = ราว 100 ครั้งต่อวันรวมทั้งระบบ ★ หมดแล้วต้องหยุดถาม YouTube จริงๆ ไม่ใช่ยิงต่อแล้วรอโดนปฏิเสธ ★
 * (เจ้าของสั่งไว้ ต.ค. 2569) วางลิงก์ยังใช้ได้ตลอด เพราะอ่านชื่อคลิปผ่าน oEmbed ไม่กินโควตา
 *
 * หยุดได้สองทาง
 *   1. ถึงเพดานที่ตั้งเอง (SEARCH_DAILY_BUDGET) — ตั้งต่ำกว่าโควตาจริงไว้เผื่อ
 *   2. YouTube ตอบว่าโควตาหมด (quotaExceeded) — จำไว้ทั้งวัน ไม่ถามซ้ำอีก
 *      ต่อให้เพดานข้อ 1 นับขาด (หลายเครื่องยิงพร้อมกัน) ก็ไม่เกินนี้
 *
 * นับข้ามเครื่องได้เมื่อผูก KV ชื่อ SONG_CACHE (ดู wrangler.toml)
 * ไม่ผูก = นับในหน่วยความจำของแต่ละ instance — ยังหยุดเมื่อ YouTube บอกว่าหมด
 * แต่แต่ละ instance อาจถามอีกหนึ่งครั้งก่อนรู้ตัว และเพดานข้อ 1 นับแยกเครื่อง
 */

/**
 * วันตามเวลาแปซิฟิก — โควตา YouTube รีเซ็ตเที่ยงคืนเวลานั้น
 * ใช้ UTC-8 ตายตัว ช่วงเวลาออมแสงคลาดไปหนึ่งชั่วโมง ยอมรับได้
 */
export const quotaDay = () => new Date(Date.now() - 8 * 3600 * 1000).toISOString().slice(0, 10);

/** สถานะในหน่วยความจำของ instance นี้ — ล้างเองเมื่อข้ามวัน */
const memo = { day: "", exhausted: false, used: 0 };

function today() {
  const day = quotaDay();
  if (memo.day !== day) {
    memo.day = day;
    memo.exhausted = false;
    memo.used = 0;
  }
  return day;
}

/**
 * ค้นได้ไหมตอนนี้ — null = ได้ · "youtube-quota" = YouTube บอกว่าหมดแล้ววันนี้
 * · "daily-budget" = ถึงเพดานที่ตั้งไว้
 * เรียกก่อนถาม YouTube ทุกครั้ง (คำที่อยู่ในแคชไม่ต้องเรียก เพราะไม่ได้ใช้โควตา)
 */
export async function searchBlock(env) {
  const day = today();
  if (memo.exhausted) return "youtube-quota";
  const budget = Number(env.SEARCH_DAILY_BUDGET || 0);

  if (env.SONG_CACHE) {
    try {
      const [flag, used] = await Promise.all([
        env.SONG_CACHE.get(`yt-exhausted:${day}`),
        env.SONG_CACHE.get(`search-count:${day}`),
      ]);
      if (flag) {
        memo.exhausted = true;
        return "youtube-quota";
      }
      if (budget && Number(used || 0) >= budget) return "daily-budget";
      return null;
    } catch {
      // KV ล่ม — ใช้ตัวนับในหน่วยความจำต่อ ไม่ปล่อยผ่านแบบไม่นับเลย
    }
  }

  if (budget && memo.used >= budget) return "daily-budget";
  return null;
}

/** นับหนึ่งครั้งหลังถาม YouTube สำเร็จ · KV ไม่ใช่ตัวนับแม่น (ยิงพร้อมกันอาจนับขาด) จึงมีข้อ 2 กันอีกชั้น */
export async function noteSearch(env) {
  const day = today();
  memo.used += 1;
  if (!env.SONG_CACHE) return;
  try {
    const key = `search-count:${day}`;
    const used = Number((await env.SONG_CACHE.get(key)) || 0);
    await env.SONG_CACHE.put(key, String(used + 1), { expirationTtl: 2 * 86400 });
  } catch {
    // นับไม่ได้ก็ไม่ทำให้ผลค้นที่ได้มาแล้วหาย
  }
}

/** YouTube ตอบว่าโควตาหมด — จำไว้ทั้งวัน ทุก instance (ผ่าน KV) จะหยุดถามตาม */
export async function noteExhausted(env) {
  const day = today();
  memo.exhausted = true;
  if (!env.SONG_CACHE) return;
  try {
    await env.SONG_CACHE.put(`yt-exhausted:${day}`, "1", { expirationTtl: 2 * 86400 });
  } catch {
    // จำข้ามเครื่องไม่ได้ อย่างน้อย instance นี้หยุดแล้ว
  }
}

/**
 * คำตอบนี้คือ "โควตารายวันหมด" ไหม
 * นับเฉพาะเหตุที่เป็นรายวัน (quotaExceeded / dailyLimitExceeded)
 * rateLimitExceeded เป็นการยิงถี่ชั่วคราว ไม่ใช่โควตาหมด — ไม่หยุดทั้งวันเพราะมัน
 */
export function isQuotaError(status, data) {
  if (status !== 403) return false;
  const reasons = (data?.error?.errors ?? []).map((e) => String(e?.reason ?? ""));
  if (reasons.some((r) => r === "quotaExceeded" || r === "dailyLimitExceeded")) return true;
  return /quota/i.test(String(data?.error?.message ?? "")) && !reasons.includes("rateLimitExceeded");
}
