"use client";

import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

type Props = {
  children: ReactNode;
  className?: string;
  /** องศาสูงสุดที่เอียง */
  max?: number;
  glare?: boolean;
  onClick?: () => void;
};

/** การ์ดเอียงตามเมาส์แบบ 3D พร้อมแสงสะท้อนวิ่งตาม */
export default function TiltCard({
  children,
  className = "",
  max = 9,
  glare = true,
  onClick,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const spring = { stiffness: 200, damping: 20, mass: 0.4 };
  const rotateX = useSpring(
    useTransform(py, [0, 1], [max, -max]),
    spring,
  );
  const rotateY = useSpring(
    useTransform(px, [0, 1], [-max, max]),
    spring,
  );

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia("(pointer: coarse)").matches) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    px.set(nx);
    py.set(ny);
    el.style.setProperty("--mx", `${nx * 100}%`);
    el.style.setProperty("--my", `${ny * 100}%`);
  };

  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={reset}
      onClick={onClick}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={`spotlight relative transform-3d ${className}`}
    >
      {children}
      {glare && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 hover:opacity-100"
          style={{
            background:
              "radial-gradient(320px circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,0.14), transparent 60%)",
          }}
        />
      )}
    </motion.div>
  );
}
