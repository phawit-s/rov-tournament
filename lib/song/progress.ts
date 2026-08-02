/**
 * คิดความคืบหน้าของเพลงที่กำลังเล่น จากเวลาที่กดเล่นกับความยาวคลิป
 *
 * widget ไม่ได้เป็นคนเล่นเพลง จึงไม่รู้ตำแหน่งปัจจุบันจากตัวเล่นโดยตรง
 * แต่พอรู้ว่า "กดเล่นตอนกี่โมง" กับ "คลิปยาวเท่าไหร่" ก็คำนวณเองได้
 * — วิธีนี้ไม่ต้องให้ตัวเล่นส่งเวลามาทุกวินาที ซึ่งจะเปลืองทั้งเน็ตและโควตาเขียน
 *
 * ข้อจำกัดที่ยอมรับ: ถ้าสตรีมเมอร์กดหยุดกลางเพลง แถบจะเดินต่อไปเรื่อยๆ
 * แล้วไปค้างที่ปลายทาง เพราะ widget ไม่รู้ว่ามีการหยุด
 * แลกกับการไม่ต้องเขียนฐานข้อมูลทุกครั้งที่กดหยุด/เล่นต่อ
 */

export type PlaybackProgress = {
  /** วินาทีที่ผ่านไป ไม่เกินความยาวคลิป */
  elapsed: number;
  /** ความยาวคลิปเป็นวินาที */
  duration: number;
  /** สัดส่วน 0-1 สำหรับวาดแถบ */
  ratio: number;
  /**
   * ค่า animation-delay (ติดลบ) ที่ทำให้แอนิเมชัน CSS เริ่มกลางทางพอดี
   *
   * ใช้คู่กับ keyframes ที่วิ่ง scaleX จาก 0 ถึง 1 ยาวเท่าความยาวคลิป
   * เบราว์เซอร์จะเดินแถบต่อเองบน compositor ไม่ต้องมี JS ขยับทีละเฟรม
   */
  delay: string;
};

/** เวลาเป็นวินาที -> "3:17" (เกินชั่วโมงก็เป็น "1:02:33") */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

/**
 * คืน null เมื่อคำนวณไม่ได้ — ยังไม่มีความยาวคลิป (ตัวเล่นยังไม่ได้บอก
 * หรือเป็นใบเก่าก่อนมีฟิลด์นี้) หรือเวลาที่กดเล่นเสียรูป
 * ฝั่ง UI เอาไปตัดสินใจว่าจะซ่อนแถบเวลาไปเลย ดีกว่าโชว์ 0:00 ค้าง
 */
export function playbackProgress(
  song: { playedAt?: string | null; duration?: number },
  nowMs: number,
): PlaybackProgress | null {
  const duration = song.duration ?? 0;
  if (!(duration > 0)) return null;

  const startedAt = song.playedAt ? Date.parse(song.playedAt) : NaN;
  if (!Number.isFinite(startedAt)) return null;

  /* นาฬิกาเครื่องที่เปิด widget กับเครื่องที่เล่นเพลงอาจไม่ตรงกันเป๊ะ
     ถ้าเวลาเริ่มอยู่ในอนาคต ให้ถือว่าเพิ่งเริ่ม ไม่ใช่ติดลบจนแถบล้นไปทางซ้าย */
  const raw = (nowMs - startedAt) / 1000;
  const elapsed = Math.min(duration, Math.max(0, raw));

  return {
    elapsed,
    duration,
    ratio: elapsed / duration,
    // ปัดทศนิยมทิ้ง ค่าจะได้ไม่เปลี่ยนทุกครั้งที่รีเรนเดอร์จนแอนิเมชันเริ่มใหม่
    delay: `-${Math.round(elapsed)}s`,
  };
}
