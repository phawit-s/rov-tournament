"use client";

/**
 * อ่านข้อมูลคลิป YouTube โดยไม่ต้องใช้ API key
 *
 * oEmbed ของ YouTube เปิด CORS ให้เรียกจากเบราว์เซอร์ตรงๆ และไม่ต้องมีคีย์
 * จึงใช้ได้กับเว็บ static ทันที ไม่ต้องผ่าน Worker เหมือนตอนตรวจสลิป
 *
 * ของที่ oEmbed ไม่มีให้คือ "ความยาวคลิป" ซึ่งต้องใช้ YouTube Data API
 * (มีโควตาและต้องมีคีย์) ระบบนี้จึงไม่พึ่งความยาว ถ้าอยากจำกัดความยาวเพลง
 * ต้องต่อ Data API ผ่าน Worker เพิ่มทีหลัง
 */

/** ไอดีคลิปเป็น 11 ตัวอักษรเสมอ */
const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * ดึงไอดีคลิปจากลิงก์ทุกแบบที่คนวางมาจริง
 * รองรับ watch / youtu.be / shorts / embed / live / music และลิงก์ที่มีพารามิเตอร์พ่วง
 * ถ้าผู้ใช้วางไอดีมาโดดๆ ก็รับ
 */
export function videoIdFrom(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (ID.test(text)) return text;

  let url: URL;
  try {
    url = new URL(text.startsWith("http") ? text : `https://${text}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    return ID.test(parts[0] ?? "") ? parts[0] : null;
  }

  if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
    const v = url.searchParams.get("v");
    if (v && ID.test(v)) return v;
    // /shorts/<id> · /embed/<id> · /live/<id> · /v/<id>
    if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) {
      return ID.test(parts[1] ?? "") ? parts[1] : null;
    }
  }

  return null;
}

/** ลิงก์มาตรฐานสำหรับเปิดดู เก็บอันนี้ไว้แทนลิงก์ดิบที่ผู้ใช้วางมา */
export const watchUrl = (videoId: string) =>
  `https://www.youtube.com/watch?v=${videoId}`;

/**
 * รูปปก — ใช้ img.youtube.com ไม่ต้องผ่าน API
 * hqdefault มีทุกคลิปเสมอ ส่วน maxresdefault บางคลิปไม่มีแล้วจะได้รูปเสีย
 */
export const thumbUrl = (videoId: string) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

export type YoutubeInfo = {
  videoId: string;
  title: string;
  author: string;
  thumb: string;
  url: string;
};

/**
 * ถามชื่อคลิปกับ YouTube
 *
 * คลิปที่ไม่มีจริง เป็นส่วนตัว หรือถูกลบ จะตอบ 400/404 กลับมา
 * เท่ากับได้ตรวจไปในตัวว่าลิงก์ใช้ได้จริงก่อนเข้าคิว
 * คืน null เมื่ออ่านไม่ได้ ไม่ throw เพื่อให้ฝั่ง UI จัดการง่าย
 */
export async function lookupVideo(videoId: string): Promise<YoutubeInfo | null> {
  if (!ID.test(videoId)) return null;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
        watchUrl(videoId),
      )}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    return {
      videoId,
      title: (data.title ?? "").slice(0, 140) || "ไม่ทราบชื่อเพลง",
      author: (data.author_name ?? "").slice(0, 80),
      thumb: thumbUrl(videoId),
      url: watchUrl(videoId),
    };
  } catch {
    return null;
  }
}
