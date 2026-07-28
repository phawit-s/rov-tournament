"use client";

import { forwardRef, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { sfx } from "@/lib/sound";

type Variant = "primary" | "ghost" | "danger" | "gold";

/** ตัด event ที่ชนกับ props ของ motion ออก */
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration" | "onDrag" | "onDragStart" | "onDragEnd" | "style"
>;

type Props = NativeButtonProps & {
  variant?: Variant;
  strength?: number;
  children: ReactNode;
};

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-linear-to-r from-cyan/90 via-violet/85 to-magenta/85 text-white shadow-[0_10px_40px_-12px_rgba(34,211,238,0.85)] hover:shadow-[0_14px_50px_-10px_rgba(168,85,247,0.9)]",
  gold: "bg-linear-to-r from-gold via-[#ffe08a] to-gold text-[#2a1a00] shadow-[0_10px_38px_-12px_rgba(251,191,36,0.9)]",
  ghost:
    "bg-white/5 text-ice hover:bg-white/10 border border-white/12 backdrop-blur-md",
  danger:
    "bg-magenta/15 text-magenta border border-magenta/40 hover:bg-magenta/25",
};

/** ปุ่มที่ขยับเข้าหาเมาส์แบบแม่เหล็ก */
const MagneticButton = forwardRef<HTMLButtonElement, Props>(function MagneticButton(
  { variant = "primary", strength = 0.35, className = "", children, onClick, ...rest },
  forwardedRef,
) {
  const localRef = useRef<HTMLButtonElement | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.5 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.5 });

  return (
    <motion.button
      ref={(node) => {
        localRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      style={{ x: sx, y: sy }}
      whileTap={{ scale: 0.95 }}
      onPointerMove={(e) => {
        const el = localRef.current;
        if (!el || window.matchMedia("(pointer: coarse)").matches) return;
        const rect = el.getBoundingClientRect();
        x.set((e.clientX - (rect.left + rect.width / 2)) * strength);
        y.set((e.clientY - (rect.top + rect.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
      onClick={(e) => {
        sfx.unlock();
        sfx.play("click");
        onClick?.(e);
      }}
      className={`group relative isolate inline-flex cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl px-6 py-3 font-display text-sm font-semibold tracking-wide transition-colors duration-200 select-none disabled:cursor-not-allowed disabled:opacity-40 disabled:saturate-0 ${VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {/* แสงกวาดตอน hover */}
      <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
        <span className="absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-white/30 opacity-0 blur-md group-hover:animate-sweep group-hover:opacity-100" />
      </span>
      {/* เส้นสแกนบางๆ ให้ดูเป็นจอ */}
      <span className="pointer-events-none absolute inset-0 rounded-2xl bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.07)_0px,rgba(255,255,255,0.07)_1px,transparent_1px,transparent_3px)] opacity-40" />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </motion.button>
  );
});

export default MagneticButton;
