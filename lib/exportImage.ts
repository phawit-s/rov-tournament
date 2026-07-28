"use client";

import type { BuiltTeam, Member } from "./types";

const W = 1240;
const PAD = 64;
const GAP = 20;

const DISPLAY = "'Prompt', 'Segoe UI', sans-serif";
const BODY = "'IBM Plex Sans Thai', 'Segoe UI', sans-serif";

const PALETTES = {
  dark: {
    bg: "#0a0a0e",
    text: "#ffffff",
    muted: "#9ba0b3",
    hair: "rgba(255,255,255,0.10)",
    hairSoft: "rgba(255,255,255,0.06)",
    cardBg: "rgba(255,255,255,0.028)",
    glow: "rgba(214,177,112,0.13)",
    goldLine: "rgba(230,200,148,0.45)",
    title: ["#b98f4e", "#f2dcb0", "#cfa765"] as const,
    label: "rgba(230,200,148,0.75)",
    footer: "rgba(155,160,179,0.7)",
  },
  light: {
    bg: "#f4f1ea",
    text: "#1b1915",
    muted: "#6d675d",
    hair: "rgba(32,26,16,0.14)",
    hairSoft: "rgba(32,26,16,0.08)",
    cardBg: "rgba(255,255,255,0.75)",
    glow: "rgba(190,155,90,0.16)",
    goldLine: "rgba(138,106,44,0.5)",
    title: ["#6c521f", "#b18e42", "#8a6a2c"] as const,
    label: "rgba(138,106,44,0.9)",
    footer: "rgba(109,103,93,0.85)",
  },
};

function palette() {
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

  const cols = teams.length <= 2 ? teams.length || 1 : teams.length <= 6 ? 3 : 4;
  const cardW = Math.floor((W - PAD * 2 - GAP * (cols - 1)) / cols);
  const maxRows = teams.reduce((max, t) => Math.max(max, t.size), 0);
  const cardH = 92 + maxRows * 42;
  const rows = Math.ceil(teams.length / cols);
  const benchH = bench.length ? 104 : 0;
  const H = PAD + 150 + rows * (cardH + GAP) + benchH + 84;

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
  ctx.font = `500 13px ${DISPLAY}`;
  ctx.letterSpacing = "6px";
  ctx.fillText("ROV TEAM RANDOMIZER", PAD, PAD + 16);
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
  ctx.fillText(
    `${teams.length} ทีม · ${stamp} · seed ${seed}`,
    PAD,
    PAD + 108,
  );

  hairline(ctx, PAD, PAD + 132, W - PAD, c.hair);

  // การ์ดทีม
  teams.forEach((team, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (cardW + GAP);
    const y = PAD + 150 + row * (cardH + GAP);
    drawTeamCard(ctx, team, teamName(team.index), x, y, cardW, cardH);
  });

  // ตัวสำรอง
  if (bench.length) {
    const y = PAD + 150 + rows * (cardH + GAP);
    roundRect(ctx, PAD, y, W - PAD * 2, 80, 14);
    ctx.fillStyle = c.cardBg;
    ctx.fill();
    ctx.strokeStyle = c.hair;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = c.muted;
    ctx.font = `500 12px ${DISPLAY}`;
    ctx.letterSpacing = "4px";
    ctx.fillText("SUBSTITUTE", PAD + 24, y + 30);
    ctx.letterSpacing = "0px";

    ctx.fillStyle = c.text;
    ctx.font = `400 19px ${BODY}`;
    ctx.fillText(bench.map((m) => m.player.name).join("   ·   "), PAD + 24, y + 60);
  }

  hairline(ctx, PAD, H - PAD - 26, W - PAD, c.hairSoft);
  ctx.fillStyle = c.footer;
  ctx.font = `400 15px ${BODY}`;
  ctx.fillText(
    "ผลลัพธ์ล็อกไว้กับ seed — ใส่ค่าเดิมกับรายชื่อเดิมจะได้ผลเดิมเสมอ",
    PAD,
    H - PAD + 4,
  );

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rov-teams-${seed || "result"}.png`;
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
) {
  const { identity } = team;
  const rgb = identity.rgb.split(" ").join(",");
  const c = palette();

  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = c.cardBg;
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb},0.32)`;
  ctx.lineWidth = 1;
  ctx.stroke();

  // เส้นทองบางบนหัวการ์ด
  const cap = ctx.createLinearGradient(x + w * 0.15, 0, x + w * 0.85, 0);
  cap.addColorStop(0, "rgba(255,255,255,0)");
  cap.addColorStop(0.5, `rgba(${rgb},0.7)`);
  cap.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = cap;
  ctx.fillRect(x + 1, y, w - 2, 1);

  ctx.fillStyle = identity.hex;
  ctx.font = `500 15px ${DISPLAY}`;
  ctx.fillText(identity.glyph, x + 22, y + 40);
  ctx.font = `500 22px ${DISPLAY}`;
  ctx.fillText(customName || identity.name, x + 44, y + 40);

  ctx.fillStyle = c.muted;
  ctx.font = `400 13px ${DISPLAY}`;
  ctx.letterSpacing = "3px";
  ctx.fillText(`TEAM ${team.index + 1}`, x + 22, y + 62);
  ctx.letterSpacing = "0px";

  team.members.forEach((member, index) => {
    const my = y + 96 + index * 42;

    ctx.fillStyle = c.muted;
    ctx.font = `400 13px ${DISPLAY}`;
    ctx.fillText(String(index + 1).padStart(2, "0"), x + 22, my);

    ctx.fillStyle = c.text;
    ctx.font = `400 19px ${BODY}`;
    ctx.fillText(fit(ctx, member.player.name, w - 130), x + 52, my);

    if (member.lane) {
      ctx.fillStyle = `rgba(${rgb},0.9)`;
      ctx.font = `400 15px ${BODY}`;
      const lw = ctx.measureText(member.lane).width;
      ctx.fillText(member.lane, x + w - 22 - lw, my);
    }

    if (index < team.members.length - 1) {
      hairline(ctx, x + 22, my + 14, x + w - 22, c.hairSoft);
    }
  });
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
