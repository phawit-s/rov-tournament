import type { TeamIdentity } from "./types";

/**
 * สูตรของตราทีม เก็บไว้ที่เดียวเพื่อไม่ให้เวอร์ชัน SVG บนเว็บกับเวอร์ชัน canvas
 * ในรูป export เพี้ยนกัน — ไฟล์นี้ห้าม import React
 */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

/** ผสมกับสีขาว amt = 0..1 */
export function mixWhite(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  return toHex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt]);
}

/** amt ติดลบ = มืดลง, บวก = สว่างขึ้น */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt < 0) {
    const k = 1 + amt;
    return toHex([r * k, g * k, b * k]);
  }
  return mixWhite(hex, amt);
}

/** พิกัดหกเหลี่ยมบน viewBox ขนาด 64 */
export const CREST_POLY: [number, number][] = [
  [32, 8],
  [52, 20],
  [52, 44],
  [32, 56],
  [12, 44],
  [12, 20],
];

/** สามเหลี่ยมแสงสะท้อนมุมบน */
export const CREST_SPEC: [number, number][] = [
  [32, 8],
  [52, 20],
  [32, 32],
];

/** วาดตราทีมลง canvas โดยให้ลำดับชั้นตรงกับเวอร์ชัน SVG เป๊ะ */
export function drawCrest(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  identity: TeamIdentity,
): void {
  const k = (2 * r) / 64;
  const at = (p: [number, number]) => ({
    x: x - r + p[0] * k,
    y: y - r + p[1] * k,
  });

  ctx.save();

  // วงแหวนนอก
  ctx.beginPath();
  ctx.arc(x, y, r * (30 / 32), 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(${identity.rgb.split(" ").join(",")}, 0.45)`;
  ctx.lineWidth = Math.max(0.6, k);
  ctx.stroke();

  // ขีดบอกองศา — เล็กกว่า 32px แล้วจะกลายเป็นขอบเบลอ ไม่ต้องวาด
  if (2 * r >= 32) {
    ctx.strokeStyle = `rgba(${identity.rgb.split(" ").join(",")}, 0.3)`;
    ctx.lineWidth = Math.max(0.5, 0.8 * k);
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12 - Math.PI / 2;
      const r0 = r * (26 / 32);
      const r1 = r * ((i % 3 === 0 ? 30 : 29) / 32);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      ctx.stroke();
    }
  }

  // แกนในหกเหลี่ยม
  const top = at(CREST_POLY[0]);
  const bottom = at(CREST_POLY[3]);
  const grad = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y);
  grad.addColorStop(0, mixWhite(identity.hex, 0.35));
  grad.addColorStop(0.48, identity.hex);
  grad.addColorStop(1, shade(identity.hex, -0.4));

  ctx.beginPath();
  CREST_POLY.forEach((p, i) => {
    const q = at(p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // แสงสะท้อน
  ctx.beginPath();
  CREST_SPEC.forEach((p, i) => {
    const q = at(p);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
  ctx.fill();

  ctx.restore();
}
