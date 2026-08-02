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
  | { ok: true; items: SearchHit[] }
  | { ok: false; reason: string };

/** อธิบายสาเหตุที่ค้นไม่ได้เป็นภาษาคน ไม่ใช่รหัสดิบจากเซิร์ฟเวอร์ */
function explain(reason: string, message?: string | null): string {
  if (reason === "no-youtube-key") {
    return "Worker ยังไม่มีคีย์ YouTube — ใส่ด้วย wrangler secret put YT_API_KEY";
  }
  if (reason === "rate-limited") return "ค้นถี่เกินไป รอสักครู่แล้วลองใหม่";
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
