"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import { watchActive } from "@/lib/fx/active";

type Point3 = { x: number; y: number; z: number };
type Pulse = { r: number; alpha: number };
type Satellite = {
  radius: number;
  tilt: number;
  speed: number;
  phase: number;
  size: number;
};

/**
 * ทรงกลม wireframe + วงแหวนโคจร + ดาวบริวาร ที่เล่นกับเมาส์ได้
 *
 *  - ลากเพื่อหมุน ปล่อยแล้วหมุนต่อด้วยแรงเฉื่อยก่อนจะกลับไปหมุนเองช้าๆ
 *  - เลื่อนเมาส์ผ่านจะเอียงตาม และเส้นสว่างขึ้น
 *  - คลิกแล้วมีคลื่นวงแหวนกระจายออก
 *
 * วาดด้วย canvas 2D ล้วน ฉายจุด 3 มิติเอง ไม่ต้องใช้ WebGL
 */
export default function OrbitalObject({
  className = "",
  size = 520,
  interactive = true,
}: {
  className?: string;
  size?: number;
  interactive?: boolean;
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

    const R = size * 0.32;
    const cx = size / 2;
    const cy = size / 2;
    const FOV = size * 1.6;

    const LAT = 9;
    const LON = 16;
    const SEG = 44;

    // สถานะการหมุน
    const state = {
      ay: 0,
      ax: 0.25,
      vy: 0.0016, // ความเร็วอัตโนมัติ
      vx: 0,
      hover: 0, // 0..1 ความสว่างตอนเมาส์อยู่ใกล้
      targetHover: 0,
      dragging: false,
      lastX: 0,
      lastY: 0,
      lastMoveAt: 0,
    };

    const pulses: Pulse[] = [];
    const satellites: Satellite[] = [
      { radius: R * 1.42, tilt: 0.42, speed: 1.9, phase: 0, size: 3.2 },
      { radius: R * 1.72, tilt: -0.28, speed: -1.2, phase: 2.1, size: 2.4 },
      { radius: R * 1.72, tilt: -0.28, speed: -1.2, phase: 4.4, size: 1.8 },
      { radius: R * 2.02, tilt: 0.68, speed: 0.75, phase: 1.2, size: 2.8 },
    ];

    const rotate = (p: Point3, ax: number, ay: number): Point3 => {
      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);
      const x = p.x * cosY - p.z * sinY;
      let z = p.x * sinY + p.z * cosY;
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);
      const y = p.y * cosX - z * sinX;
      z = p.y * sinX + z * cosX;
      return { x, y, z };
    };

    const project = (p: Point3) => {
      const scale = FOV / (FOV + p.z);
      return { x: cx + p.x * scale, y: cy + p.y * scale, depth: p.z, scale };
    };

    const isLight = () => document.documentElement.dataset.theme === "light";

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
      const t = (lastDepth + R) / (R * 2);
      const boost = 1 + state.hover * 0.85;
      const light = isLight();
      const alpha = (light ? 0.1 + (1 - t) * 0.42 : 0.06 + (1 - t) * 0.3) * boost;
      ctx.strokeStyle = light
        ? `rgba(150, 116, 52, ${alpha})`
        : `rgba(214, 178, 116, ${alpha})`;
      ctx.lineWidth = width;
      ctx.stroke();
    };

    /* ---------- การโต้ตอบ ---------- */

    const localPoint = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onEnter = () => {
      state.targetHover = 1;
    };
    const onLeave = () => {
      state.targetHover = 0;
      state.dragging = false;
    };

    const onDown = (e: PointerEvent) => {
      if (!interactive) return;
      canvas.setPointerCapture(e.pointerId);
      const p = localPoint(e);
      state.dragging = true;
      state.lastX = p.x;
      state.lastY = p.y;
      state.lastMoveAt = performance.now();
      pulses.push({ r: R * 0.4, alpha: 0.55 });
    };

    const onMove = (e: PointerEvent) => {
      if (!interactive) return;
      const p = localPoint(e);
      if (!state.dragging) {
        // ไม่ได้ลาก แค่เอียงตามตำแหน่งเมาส์เล็กน้อย
        const ny = (p.y / size - 0.5) * 2;
        state.vx += (ny * 0.55 - state.ax) * 0.0009;
        return;
      }
      const now = performance.now();
      const dt = Math.max(8, now - state.lastMoveAt);
      state.vy += ((p.x - state.lastX) / dt) * 0.02;
      state.vx += ((p.y - state.lastY) / dt) * 0.012;
      state.lastX = p.x;
      state.lastY = p.y;
      state.lastMoveAt = now;
    };

    const onUp = () => {
      state.dragging = false;
    };

    if (interactive) {
      canvas.addEventListener("pointerenter", onEnter);
      canvas.addEventListener("pointerleave", onLeave);
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);
    }

    /* ---------- วาด ---------- */

    let raf = 0;
    let clock = 0;

    const draw = (time: number) => {
      if (!reduced) {
        clock = time * 0.001;
        // แรงเฉื่อยค่อยๆ กลับไปหาความเร็วอัตโนมัติ
        state.vy += (0.0016 - state.vy) * 0.012;
        state.vx *= 0.94;
        state.ay += state.vy;
        state.ax += state.vx;
        state.ax = Math.max(-0.9, Math.min(0.9, state.ax));
      }
      state.hover += (state.targetHover - state.hover) * 0.08;

      ctx.clearRect(0, 0, size, size);

      const { ax, ay } = state;
      const light = isLight();

      // แสงเรืองตรงกลาง
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
      const coreAlpha = (light ? 0.1 : 0.16) * (0.6 + state.hover * 0.8);
      core.addColorStop(0, `rgba(214, 178, 116, ${coreAlpha})`);
      core.addColorStop(1, "rgba(214, 178, 116, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // ละติจูด
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

      // ลองจิจูด
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

      // วงแหวนโคจร
      for (const [tilt, radius, speed, width] of [
        [0.42, R * 1.42, -0.9, 1.1],
        [-0.28, R * 1.72, 0.6, 0.8],
        [0.68, R * 2.02, -0.35, 0.6],
      ] as const) {
        const pts: Point3[] = [];
        for (let s = 0; s <= 96; s++) {
          const th = (Math.PI * 2 * s) / 96;
          const x = radius * Math.cos(th);
          const z = radius * Math.sin(th);
          pts.push({ x, y: z * Math.sin(tilt), z: z * Math.cos(tilt) });
        }
        strokePath(pts, ax * 0.4, ay * speed, width);
      }

      // ดาวบริวารวิ่งบนวงแหวน
      for (const sat of satellites) {
        const a = clock * sat.speed * 0.5 + sat.phase;
        const p = project(
          rotate(
            {
              x: sat.radius * Math.cos(a),
              y: sat.radius * Math.sin(a) * Math.sin(sat.tilt),
              z: sat.radius * Math.sin(a) * Math.cos(sat.tilt),
            },
            ax * 0.4,
            ay * (sat.speed > 0 ? 0.6 : -0.9),
          ),
        );
        const r = sat.size * p.scale * (1 + state.hover * 0.5);
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
        glow.addColorStop(0, `rgba(246, 224, 178, ${0.85 * (0.5 + state.hover * 0.5)})`);
        glow.addColorStop(1, "rgba(246, 224, 178, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = light ? "#5b4bd6" : "#f6e0b2";
        ctx.fill();
      }

      // คลื่นตอนคลิก
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i];
        pulse.r += (size * 0.5 - pulse.r) * 0.06;
        pulse.alpha *= 0.955;
        if (pulse.alpha < 0.01) {
          pulses.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(cx, cy, pulse.r, 0, Math.PI * 2);
        ctx.strokeStyle = light
          ? `rgba(150, 116, 52, ${pulse.alpha})`
          : `rgba(246, 224, 178, ${pulse.alpha})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    /* พ้นจอ (หรือแท็บถูกซ่อน) = หยุดสนิท */
    const unwatch = watchActive(canvas, (on) => {
      cancelAnimationFrame(raf);
      raf = on ? requestAnimationFrame(draw) : 0;
    });

    return () => {
      cancelAnimationFrame(raf);
      unwatch();
      if (interactive) {
        canvas.removeEventListener("pointerenter", onEnter);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
      }
    };
  }, [reduced, size, interactive]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      style={{ width: size, height: size, touchAction: "none" }}
      className={`select-none ${
        interactive ? "cursor-grab active:cursor-grabbing" : "pointer-events-none"
      } ${className}`}
    />
  );
}
