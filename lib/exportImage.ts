"use client";

import { BRAND_MARK } from "./brand";
import { drawCrest } from "./crest";
import type { BuiltTeam, Member } from "./types";

const PAD = 64;
const GAP = 20;
/** ความสูงหัวการ์ดก่อนถึงรายชื่อคนแรก */
const CARD_HEAD = 100;
const ROW_H = 42;

const DISPLAY = "'Prompt', 'Segoe UI', sans-serif";
const BODY = "'IBM Plex Sans Thai', 'Segoe UI', sans-serif";

type Palette = {
  bg: string;
  text: string;
  muted: string;
  hair: string;
  hairSoft: string;
  cardBg: string;
  glow: string;
  goldLine: string;
  title: readonly [string, string, string];
  label: string;
  footer: string;
  /** 255 = ธีมมืด (เกรนเป็นแสง), 0 = ธีมสว่าง (เกรนเป็นเงา) */
  noise: number;
};

const PALETTES: Record<"dark" | "light", Palette> = {
  dark: {
    bg: "#07080f",
    text: "#ffffff",
    muted: "#8a8ea8",
    hair: "rgba(255,255,255,0.10)",
    hairSoft: "rgba(255,255,255,0.06)",
    cardBg: "rgba(255,255,255,0.028)",
    glow: "rgba(214,177,112,0.13)",
    goldLine: "rgba(230,200,148,0.45)",
    title: ["#b98f4e", "#cfc7ff", "#7c6cf5"] as const,
    label: "rgba(230,200,148,0.75)",
    footer: "rgba(155,160,179,0.7)",
    noise: 255,
  },
  light: {
    bg: "#f4f4fa",
    text: "#14141f",
    muted: "#5f6076",
    hair: "rgba(32,26,16,0.14)",
    hairSoft: "rgba(32,26,16,0.08)",
    cardBg: "rgba(255,255,255,0.75)",
    glow: "rgba(190,155,90,0.16)",
    goldLine: "rgba(138,106,44,0.5)",
    title: ["#3a2e9e", "#7c6cf5", "#5b4bd6"] as const,
    label: "rgba(138,106,44,0.9)",
    footer: "rgba(109,103,93,0.85)",
    noise: 0,
  },
};

function palette(): Palette {
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  return PALETTES[theme];
}

/** เรนเดอร์ผลการแบ่งทีมเป็น PNG โทนเดียวกับหน้าเว็บ ด้วย canvas ล้วน */
export async function exportTeamsPng(
  teams: BuiltTeam[],
  bench: Member[],
  seed: string,
  teamName: (index: number) => string,
): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    await document.fonts?.ready;
  } catch {
    /* ไม่มี font API ก็ใช้ฟอนต์ระบบไป */
  }

  // ทีมน้อยให้เป็นแนวตั้งขนาดสตอรี่ ลงมือถือแล้วเต็มจอพอดี ทีมเยอะค่อยกางเป็นแนวนอน
  const portrait = teams.length <= 3;
  const W = portrait ? 1080 : 1240;
  const cols = portrait
    ? 1
    : teams.length <= 2
      ? teams.length || 1
      : teams.length <= 6
        ? 3
        : 4;

  const cardW = Math.floor((W - PAD * 2 - GAP * (cols - 1)) / cols);
  const maxRows = teams.reduce((max, t) => Math.max(max, t.size), 0);
  const cardH = CARD_HEAD + maxRows * ROW_H;
  const rows = Math.ceil(teams.length / cols);
  const benchH = bench.length ? 104 : 0;
  const contentH = PAD + 150 + rows * (cardH + GAP) + benchH + 84;
  const H = Math.max(contentH, portrait ? 1350 : 0);

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";
  const c = palette();

  // พื้นหลัง
  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  const topGlow = ctx.createRadialGradient(W / 2, -60, 0, W / 2, -60, W * 0.75);
  topGlow.addColorStop(0, c.glow);
  topGlow.addColorStop(1, "rgba(214,177,112,0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, 460);

  // เส้นทองบนสุด
  hairline(ctx, 0, 0, W, c.goldLine);

  // หัวเรื่อง
  ctx.fillStyle = c.label;
  ctx.font = `600 13px ${DISPLAY}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(BRAND_MARK, PAD, PAD + 16);
  ctx.letterSpacing = "0px";

  const title = ctx.createLinearGradient(PAD, 0, PAD + 520, 0);
  title.addColorStop(0, c.title[0]);
  title.addColorStop(0.45, c.title[1]);
  title.addColorStop(1, c.title[2]);
  ctx.fillStyle = title;
  ctx.font = `300 46px ${DISPLAY}`;
  ctx.fillText("ผลการแบ่งทีม", PAD, PAD + 74);

  ctx.fillStyle = c.muted;
  ctx.font = `400 19px ${BODY}`;
  const stamp = new Date().toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  ctx.fillText(`${teams.length} ทีม · ${stamp} · seed ${seed}`, PAD, PAD + 108);

  hairline(ctx, PAD, PAD + 132, W - PAD, c.hair);

  // การ์ดทีม
  teams.forEach((team, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (cardW + GAP);
    const y = PAD + 150 + row * (cardH + GAP);
    drawTeamCard(ctx, team, teamName(team.index), x, y, cardW, cardH, c);
  });

  // ตัวสำรอง
  let bottomOfContent = PAD + 150 + rows * (cardH + GAP);
  if (bench.length) {
    const y = bottomOfContent;
    roundRect(ctx, PAD, y, W - PAD * 2, 80, 14);
    ctx.fillStyle = c.cardBg;
    ctx.fill();
    ctx.strokeStyle = c.hair;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = c.muted;
    ctx.font = `600 12px ${DISPLAY}`;
    ctx.letterSpacing = "4px";
    ctx.fillText("SUBSTITUTE", PAD + 24, y + 30);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = c.text;
    ctx.font = `400 19px ${BODY}`;
    ctx.fillText(bench.map((m) => m.player.name).join("   ·   "), PAD + 24, y + 60);
    bottomOfContent += benchH;
  }

  // ช่องว่างที่เหลือของภาพแนวตั้ง เติมด้วยวงแหวนจางแทนที่จะปล่อยโล่ง
  const spare = H - PAD - 40 - bottomOfContent;
  if (spare > 140) {
    drawRings(ctx, W / 2, bottomOfContent + spare / 2, Math.min(spare, 320) / 2, c);
  }

  hairline(ctx, PAD, H - PAD - 26, W - PAD, c.hairSoft);
  ctx.fillStyle = c.footer;
  ctx.font = `400 15px ${BODY}`;
  ctx.fillText(
    "ผลลัพธ์ล็อกไว้กับ seed — ใส่ค่าเดิมกับรายชื่อเดิมจะได้ผลเดิมเสมอ",
    PAD,
    H - PAD + 4,
  );

  // เกรนบางๆ ชั้นเดียว ให้ภาพไม่แบนเหมือนภาพเวกเตอร์
  drawNoise(ctx, W, H, c);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `teams-${seed || "result"}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function drawTeamCard(
  ctx: CanvasRenderingContext2D,
  team: BuiltTeam,
  customName: string,
  x: number,
  y: number,
  w: number,
  h: number,
  c: Palette,
) {
  const { identity } = team;
  const rgb = identity.rgb.split(" ").join(",");

  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = c.cardBg;
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb},0.32)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // แถบสีประจำทีมหนา 4px คาดหัวการ์ด ตัดตามมุมโค้งของการ์ด
  ctx.save();
  roundRect(ctx, x, y, w, h, 16);
  ctx.clip();
  const cap = ctx.createLinearGradient(x, 0, x + w, 0);
  cap.addColorStop(0, `rgba(${rgb},0)`);
  cap.addColorStop(0.35, `rgba(${rgb},0.9)`);
  cap.addColorStop(1, `rgba(${rgb},0.25)`);
  ctx.fillStyle = cap;
  ctx.fillRect(x, y, w, 4);
  ctx.restore();

  // ตราทีม — สูตรเดียวกับ Crest บนเว็บ ไม่ใช่อีโมจิที่เรนเดอร์ไม่เท่ากันทุกเครื่อง
  drawCrest(ctx, x + 40, y + 42, 18, identity);

  ctx.fillStyle = identity.hex;
  ctx.font = `500 22px ${DISPLAY}`;
  ctx.fillText(fit(ctx, customName || identity.name, w - 92), x + 66, y + 42);

  ctx.fillStyle = c.muted;
  ctx.font = `500 13px ${DISPLAY}`;
  ctx.letterSpacing = "3px";
  ctx.fillText(`TEAM ${String(team.index + 1).padStart(2, "0")}`, x + 66, y + 66);
  ctx.letterSpacing = "0px";

  ctx.fillStyle = `rgba(${rgb},0.85)`;
  ctx.font = `400 13px ${DISPLAY}`;
  const cnt = `${team.members.length}/${team.size}`;
  ctx.fillText(cnt, x + w - 22 - ctx.measureText(cnt).width, y + 42);

  // ล็อกคอลัมน์เลนให้ตรงกันทุกแถว ไม่ปล่อยให้ชิดขวาแล้วเยื้องกันไปมา
  ctx.font = `400 15px ${BODY}`;
  const laneW = team.members.reduce(
    (max, m) => (m.lane ? Math.max(max, ctx.measureText(m.lane).width) : max),
    0,
  );
  const laneX = laneW ? x + w - 22 - laneW : x + w - 22;
  const nameMax = laneX - (x + 52) - 16;

  team.members.forEach((member, index) => {
    const my = y + CARD_HEAD + index * ROW_H - 4;

    ctx.fillStyle = c.muted;
    ctx.font = `400 13px ${DISPLAY}`;
    ctx.fillText(String(index + 1).padStart(2, "0"), x + 22, my);

    ctx.fillStyle = c.text;
    ctx.font = `400 19px ${BODY}`;
    ctx.fillText(fit(ctx, member.player.name, nameMax), x + 52, my);

    if (member.lane) {
      ctx.fillStyle = `rgba(${rgb},0.9)`;
      ctx.font = `400 15px ${BODY}`;
      ctx.fillText(member.lane, laneX, my);
    }

    if (index < team.members.length - 1) {
      hairline(ctx, x + 22, my + 14, x + w - 22, c.hairSoft);
    }
  });
}

/** วงแหวนซ้อนจางๆ ใช้เติมช่องว่างของภาพแนวตั้ง */
function drawRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  c: Palette,
) {
  ctx.save();
  ctx.strokeStyle = c.goldLine;
  ctx.globalAlpha = 0.18;
  [1, 0.72, 0.44].forEach((k, i) => {
    ctx.lineWidth = i === 0 ? 1.4 : 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r * k, 0, Math.PI * 2);
    ctx.stroke();
  });
  // ขีดบอกองศาแบบเดียวกับตราทีม
  ctx.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    const a = (Math.PI * 2 * i) / 24;
    const r1 = r * (i % 3 === 0 ? 1.06 : 1.03);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}

/** เกรนหนึ่งชั้น globalAlpha ต่ำ ไม่ให้กินเวลาเรนเดอร์ */
function drawNoise(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  c: Palette,
) {
  const tile = document.createElement("canvas");
  tile.width = 64;
  tile.height = 64;
  const tctx = tile.getContext("2d");
  if (!tctx) return;
  const img = tctx.createImageData(64, 64);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);

  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.globalCompositeOperation = c.noise ? "lighter" : "multiply";
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function hairline(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y: number,
  x2: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y + 0.5);
  ctx.lineTo(x2, y + 0.5);
  ctx.stroke();
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
