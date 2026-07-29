"use client";

import { useEffect, useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import SilkCanvas from "./SilkCanvas";

type Mote = {
  x: number;
  y: number;
  r: number;
  speed: number;
  sway: number;
  phase: number;
  alpha: number;
  warm: boolean;
};

/**
 * พื้นหลังโทนหรู — เคลื่อนไหวช้ามากจนแทบไม่รู้ตัว แต่ภาพไม่นิ่งตาย
 * ชั้นที่ซ้อนกัน: ไล่สีพื้น → ลำแสงบน → ก้อนแสงลอย → ฝุ่นทอง → แสงกวาด → เกรน → ขอบมืด
 * ทุกอย่างความทึบต่ำ ไม่แย่งสายตากับเนื้อหา
 */
export default function BackgroundFX() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reduced = useReducedMotion();

  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);

  const soft = { stiffness: 16, damping: 26, mass: 2 };
  const ax = useSpring(mx, soft);
  const ay = useSpring(my, soft);
  const bx = useSpring(mx, { stiffness: 9, damping: 28, mass: 2.4 });
  const by = useSpring(my, { stiffness: 9, damping: 28, mass: 2.4 });

  const glowLeft = useTransform(ax, (v) => `${26 + v * 16}%`);
  const glowTop = useTransform(ay, (v) => `${-8 + v * 14}%`);
  const glow2Left = useTransform(bx, (v) => `${84 - v * 18}%`);
  const glow2Top = useTransform(by, (v) => `${76 - v * 14}%`);
  const glow3Left = useTransform(bx, (v) => `${10 + v * 12}%`);
  const glow3Top = useTransform(ay, (v) => `${88 - v * 12}%`);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth);
      my.set(e.clientY / window.innerHeight);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my]);

  // ฝุ่นทองลอยขึ้นช้าๆ — น้อยชิ้น ความทึบต่ำ ไม่กวนสายตา
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let width = 0;
    let height = 0;
    let motes: Mote[] = [];
    let raf = 0;

    const seed = () => {
      const count = Math.min(30, Math.max(12, Math.round(width / 68)));
      motes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 0.6 + Math.random() * 1.4,
        speed: 3 + Math.random() * 7,
        sway: 8 + Math.random() * 22,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.1 + Math.random() * 0.24,
        warm: Math.random() < 0.7,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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

    let last = 0;
    const draw = (time: number) => {
      const dt = last ? Math.min((time - last) / 1000, 0.05) : 0.016;
      last = time;
      ctx.clearRect(0, 0, width, height);

      const light = document.documentElement.dataset.theme === "light";

      for (const mote of motes) {
        if (!reduced) {
          mote.y -= mote.speed * dt;
          if (mote.y < -10) {
            mote.y = height + 10;
            mote.x = Math.random() * width;
          }
        }
        const drift = Math.sin(time * 0.00016 + mote.phase) * mote.sway;
        const x = mote.x + drift;
        const twinkle = reduced
          ? 1
          : 0.65 + 0.35 * Math.sin(time * 0.0009 + mote.phase * 2);
        const alpha = mote.alpha * twinkle * (light ? 0.55 : 1);

        ctx.beginPath();
        ctx.arc(x, mote.y, mote.r, 0, Math.PI * 2);
        ctx.fillStyle = light
          ? `rgba(150, 118, 56, ${alpha})`
          : mote.warm
            ? `rgba(240, 216, 171, ${alpha})`
            : `rgba(190, 205, 240, ${alpha * 0.8})`;
        ctx.fill();
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
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink">
      {/* ไล่โทนพื้น */}
      <div className="scene-base absolute inset-0" />

      {/* ผ้าไหมทองไหล — ชั้นหลักที่ทำให้ภาพไม่นิ่ง */}
      <SilkCanvas />

      {/* ลดความจัดของผ้าไหมลงให้ตัวหนังสืออ่านง่าย */}
      <div className="scene-veil absolute inset-0" />

      {/* ลำแสงนวลจากด้านบน */}
      <div className="scene-top-glow absolute inset-x-0 top-0 h-[70vh]" />

      {/* ก้อนแสงลอย — ขยับตามเมาส์แบบหน่วงมาก บวกหายใจเข้าออกช้าๆ */}
      <motion.div
        aria-hidden
        className="absolute h-184 w-184 rounded-full blur-[150px]"
        style={{
          left: glowLeft,
          top: glowTop,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgba(184,146,84,0.32) 0%, rgba(184,146,84,0) 68%)",
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.34, 0.46, 0.34] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute h-160 w-160 rounded-full blur-[160px]"
        style={{
          left: glow2Left,
          top: glow2Top,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgba(84,110,178,0.28) 0%, rgba(84,110,178,0) 68%)",
        }}
        animate={{ scale: [1.08, 0.94, 1.08], opacity: [0.3, 0.42, 0.3] }}
        transition={{ duration: 31, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute h-128 w-128 rounded-full blur-[140px]"
        style={{
          left: glow3Left,
          top: glow3Top,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgba(150,110,190,0.2) 0%, rgba(150,110,190,0) 70%)",
        }}
        animate={{ scale: [0.95, 1.15, 0.95], opacity: [0.22, 0.34, 0.22] }}
        transition={{ duration: 38, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* แสงกวาดเฉียงผ่านจอช้าๆ */}
      <div className="scene-sweep absolute inset-0" />

      {/* เส้นทองบางพาดบนสุด */}
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(180,145,80,0.45),transparent)]" />

      {/* ฝุ่นทอง */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* เกรน */}
      <div className="grain absolute inset-0 opacity-[0.05] mix-blend-overlay" />

      {/* ขอบมืดรอบจอ */}
      <div className="scene-vignette absolute inset-0" />
    </div>
  );
}
