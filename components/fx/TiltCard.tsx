"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/**
 * การ์ดที่เอียงตามเมาส์เล็กน้อย พร้อมแสงวิ่งตามปลายนิ้ว
 * องศาน้อยไว้ตั้งใจ — ให้รู้สึกว่าจับต้องได้ ไม่ใช่การ์ดกระดิกไปมา
 */
export default function TiltCard({
  children,
  className = "",
  max = 6,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const lift = useMotionValue(0);

  const spring = { stiffness: 180, damping: 22, mass: 0.6 };
  const sx = useSpring(px, spring);
  const sy = useSpring(py, spring);
  const sl = useSpring(lift, spring);

  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const glowX = useTransform(sx, (v) => `${v * 100}%`);
  const glowY = useTransform(sy, (v) => `${v * 100}%`);
  const z = useTransform(sl, [0, 1], [0, 14]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    px.set((e.clientX - rect.left) / rect.width);
    py.set((e.clientY - rect.top) / rect.height);
    lift.set(1);
  };

  const onLeave = () => {
    px.set(0.5);
    py.set(0.5);
    lift.set(0);
  };

  return (
    <div ref={ref} className={`[perspective:1100px] ${className}`}>
      <motion.div
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        style={{ rotateX, rotateY, z, transformStyle: "preserve-3d" }}
        className="relative h-full"
      >
        {children}
        {/* แสงตามเมาส์ */}
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 [background:radial-gradient(220px_circle_at_var(--gx)_var(--gy),rgba(230,200,148,0.16),transparent_65%)] group-hover:opacity-100"
          style={{ ["--gx" as string]: glowX, ["--gy" as string]: glowY }}
        />
      </motion.div>
    </div>
  );
}
