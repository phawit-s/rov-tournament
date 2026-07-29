"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";

type Point3 = { x: number; y: number; z: number };

/**
 * ทรงกลม wireframe + วงแหวนโคจร หมุนช้าๆ อยู่หลังเนื้อหา
 *
 * วาดด้วย canvas ล้วน ฉายจุด 3 มิติลงระนาบ 2 มิติเอง ไม่ต้องใช้ WebGL
 * เส้นที่อยู่ด้านหลังจะจางกว่า ทำให้เห็นความลึกโดยไม่ต้องมีแสงเงา
 */
export default function OrbitalObject({
  className = "",
  size = 520,
}: {
  className?: string;
  size?: number;
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

    const R = size * 0.34;
    const cx = size / 2;
    const cy = size / 2;
    const FOV = size * 1.6;

    // เส้นละติจูด/ลองจิจูดของทรงกลม
    const LAT = 9;
    const LON = 16;
    const SEG = 48;

    const rotate = (p: Point3, ax: number, ay: number): Point3 => {
      // หมุนรอบแกน Y
      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);
      const x = p.x * cosY - p.z * sinY;
      let z = p.x * sinY + p.z * cosY;
      // เอียงรอบแกน X
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);
      const y = p.y * cosX - z * sinX;
      z = p.y * sinX + z * cosX;
      return { x, y, z };
    };

    const project = (p: Point3) => {
      const scale = FOV / (FOV + p.z);
      return { x: cx + p.x * scale, y: cy + p.y * scale, depth: p.z };
    };

    const strokePath = (pts: Point3[], ax: number, ay: number, width: number) => {
      let started = false;
      let lastDepth = 0;
      ctx.beginPath();
      for (const raw of pts) {
        const p = project(rotate(raw, ax, ay));
        if (!started) {
          ctx.moveTo(p.x, p.y);
          started = true;
        } else {
          ctx.lineTo(p.x, p.y);
        }
        lastDepth = p.depth;
      }
      // เส้นที่อยู่ไกลจางกว่า — ธีมสว่างต้องเข้มขึ้นถึงจะเห็น
      const t = (lastDepth + R) / (R * 2);
      const light = document.documentElement.dataset.theme === "light";
      const alpha = light ? 0.1 + (1 - t) * 0.42 : 0.06 + (1 - t) * 0.3;
      ctx.strokeStyle = light
        ? `rgba(150, 116, 52, ${alpha})`
        : `rgba(214, 178, 116, ${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    let raf = 0;
    let t = 0;

    const draw = (time: number) => {
      if (!reduced) t = time * 0.00013;
      ctx.clearRect(0, 0, size, size);

      const ay = t;
      const ax = Math.sin(t * 0.6) * 0.32 + 0.25;

      // เส้นละติจูด
      for (let i = 1; i < LAT; i++) {
        const phi = (Math.PI * i) / LAT;
        const r = R * Math.sin(phi);
        const y = R * Math.cos(phi);
        const pts: Point3[] = [];
        for (let s = 0; s <= SEG; s++) {
          const th = (Math.PI * 2 * s) / SEG;
          pts.push({ x: r * Math.cos(th), y, z: r * Math.sin(th) });
        }
        strokePath(pts, ax, ay, 0.7);
      }

      // เส้นลองจิจูด
      for (let j = 0; j < LON; j++) {
        const th = (Math.PI * 2 * j) / LON;
        const pts: Point3[] = [];
        for (let s = 0; s <= SEG; s++) {
          const phi = (Math.PI * s) / SEG;
          pts.push({
            x: R * Math.sin(phi) * Math.cos(th),
            y: R * Math.cos(phi),
            z: R * Math.sin(phi) * Math.sin(th),
          });
        }
        strokePath(pts, ax, ay, 0.55);
      }

      // วงแหวนโคจรสองวง หมุนสวนทางกัน
      for (const [tilt, radius, speed, width] of [
        [0.42, R * 1.42, -1.35, 1.1],
        [-0.28, R * 1.72, 0.85, 0.8],
      ] as const) {
        const pts: Point3[] = [];
        for (let s = 0; s <= 96; s++) {
          const th = (Math.PI * 2 * s) / 96;
          const x = radius * Math.cos(th);
          const z = radius * Math.sin(th);
          pts.push({ x, y: z * Math.sin(tilt), z: z * Math.cos(tilt) });
        }
        strokePath(pts, ax * 0.4, t * speed, width);
      }

      // จุดสว่างวิ่งบนวงแหวน
      if (!reduced) {
        const orbit = t * 1.9;
        const rr = R * 1.42;
        const p = project(
          rotate(
            {
              x: rr * Math.cos(orbit),
              y: rr * Math.sin(orbit) * Math.sin(0.42),
              z: rr * Math.sin(orbit) * Math.cos(0.42),
            },
            ax * 0.4,
            t * -1.35,
          ),
        );
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 14);
        glow.addColorStop(0, "rgba(246, 224, 178, 0.9)");
        glow.addColorStop(1, "rgba(246, 224, 178, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
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
