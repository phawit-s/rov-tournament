/**
 * ตัวจับเวลาสดของช่อง — นาฬิกาถอยหลังที่ขึ้นบนสตรีม แล้วบวก/ลบเวลาได้ระหว่างไลฟ์
 *
 * แนวคิดสำคัญ: ไม่เขียนฐานข้อมูลทุกวินาที
 *
 * เก็บแค่ "เหลือกี่วินาทีตอนบันทึกครั้งล่าสุด" กับ "กดเดินตอนกี่โมง" แล้วให้ทุกจอ
 * คำนวณเวลาปัจจุบันเอาเองจากสองค่านี้ นาฬิกาบน widget กับบนคอนโซลจึงตรงกันเสมอ
 * โดยที่ระบบเขียนจริงเฉพาะตอนคนกดปุ่ม (เริ่ม/หยุด/บวก/ลบ) เท่านั้น
 *
 * ถ้าเขียนทุกวินาทีแทน: ไลฟ์ 4 ชั่วโมง = เขียน 14,400 ครั้ง ต่อหนึ่งช่อง
 * ซึ่งกินโควตาฟรีของ Firestore หมดภายในไลฟ์เดียว
 */

/** ช่องหนึ่งช่องบนวงล้อสุ่มเวลา */
export type WheelSlice = {
  id: string;
  /**
   * ป้ายบนวงล้อ — เว้นว่างได้ ถ้าว่างจะสร้างจากเวลาให้เอง ("+5 นาที")
   *
   * ของเดิมบังคับให้กรอกเอง ซึ่งแปลว่าป้ายกับเวลาจริงเป็นคนละค่าที่ไม่ผูกกันเลย
   * แก้เวลาแล้วลืมแก้ป้าย = วงล้อบนสตรีมหยุดที่ "+3 นาที" แต่นาฬิกาบวกให้ 1 นาที
   * ซึ่งคนดูจับได้ทันทีและแก้ตัวไม่ได้ — ตอนนี้ค่าเริ่มต้นคือผูกกันเสมอ
   * ใครอยากได้ข้อความของตัวเอง ("ไม่ได้ไม่เสีย") ก็ยังพิมพ์ทับได้เหมือนเดิม
   */
  label?: string;
  /** วินาทีที่จะบวกเข้านาฬิกา — ติดลบได้ (เก็บเป็นวินาทีเสมอ ไม่ว่ากรอกมาเป็นหน่วยไหน) */
  seconds: number;
  /**
   * หน่วยที่ใช้ "ตอนกรอก" — นาที (ค่าเริ่มต้น) หรือ ชั่วโมง
   *
   * เก็บไว้เพราะ 7200 วินาทีเขียนได้ทั้ง "120 นาที" และ "2 ชั่วโมง" ซึ่งคนละความหมาย
   * ในหัวคนตั้ง — ถ้าไม่จำไว้ ช่องที่ตั้งเป็นชั่วโมงจะเด้งกลับไปโชว์เป็นนาทีทุกครั้ง
   * ที่เปิดหน้า และป้ายบนวงล้อก็จะเขียนว่า "+120 นาที" แทนที่จะเป็น "+2 ชั่วโมง"
   */
  unit?: TimeUnit;
  /** น้ำหนัก 1–20 ยิ่งมากยิ่งกินพื้นที่วงล้อมากและออกบ่อยขึ้น */
  weight: number;
};

/** หน่วยเวลาที่ใช้กรอกในวงล้อ */
export type TimeUnit = "min" | "hr";

export const UNIT_SECONDS: Record<TimeUnit, number> = { min: 60, hr: 3600 };
export const UNIT_LABEL: Record<TimeUnit, string> = { min: "นาที", hr: "ชั่วโมง" };
/** ช่วงที่กรอกได้ต่อหน่วย — กันคนเผลอใส่ 500 ชั่วโมง */
export const UNIT_MAX: Record<TimeUnit, number> = { min: 180, hr: 24 };

/** แบบตัวเลข — คนละบุคลิกกันคนละแบบ */
export type TimerDigits = "sans" | "seven";

export const TIMER_DIGITS: { key: TimerDigits; label: string; hint: string }[] = [
  { key: "sans", label: "ตัวหนังสือ", hint: "ฟอนต์ของเว็บ เรียบ อ่านง่าย" },
  { key: "seven", label: "ดิจิทัล", hint: "เจ็ดขีดแบบนาฬิกา LED" },
];

/** ทรงของนาฬิกาบนสตรีม — คนละงาน คนละที่วางบนจอ */
export type TimerSkin = "card" | "plain" | "ring";

export const TIMER_SKINS: { key: TimerSkin; label: string; hint: string }[] = [
  { key: "card", label: "การ์ด", hint: "มีแผ่นรอง อ่านง่ายบนฉากสว่าง" },
  { key: "plain", label: "ตัวเลขล้วน", hint: "ไม่มีกล่อง ตัวเลขลอยบนภาพเกม" },
  { key: "ring", label: "วงแหวน", hint: "เห็นสัดส่วนเวลาที่เหลือด้วยตา" },
];

export type StreamTimer = {
  /** ปิดอยู่ = widget ไม่ขึ้นอะไรเลย */
  enabled: boolean;
  /** วินาทีที่เหลือ ณ ตอนบันทึกครั้งล่าสุด */
  remaining: number;
  /** ISO เวลาที่กดเดินล่าสุด — ไม่มีค่า = นาฬิกาหยุดอยู่ */
  startedAt?: string | null;
  /** ป้ายเหนือนาฬิกาบนสตรีม เช่น "พักเบรก" */
  label?: string;

  /*
    หน้าตาของ widget — เก็บไว้ที่ช่อง ไม่ใช่ในลิงก์

    ใส่ ?accent= ท้ายลิงก์ก็ยังได้เหมือนเดิม แต่การเก็บไว้ที่ช่องแปลว่าเปลี่ยนสี
    ทีเดียวแล้วทุก source ที่วางไว้ใน OBS เปลี่ยนตามพร้อมกัน ไม่ต้องไล่แก้ลิงก์
    ทีละอันแล้วรีเฟรชทีละ source — และช่องแต่ละช่องตั้งคนละสีได้
  */

  /** สีเน้น เลขฐานสิบหก 6 หลักไม่มี # — ไม่ใส่ = ใช้ค่าจากลิงก์/ธีม */
  accent?: string;
  /** ขนาดตัวเลขนาฬิกา 0.6–2.5 เท่าของมาตรฐาน */
  fontScale?: number;
  /** ขนาดวงล้อ 0.6–2 เท่า */
  wheelScale?: number;
  /** ทรงของนาฬิกาบนสตรีม */
  skin?: TimerSkin;
  /** แบบตัวเลข */
  digits?: TimerDigits;
  /** ความจางของขีดที่ดับบนตัวเลขดิจิทัล 0–0.3 (0 = ไม่โชว์โครงเลข 8) */
  ghost?: number;

  /**
   * เวลาเต็มของรอบนี้ — ใช้คิดสัดส่วนวงแหวนเท่านั้น
   *
   * ต้องเก็บแยกจาก remaining เพราะ "เหลือ 5 นาที" อย่างเดียวบอกไม่ได้ว่า
   * เหลือน้อยหรือเหลือเยอะ — ต้องรู้ว่าตั้งต้นมาจากเท่าไหร่ถึงจะวาดวงแหวนได้
   */
  total?: number;
  slices: WheelSlice[];
  /**
   * ผลหมุนล่าสุด — widget วงล้อบนสตรีมใช้ค่านี้เล่นแอนิเมชันหมุนตาม
   *
   * ต้องมี sliceId ด้วย ไม่ใช่แค่ผลลัพธ์ เพราะ widget ต้องรู้ว่าจะหมุนไป
   * "หยุดที่ช่องไหน" ไม่ใช่แค่รู้ว่าได้กี่วินาที (สองช่องอาจให้เวลาเท่ากันได้)
   *
   * at เป็นทั้งเวลาที่หมุนและตัวบอกว่า "นี่คือการหมุนครั้งใหม่" — widget เทียบ
   * ค่านี้กับของเดิมเพื่อรู้ว่าต้องเริ่มหมุนอีกรอบไหม
   */
  lastSpin?: {
    label: string;
    seconds: number;
    at: string;
    sliceId: string;
  } | null;
};

/** ความยาวแอนิเมชันหมุน (วินาที) — คอนโซลกับ widget ต้องใช้ค่าเดียวกันถึงจะหยุดพร้อมกัน */
export const SPIN_SECONDS = 5;

/** ชุดเริ่มต้นของวงล้อ — บวกเยอะกว่าลบ เพราะเวลาที่ยาวขึ้นสนุกกว่าสำหรับคนดู */
export const DEFAULT_SLICES: WheelSlice[] = [
  { id: "s1", seconds: 60, weight: 4 },
  { id: "s2", seconds: 180, weight: 3 },
  { id: "s3", seconds: 300, weight: 2 },
  { id: "s4", seconds: 600, weight: 1 },
  { id: "s5", seconds: -60, weight: 3 },
  { id: "s6", seconds: -180, weight: 2 },
  { id: "s7", label: "ไม่ได้ไม่เสีย", seconds: 0, weight: 2 },
];

export const DEFAULT_TIMER: StreamTimer = {
  enabled: false,
  remaining: 30 * 60,
  startedAt: null,
  label: "เหลืออีก",
  slices: DEFAULT_SLICES,
  lastSpin: null,
  fontScale: 1,
  wheelScale: 1,
  skin: "card",
  digits: "sans",
  ghost: 0.08,
  total: 30 * 60,
};

/** สีสำเร็จรูป — ชุดเดียวกับที่หน้าแจกลิงก์ widget ใช้ จะได้ไม่มีสองมาตรฐาน */
export const TIMER_ACCENTS = [
  "a99bff",
  "7c6cf5",
  "35d6e8",
  "34e3b0",
  "ff5b7a",
  "ffb454",
  "ffffff",
];

/** บีบค่าให้อยู่ในช่วงที่ยังอ่านออกบนสตรีม */
export function clampScale(v: number | undefined, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(max, Math.max(min, n));
}

/**
 * สีเน้นที่ widget ควรใช้ — ของช่องมาก่อน แล้วค่อยตกไปที่ ?accent= ในลิงก์
 *
 * เรียงแบบนี้เพราะค่าที่ช่องคือ "ตั้งใจตั้งไว้ตอนนี้" ส่วนในลิงก์คือค่าที่อาจ
 * ติดมากับลิงก์ที่คัดลอกไว้นานแล้ว — ของใหม่ควรชนะของเก่าเสมอ
 */
export function timerAccent(
  t: StreamTimer | null | undefined,
  fallback: string,
): string {
  const raw = t?.accent?.replace("#", "").trim();
  return raw && /^[0-9a-fA-F]{6}$/.test(raw) ? `#${raw}` : fallback;
}

/** จำนวนช่องสูงสุดบนวงล้อ — มากกว่านี้ป้ายบนวงล้อเล็กจนอ่านไม่ออกบนสตรีม */
export const SLICE_LIMIT = 12;

/** นาฬิกาเดินอยู่ไหม */
export function isRunning(t: StreamTimer | null | undefined): boolean {
  return !!t?.startedAt;
}

/**
 * เวลาที่เหลือจริง ณ เวลา nowMs (วินาที ไม่ติดลบ)
 *
 * เผื่อกรณีนาฬิกาเครื่องที่เปิด widget กับเครื่องที่กดปุ่มไม่ตรงกัน — ถ้าเวลาเริ่ม
 * อยู่ในอนาคต ให้ถือว่าเพิ่งเริ่ม ไม่ใช่คิดเวลาติดลบแล้วนาฬิกาเดินถอยหลังกลับ
 */
export function remainingAt(
  t: StreamTimer | null | undefined,
  nowMs: number,
): number {
  if (!t) return 0;
  /* nowMs <= 0 = ยังไม่รู้เวลาปัจจุบัน (เรนเดอร์ฝั่งเซิร์ฟเวอร์ / ก่อน hydrate)
     ตอบค่าที่บันทึกไว้ไปก่อน ดีกว่าเอา 0 ไปลบแล้วได้เวลาพุ่งเป็นหลักหมื่นชั่วโมง */
  if (nowMs <= 0) return Math.max(0, t.remaining);
  if (!t.startedAt) return Math.max(0, t.remaining);
  const started = Date.parse(t.startedAt);
  if (!Number.isFinite(started)) return Math.max(0, t.remaining);
  const elapsed = Math.max(0, (nowMs - started) / 1000);
  return Math.max(0, t.remaining - elapsed);
}

/** 3725 -> "1:02:05" · 125 -> "02:05" (นาฬิกาบนสตรีมต้องกว้างคงที่ ไม่กระตุก) */
export function clockText(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** ชื่อช่องที่เอาไปโชว์จริง — ป้ายที่พิมพ์เองมาก่อน ไม่มีก็สร้างจากเวลา */
export function sliceLabel(s: WheelSlice): string {
  const custom = s.label?.trim();
  return custom || deltaText(s.seconds, s.unit);
}

/**
 * 300 -> "+5 นาที" · 7200 (hr) -> "+2 ชั่วโมง" · -90 -> "−1:30" · 0 -> "ไม่ได้ไม่เสีย"
 *
 * เขียนด้วยหน่วยที่คนตั้งใช้กรอกเสมอ — คนที่ตั้ง "2 ชั่วโมง" ไม่ได้อยากเห็น
 * "+120 นาที" บนวงล้อ ถึงมันจะเป็นเวลาเท่ากันก็ตาม
 */
export function deltaText(seconds: number, unit: TimeUnit = "min"): string {
  if (seconds === 0) return "ไม่ได้ไม่เสีย";
  const sign = seconds > 0 ? "+" : "−";
  const abs = Math.abs(seconds);
  const per = UNIT_SECONDS[unit];
  if (abs % per === 0) return `${sign}${abs / per} ${UNIT_LABEL[unit]}`;
  // ลงตัวเป็นนาทีแต่ไม่ลงตัวเป็นชั่วโมง ก็ยังเขียนเป็นนาทีได้
  if (abs % 60 === 0) return `${sign}${abs / 60} นาที`;
  return `${sign}${clockText(abs)}`;
}
