"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

type Ring = {
  radius: number;
  gaps: number;
  speed: number;
  width: number;
  fill: number; // สัดส่วนของวงที่มีเส้นจริง 0..1
};

/**
 * กลุ่มวงแหวนซ้อนกันที่หมุนสวนทางกัน
 *
 *  - เมาส์เข้าใกล้ วงจะกางออกและหมุนเร็วขึ้น
 *  - เข็มชี้จะหันตามตำแหน่งเมาส์
 *  - ออกห่างแล้วค่อยๆ คืนสภาพเดิม
 */
export default function RingCluster({
  size = 320,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const base = size * 0.1;

    const rings: Ring[] = [
      { radius: base * 1.4, gaps: 3, speed: 0.34, width: 1.2, fill: 0.62 },
      { radius: base * 2.1, gaps: 5, speed: -0.22, width: 0.9, fill: 0.5 },
      { radius: base * 2.9, gaps: 2, speed: 0.15, width: 1.6, fill: 0.34 },
      { radius: base * 3.6, gaps: 7, speed: -0.11, width: 0.7, fill: 0.7 },
      { radius: base * 4.3, gaps: 4, speed: 0.08, width: 1, fill: 0.26 },
    ];

    const state = { spread: 0, target: 0, angle: 0, targetAngle: 0 };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - (rect.left + rect.width / 2);
      const py = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(px, py);
      const reach = size * 0.9;
      state.target = Math.max(0, 1 - dist / reach);
      if (dist > 4) state.targetAngle = Math.atan2(py, px);
    };
    const onLeave = () => {
      state.target = 0;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const draw = (time: number) => {
      state.spread += (state.target - state.spread) * 0.07;

      // หมุนเข็มไปทางเมาส์โดยเลือกทางที่ใกล้กว่า
      let diff = state.targetAngle - state.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.angle += diff * 0.08;

      ctx.clearRect(0, 0, size, size);
      const light = document.documentElement.dataset.theme === "light";
      const t = reduced ? 0 : time * 0.001;
      const boost = 1 + state.spread * 1.6;

      for (const ring of rings) {
        const radius = ring.radius * (1 + state.spread * 0.16);
        const arc = ((Math.PI * 2) / ring.gaps) * ring.fill;
        const start = t * ring.speed * (1 + state.spread * 1.4);
        const alpha = (light ? 0.24 : 0.2) * boost;

        ctx.strokeStyle = light
          ? `rgba(150, 116, 52, ${alpha})`
          : `rgba(214, 178, 116, ${alpha})`;
        ctx.lineWidth = ring.width;
        ctx.lineCap = "round";
        for (let g = 0; g < ring.gaps; g++) {
          const a0 = start + ((Math.PI * 2) / ring.gaps) * g;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, a0, a0 + arc);
          ctx.stroke();
        }
      }

      // ขีดบอกองศารอบนอก
      const outer = rings[rings.length - 1].radius * (1 + state.spread * 0.16);
      ctx.strokeStyle = light
        ? `rgba(150, 116, 52, ${0.2 * boost})`
        : `rgba(214, 178, 116, ${0.18 * boost})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 48; i++) {
        const a = (Math.PI * 2 * i) / 48 - t * 0.05;
        const long = i % 4 === 0;
        const r0 = outer + 10;
        const r1 = r0 + (long ? 8 : 4) * (1 + state.spread);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }

      // เข็มชี้ตามเมาส์
      const needle = rings[2].radius * (1 + state.spread * 0.16);
      const grad = ctx.createLinearGradient(
        cx,
        cy,
        cx + Math.cos(state.angle) * needle,
        cy + Math.sin(state.angle) * needle,
      );
      const tip = light ? "150, 116, 52" : "246, 224, 178";
      grad.addColorStop(0, `rgba(${tip}, 0)`);
      grad.addColorStop(1, `rgba(${tip}, ${0.22 + state.spread * 0.45})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(state.angle) * needle, cy + Math.sin(state.angle) * needle);
      ctx.stroke();

      // จุดปลายเข็ม
      const nx = cx + Math.cos(state.angle) * needle;
      const ny = cy + Math.sin(state.angle) * needle;
      const glow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 14);
      glow.addColorStop(0, `rgba(${tip}, ${0.5 + state.spread * 0.4})`);
      glow.addColorStop(1, `rgba(${tip}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(nx, ny, 14, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced, size]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: size, height: size }}
      className={`pointer-events-none select-none ${className}`}
    />
  );
}
