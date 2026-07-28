"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hue: number;
};

const HEX = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="96" viewBox="0 0 56 96"><g fill="none" stroke="rgb(120,140,255)" stroke-opacity="0.16" stroke-width="1"><path d="M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z"/><path d="M28 32 L56 48"/></g></svg>`,
);

/**
 * พื้นหลังแบบ interactive: อนุภาคลอย + เส้นเชื่อม + หลบเมาส์
 * บวก orb เรืองแสงที่วิ่งตามเมาส์แบบหน่วงสปริง
 */
export default function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointer = useRef({ x: -9999, y: -9999, active: false });
  const reduced = useReducedMotion();

  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);
  const orbX = useSpring(mx, { stiffness: 40, damping: 20, mass: 1.2 });
  const orbY = useSpring(my, { stiffness: 40, damping: 20, mass: 1.2 });
  const orb2X = useSpring(mx, { stiffness: 18, damping: 22, mass: 1.6 });
  const orb2Y = useSpring(my, { stiffness: 18, damping: 22, mass: 1.6 });

  const orbLeft = useTransform(orbX, (v) => `${v * 100}%`);
  const orbTop = useTransform(orbY, (v) => `${v * 100}%`);
  const orb2Left = useTransform(orb2X, (v) => `${(1 - v) * 100}%`);
  const orb2Top = useTransform(orb2Y, (v) => `${(1 - v) * 100}%`);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, active: true };
      mx.set(e.clientX / window.innerWidth);
      my.set(e.clientY / window.innerHeight);
    };
    const onLeave = () => {
      pointer.current.active = false;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [mx, my]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let particles: Particle[] = [];
    let raf = 0;

    const seed = () => {
      const density = window.innerWidth < 640 ? 15000 : 9000;
      const count = Math.min(120, Math.max(28, Math.floor((width * height) / density)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: Math.random() * 1.7 + 0.6,
        hue: Math.random() < 0.32 ? 285 : 190,
      }));
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    resize();
    window.addEventListener("resize", resize);

    const linkDistance = window.innerWidth < 640 ? 90 : 130;

    /** กริดเปอร์สเปกทีฟวิ่งเข้าหาผู้ชม จุดรวมสายตาขยับตามเมาส์นิดหน่อย */
    const drawGrid = (time: number) => {
      const { x: px, active } = pointer.current;
      const horizon = height * 0.56;
      const vpx = width / 2 + (active ? (px - width / 2) * 0.07 : 0);
      const span = width * 1.7;

      ctx.lineWidth = 1;
      for (let i = -16; i <= 16; i++) {
        const xb = width / 2 + (i / 16) * span;
        const alpha = 0.26 * (1 - Math.abs(i) / 19);
        ctx.strokeStyle = `rgba(168, 85, 247, ${Math.max(alpha, 0.05)})`;
        ctx.beginPath();
        ctx.moveTo(vpx, horizon);
        ctx.lineTo(xb, height);
        ctx.stroke();
      }

      const frac = reduced ? 0 : (time / 2800) % 1;
      for (let i = 0; i < 30; i++) {
        const depth = i + 1 - frac;
        const y = horizon + (height - horizon) / depth;
        if (y > height + 2) continue;
        ctx.strokeStyle = `rgba(34, 211, 238, ${Math.min(0.3, 0.4 / depth)})`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // เส้นขอบฟ้า + แสงฟุ้ง
      const glow = ctx.createLinearGradient(0, 0, width, 0);
      glow.addColorStop(0, "rgba(34, 211, 238, 0)");
      glow.addColorStop(0.5, "rgba(34, 211, 238, 0.55)");
      glow.addColorStop(1, "rgba(34, 211, 238, 0)");
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      ctx.lineTo(width, horizon);
      ctx.stroke();

      const haze = ctx.createLinearGradient(0, horizon - 70, 0, horizon + 10);
      haze.addColorStop(0, "rgba(34, 211, 238, 0)");
      haze.addColorStop(1, "rgba(34, 211, 238, 0.10)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, horizon - 70, width, 80);
    };

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height);
      drawGrid(time);
      const { x: px, y: py, active } = pointer.current;

      for (const p of particles) {
        if (!reduced) {
          p.x += p.vx;
          p.y += p.vy;
        }

        if (active) {
          const dx = p.x - px;
          const dy = p.y - py;
          const dist2 = dx * dx + dy * dy;
          const radius = 150;
          if (dist2 < radius * radius && dist2 > 0.01) {
            const dist = Math.sqrt(dist2);
            const force = (1 - dist / radius) * 0.9;
            p.x += (dx / dist) * force;
            p.y += (dy / dist) * force;
          }
        }

        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        const near =
          active && Math.hypot(p.x - px, p.y - py) < 190 ? 1 : 0.45;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 95%, ${p.hue === 285 ? 72 : 62}%, ${0.25 + near * 0.45})`;
        ctx.fill();
      }

      // เส้นเชื่อมระหว่างอนุภาคที่อยู่ใกล้กัน
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > linkDistance) continue;
          const alpha = (1 - dist / linkDistance) * 0.22;
          ctx.strokeStyle = `rgba(120, 190, 255, ${alpha})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // วงกลมชี้ตำแหน่งเมาส์
      if (active) {
        const grd = ctx.createRadialGradient(px, py, 0, px, py, 170);
        grd.addColorStop(0, "rgba(34, 211, 238, 0.10)");
        grd.addColorStop(1, "rgba(34, 211, 238, 0)");
        ctx.fillStyle = grd;
        ctx.fillRect(px - 170, py - 170, 340, 340);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [reduced]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-void">
      {/* ไล่สีพื้นฐาน */}
      <div className="absolute inset-0 bg-[radial-gradient(1300px_760px_at_50%_-12%,#1c1c64_0%,transparent_62%),radial-gradient(1000px_680px_at_100%_105%,#320f52_0%,transparent_58%),radial-gradient(820px_560px_at_-5%_75%,#06344b_0%,transparent_58%)]" />

      {/* ตารางหกเหลี่ยม */}
      <div
        className="absolute inset-0 opacity-35 mask-[radial-gradient(75%_65%_at_50%_35%,#000_20%,transparent_100%)]"
        style={{ backgroundImage: `url("data:image/svg+xml,${HEX}")` }}
      />

      {/* orb ตามเมาส์ */}
      <motion.div
        aria-hidden
        className="absolute h-184 w-184 rounded-full opacity-40 blur-[110px]"
        style={{
          left: orbLeft,
          top: orbTop,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgba(56,189,248,0.55) 0%, rgba(56,189,248,0) 70%)",
        }}
      />
      <motion.div
        aria-hidden
        className="absolute h-136 w-136 rounded-full opacity-45 blur-[100px]"
        style={{
          left: orb2Left,
          top: orb2Top,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgba(168,85,247,0.5) 0%, rgba(168,85,247,0) 70%)",
        }}
      />

      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* ขอบมืดรอบจอ — เบาพอให้เห็นพื้นตารางกับอนุภาค */}
      <div className="absolute inset-0 bg-[radial-gradient(135%_105%_at_50%_45%,transparent_58%,rgba(2,2,10,0.72)_100%)]" />
    </div>
  );
}
