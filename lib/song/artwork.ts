"use client";

/**
 * ดูดสีเด่นจากรูปปกเพลง เอาไปย้อมการ์ดให้กลมกลืนกับรูป
 *
 * ทำได้เพราะ i.ytimg.com ส่งหัว CORS มาให้ (ทดสอบแล้ว) แคนวาสจึงไม่โดนย้อมพิษ
 * และอ่านพิกเซลได้ — ถ้าวันหนึ่ง YouTube เลิกส่งหัวนั้น getImageData จะโยน
 * SecurityError ซึ่งเราจับไว้แล้วคืนสีสำรองแทน ไม่ทำให้ widget พัง
 *
 * ทำงานครั้งเดียวตอนเปลี่ยนเพลง ไม่ใช่ทุกเฟรม จึงไม่กระทบซีพียูตอนไลฟ์
 */

/** ชุดสีที่ได้จากรูปหนึ่งใบ */
export type ArtPalette = {
  /** พื้นการ์ดชื่อเพลง */
  base: string;
  /** พื้นแถบเวลา เข้มกว่า base นิดเดียวให้เห็นเป็นคนละชั้น */
  soft: string;
  /** สีตัวหนังสือรอง กับสีแถบความคืบหน้า */
  tint: string;
  /** แสงฟุ้งหลังรูปปก */
  glow: string;
};

/** ใช้ตอนยังโหลดรูปไม่เสร็จ หรือดูดสีไม่ได้ — โทนกลางที่เข้ากับทุกฉาก */
export const NEUTRAL_PALETTE: ArtPalette = {
  base: "hsl(226 14% 22%)",
  soft: "hsl(226 16% 17%)",
  tint: "hsl(226 30% 78%)",
  glow: "hsl(226 40% 45%)",
};

/** จำนวนช่องฮิสโทแกรมของสี — 24 ช่อง = ช่องละ 15 องศา ละเอียดพอแยกโทนได้ */
const HUE_BUCKETS = 24;

/** RGB 0-255 -> HSL โดย h เป็น 0-360 ส่วน s/l เป็น 0-1 */
function toHsl(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
  else if (max === gg) h = ((bb - rr) / d + 2) * 60;
  else h = ((rr - gg) / d + 4) * 60;
  return [h, s, l];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * เลือกสีเด่นจากพิกเซลดิบ (RGBA เรียงติดกันแบบที่ getImageData คืนมา)
 *
 * ไม่ใช้ค่าเฉลี่ยตรงๆ เพราะเฉลี่ยทั้งรูปมักได้สีเทาขุ่นเสมอ — สีตรงข้ามกันหักล้างกันเอง
 * จึงแบ่งพิกเซลตามเฉดสีเป็นช่องๆ แล้วเลือกช่องที่ "มีน้ำหนักสีมากที่สุด"
 * โดยถ่วงน้ำหนักด้วยความสด พิกเซลจืดจึงไม่กลบพิกเซลที่เป็นสีจริงของรูป
 *
 * ตัดพิกเซลที่มืดจัด/สว่างจัดทิ้งก่อน เพราะขอบดำของคลิปกับตัวหนังสือขาวบนปก
 * ไม่ใช่สีของเพลง แต่มีเยอะพอจะดึงผลลัพธ์ไปทั้งใบ
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพื่อทดสอบได้โดยไม่ต้องมีเบราว์เซอร์
 */
export function pickArtPalette(pixels: ArrayLike<number>): ArtPalette {
  const satSum = new Float64Array(HUE_BUCKETS);
  const lumSum = new Float64Array(HUE_BUCKETS);
  const count = new Float64Array(HUE_BUCKETS);

  let lumTotal = 0;
  let lumCount = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // โปร่งใส ไม่นับ
    const [h, s, l] = toHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    lumTotal += l;
    lumCount++;
    if (l < 0.12 || l > 0.9 || s < 0.12) continue;

    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor((h / 360) * HUE_BUCKETS));
    satSum[bucket] += s;
    lumSum[bucket] += l;
    count[bucket]++;
  }

  /*
    ให้คะแนนแต่ละเฉด แล้วเลือกเฉดที่ได้คะแนนสูงสุด

    ลดทอนน้ำหนักของ "พื้นที่" ด้วยเลขยกกำลัง 0.65 แล้วเพิ่มน้ำหนักของ
    "ความสด" ด้วยกำลัง 1.6 — เพราะสีที่คนจำได้จากปกเพลงคือสีที่สดที่สุด
    ไม่ใช่สีที่กินพื้นที่มากที่สุด ปกที่พื้นหลังเป็นน้ำเงินหม่นกว้างๆ
    แต่มีชุดแดงสดอยู่กลางภาพ ควรได้การ์ดสีแดง ไม่ใช่น้ำเงินหม่น
    (ถ้าชั่งด้วยพื้นที่ล้วน ปกเกือบทุกใบจะได้การ์ดสีหม่นเหมือนกันหมด)
  */
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < HUE_BUCKETS; i++) {
    if (count[i] === 0) continue;
    const avgSat = satSum[i] / count[i];
    const avgLum = lumSum[i] / count[i];
    const score =
      Math.pow(count[i], 0.65) *
      Math.pow(avgSat, 1.6) *
      // โทนมืดจัด/สว่างจัดตาคนไม่ได้อ่านว่าเป็นสีของรูป
      (1 - Math.abs(avgLum - 0.5) * 0.8);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  // รูปขาวดำล้วน (หรือว่างเปล่า) ไม่มีเฉดให้เลือก ใช้โทนกลางแทน
  // แต่ยังปรับความสว่างตามรูปได้ ปกมืดกับปกสว่างจะได้ไม่เหมือนกันเป๊ะ
  if (best < 0) {
    if (lumCount === 0) return NEUTRAL_PALETTE;
    const l = lumTotal / lumCount;
    const lift = clamp(0.16 + l * 0.14, 0.16, 0.3);
    return {
      base: `hsl(226 10% ${(lift * 100).toFixed(1)}%)`,
      soft: `hsl(226 12% ${((lift - 0.05) * 100).toFixed(1)}%)`,
      tint: "hsl(226 18% 80%)",
      glow: `hsl(226 20% ${((lift + 0.2) * 100).toFixed(1)}%)`,
    };
  }

  const hue = ((best + 0.5) / HUE_BUCKETS) * 360;
  const sat = satSum[best] / count[best];
  const lum = lumSum[best] / count[best];

  /*
    ตรึงความสว่างของพื้นการ์ดไว้ในช่วงแคบๆ แทนที่จะใช้ค่าจากรูปตรงๆ
    เพราะ widget ต้องอ่านออกทับภาพเกมได้เสมอ ปกสีเหลืองสดจะได้ไม่กลายเป็น
    การ์ดสว่างจนตัวหนังสือขาวหาย ส่วนปกมืดก็ไม่จมหายไปกับฉาก
    ยังเก็บ "รสชาติ" ของรูปไว้ผ่านเฉดสีกับความสดที่ขยับได้เล็กน้อย
  */
  const s = clamp(sat * 1.15, 0.3, 0.56);
  const baseL = clamp(0.24 + lum * 0.1, 0.24, 0.31);

  const h = hue.toFixed(0);
  const sp = (s * 100).toFixed(0);
  return {
    base: `hsl(${h} ${sp}% ${(baseL * 100).toFixed(1)}%)`,
    soft: `hsl(${h} ${(s * 105).toFixed(0)}% ${((baseL - 0.06) * 100).toFixed(1)}%)`,
    tint: `hsl(${h} ${clamp(sat * 1.3, 0.35, 0.8) * 100}% 80%)`,
    glow: `hsl(${h} ${clamp(sat * 1.2, 0.4, 0.85) * 100}% 52%)`,
  };
}

/** ขนาดที่ย่อรูปลงมาก่อนอ่านพิกเซล — เล็กพอให้เร็ว ใหญ่พอให้สีไม่เพี้ยน */
const SAMPLE_W = 32;
const SAMPLE_H = 32;

/**
 * โหลดรูปแล้วดูดสีออกมา คืนสีสำรองถ้าทำไม่ได้ (ไม่เคย reject)
 * ยกเลิกกลางคันได้ผ่าน signal เผื่อเพลงเปลี่ยนก่อนรูปเก่าจะโหลดเสร็จ
 */
export function loadArtPalette(src: string, signal?: AbortSignal): Promise<ArtPalette> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(NEUTRAL_PALETTE);
      return;
    }

    const img = new Image();
    // ต้องตั้งก่อน src เสมอ ไม่งั้นเบราว์เซอร์เริ่มโหลดแบบไม่มี CORS ไปแล้ว
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";

    let done = false;
    const finish = (p: ArtPalette) => {
      if (done) return;
      done = true;
      img.onload = null;
      img.onerror = null;
      resolve(p);
    };

    signal?.addEventListener("abort", () => finish(NEUTRAL_PALETTE), { once: true });

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_W;
        canvas.height = SAMPLE_H;
        const ctx = canvas.getContext("2d", { willReadFrequently: false });
        if (!ctx) {
          finish(NEUTRAL_PALETTE);
          return;
        }
        ctx.drawImage(img, 0, 0, SAMPLE_W, SAMPLE_H);
        finish(pickArtPalette(ctx.getImageData(0, 0, SAMPLE_W, SAMPLE_H).data));
      } catch {
        // แคนวาสโดนย้อมพิษ (ไม่มีหัว CORS) — อ่านไม่ได้ก็ใช้สีสำรอง
        finish(NEUTRAL_PALETTE);
      }
    };
    img.onerror = () => finish(NEUTRAL_PALETTE);
    img.src = src;
  });
}
