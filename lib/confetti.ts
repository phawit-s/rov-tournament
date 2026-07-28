"use client";

type ConfettiFn = typeof import("canvas-confetti");

let cached: ConfettiFn | null = null;

/** โหลดตอนใช้จริงเท่านั้น กัน window/document ตอน prerender */
async function getConfetti(): Promise<ConfettiFn | null> {
  if (typeof window === "undefined") return null;
  if (!cached) {
    const mod = (await import("canvas-confetti")) as unknown as {
      default?: ConfettiFn;
    } & ConfettiFn;
    cached = mod.default ?? mod;
  }
  return cached;
}

const NEON = ["#22d3ee", "#a855f7", "#f43f5e", "#fbbf24", "#a3e635", "#ffffff"];

/** ระเบิดเล็กๆ ตรงจุดที่กำหนด (0..1 ของหน้าจอ) */
export async function burstAt(x: number, y: number, colors: string[] = NEON) {
  const confetti = await getConfetti();
  if (!confetti) return;
  confetti({
    particleCount: 46,
    spread: 78,
    startVelocity: 34,
    ticks: 120,
    scalar: 0.9,
    origin: { x, y },
    colors,
    disableForReducedMotion: true,
  });
}

/** ฉลองตอนทีมเต็ม */
export async function teamCompleteBurst(color: string) {
  const confetti = await getConfetti();
  if (!confetti) return;
  const colors = [color, "#ffffff", "#22d3ee"];
  confetti({
    particleCount: 90,
    spread: 110,
    startVelocity: 42,
    origin: { y: 0.45 },
    colors,
    disableForReducedMotion: true,
  });
}

/** ฉลองใหญ่ตอนจบ ยิงยาว 2.2 วินาที */
export async function grandFinale() {
  const confetti = await getConfetti();
  if (!confetti) return;
  const end = Date.now() + 2200;

  confetti({
    particleCount: 160,
    spread: 130,
    startVelocity: 48,
    origin: { y: 0.4 },
    colors: NEON,
    disableForReducedMotion: true,
  });

  const frame = () => {
    confetti({
      particleCount: 5,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.75 },
      colors: NEON,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 5,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.75 },
      colors: NEON,
      disableForReducedMotion: true,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}
