"use client";

import type { BuiltTeam, Member } from "./types";

const W = 1240;
const PAD = 56;
const GAP = 22;

/** เรนเดอร์ผลการแบ่งทีมเป็น PNG ด้วย canvas ล้วน ไม่พึ่ง lib ภายนอก */
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
  const cardH = 78 + maxRows * 44;
  const rows = Math.ceil(teams.length / cols);
  const benchH = bench.length ? 96 : 0;
  const H = PAD + 132 + rows * (cardH + GAP) + benchH + 74;

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);

  // พื้นหลัง
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#08081c");
  bg.addColorStop(0.5, "#0d0b26");
  bg.addColorStop(1, "#12061f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, W * 0.8);
  glow.addColorStop(0, "rgba(56,189,248,0.28)");
  glow.addColorStop(1, "rgba(56,189,248,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 420);

  // หัวเรื่อง
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 46px 'Chakra Petch', 'Segoe UI', sans-serif";
  ctx.fillText("ROV TOURNAMENT — ผลการแบ่งทีม", PAD, PAD + 46);

  ctx.fillStyle = "#8b8bb5";
  ctx.font = "400 20px 'IBM Plex Sans Thai', 'Segoe UI', sans-serif";
  const stamp = new Date().toLocaleString("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  ctx.fillText(`${teams.length} ทีม • ${stamp} • seed ${seed}`, PAD, PAD + 80);

  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, PAD + 104);
  ctx.lineTo(W - PAD, PAD + 104);
  ctx.stroke();

  // การ์ดทีม
  teams.forEach((team, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (cardW + GAP);
    const y = PAD + 132 + row * (cardH + GAP);
    drawTeamCard(ctx, team, teamName(team.index), x, y, cardW, cardH);
  });

  // ตัวสำรอง
  if (bench.length) {
    const y = PAD + 132 + rows * (cardH + GAP);
    roundRect(ctx, PAD, y, W - PAD * 2, 72, 18);
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.stroke();
    ctx.fillStyle = "#8b8bb5";
    ctx.font = "600 20px 'Chakra Petch', sans-serif";
    ctx.fillText("ตัวสำรอง", PAD + 22, y + 30);
    ctx.fillStyle = "#e2e8ff";
    ctx.font = "400 20px 'IBM Plex Sans Thai', sans-serif";
    ctx.fillText(
      bench.map((m) => m.player.name).join("   •   "),
      PAD + 22,
      y + 56,
    );
  }

  ctx.fillStyle = "rgba(226,232,255,0.35)";
  ctx.font = "400 16px 'IBM Plex Sans Thai', sans-serif";
  ctx.fillText(
    "สุ่มด้วย ROV Team Randomizer — ผลลัพธ์ตรวจสอบซ้ำได้ด้วย seed เดิม",
    PAD,
    H - PAD + 20,
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
  roundRect(ctx, x, y, w, h, 20);
  const grd = ctx.createLinearGradient(x, y, x + w, y + h);
  grd.addColorStop(0, `rgba(${identity.rgb.split(" ").join(",")},0.20)`);
  grd.addColorStop(1, "rgba(255,255,255,0.03)");
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = `rgba(${identity.rgb.split(" ").join(",")},0.55)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = identity.hex;
  ctx.font = "700 24px 'Chakra Petch', sans-serif";
  ctx.fillText(customName || identity.name, x + 20, y + 40);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "500 15px 'Chakra Petch', sans-serif";
  ctx.fillText(`${team.members.length} คน`, x + 20, y + 62);

  team.members.forEach((member, index) => {
    const my = y + 88 + index * 44;
    roundRect(ctx, x + 14, my - 22, w - 28, 36, 10);
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.fill();

    ctx.fillStyle = `rgba(${identity.rgb.split(" ").join(",")},0.95)`;
    ctx.font = "700 15px 'Chakra Petch', sans-serif";
    ctx.fillText(String(index + 1), x + 26, my + 3);

    ctx.fillStyle = "#ffffff";
    ctx.font = "500 19px 'IBM Plex Sans Thai', sans-serif";
    const maxTextW = w - 90;
    ctx.fillText(fit(ctx, member.player.name, maxTextW), x + 48, my + 3);

    if (member.lane) {
      ctx.fillStyle = `rgba(${identity.rgb.split(" ").join(",")},0.9)`;
      ctx.font = "600 14px 'IBM Plex Sans Thai', sans-serif";
      const lw = ctx.measureText(member.lane).width;
      ctx.fillText(member.lane, x + w - 26 - lw, my + 3);
    }
  });
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
