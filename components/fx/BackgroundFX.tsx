"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/**
 * พื้นหลังโทนหรู: ดำหมึก + ลำแสงนวลๆ ที่เคลื่อนช้ามาก บวกเกรนละเอียด
 * ไม่มีอนุภาค ไม่มีเส้นตาราง เพื่อให้เนื้อหาเด่นและสบายตาเวลาจ้องนาน
 */
export default function BackgroundFX() {
  const mx = useMotionValue(0.5);
  const my = useMotionValue(0.5);

  const soft = { stiffness: 18, damping: 26, mass: 1.8 };
  const ax = useSpring(mx, soft);
  const ay = useSpring(my, soft);
  const bx = useSpring(mx, { stiffness: 10, damping: 28, mass: 2.2 });
  const by = useSpring(my, { stiffness: 10, damping: 28, mass: 2.2 });

  const glowLeft = useTransform(ax, (v) => `${28 + v * 18}%`);
  const glowTop = useTransform(ay, (v) => `${-6 + v * 16}%`);
  const glow2Left = useTransform(bx, (v) => `${82 - v * 20}%`);
  const glow2Top = useTransform(by, (v) => `${74 - v * 16}%`);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      mx.set(e.clientX / window.innerWidth);
      my.set(e.clientY / window.innerHeight);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [mx, my]);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink">
      {/* ไล่โทนพื้น */}
      <div className="scene-base absolute inset-0" />

      {/* ลำแสงนวลจากด้านบน */}
      <div className="scene-top-glow absolute inset-x-0 top-0 h-[70vh]" />

      {/* ก้อนแสงเคลื่อนช้าตามเมาส์ */}
      <motion.div
        aria-hidden
        className="absolute h-[46rem] w-[46rem] animate-drift rounded-full opacity-40 blur-[150px]"
        style={{
          left: glowLeft,
          top: glowTop,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgba(180,140,80,0.30) 0%, rgba(180,140,80,0) 68%)",
        }}
      />
      <motion.div
        aria-hidden
        className="absolute h-[40rem] w-[40rem] animate-drift-slow rounded-full opacity-35 blur-[160px]"
        style={{
          left: glow2Left,
          top: glow2Top,
          x: "-50%",
          y: "-50%",
          background:
            "radial-gradient(circle, rgba(84,110,178,0.26) 0%, rgba(84,110,178,0) 68%)",
        }}
      />

      {/* เส้นทองบางพาดบนสุด */}
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(180,145,80,0.45),transparent)]" />

      {/* เกรน */}
      <div className="grain absolute inset-0 opacity-[0.05] mix-blend-overlay" />

      {/* ขอบมืดรอบจอ */}
      <div className="scene-vignette absolute inset-0" />
    </div>
  );
}
