"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";

const thai = (n: number) => Math.round(n).toLocaleString("th-TH");

/**
 * ตัวเลขจริงขนาดพาดหัว นับขึ้นตอนเลื่อนมาถึง
 * ค่าที่นับเขียนลง textContent ผ่าน ref ไม่ผ่าน state — เลี่ยงการรีเรนเดอร์ทุกเฟรม
 */
export default function Figure({
  value,
  label,
  ratio,
  suffix,
  fmt = thai,
  tone = "gold",
  className = "",
}: {
  value: number;
  label: string;
  ratio?: number;
  suffix?: string;
  fmt?: (n: number) => string;
  tone?: "gold" | "platinum";
  className?: string;
}) {
  const mv = useMotionValue(0);
  const el = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();

  useEffect(
    () =>
      mv.on("change", (v) => {
        if (el.current) el.current.textContent = fmt(v);
      }),
    [mv, fmt],
  );

  const onEnter = () => {
    if (reduced) {
      mv.set(value);
      return;
    }
    animate(mv, value, { duration: 1.1, ease: [0.16, 1, 0.3, 1] });
  };

  // ศูนย์เรียงกันสี่ช่องดูเหมือนระบบพัง ใช้ขีดแทน
  const empty = value === 0;

  return (
    <motion.div
      viewport={{ once: true, amount: 0.6 }}
      onViewportEnter={onEnter}
      className={`relative ${className}`}
    >
      <span className="flex items-baseline gap-1">
        {empty ? (
          <span className="fig block text-[clamp(2.2rem,5.5vw,4.4rem)] text-muted/50">
            —
          </span>
        ) : (
          <span
            ref={el}
            className="fig num block text-[clamp(2.2rem,5.5vw,4.4rem)] text-ice"
          >
            {fmt(0)}
          </span>
        )}
        {suffix && !empty && <span className="text-sm text-muted">{suffix}</span>}
      </span>

      <p className={`slug mt-2 ${tone === "platinum" ? "slug-2" : ""}`}>{label}</p>

      {ratio != null && (
        <span className="rule mt-3 block h-[2px] w-full">
          <motion.span
            className="block h-full origin-left bg-[linear-gradient(90deg,var(--color-gold-deep),var(--color-champagne))]"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: Math.max(0, Math.min(1, ratio)) }}
            viewport={{ once: true }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
        </span>
      )}
    </motion.div>
  );
}

/** แถวสถิติมาตรฐาน 4 ช่อง มีเส้นตั้งคั่นบนจอกว้าง */
export function FigureRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-2 gap-y-8 sm:grid-cols-4 sm:divide-x sm:divide-[rgb(var(--hair)/var(--hair-a))] ${className}`}
    >
      {children}
    </div>
  );
}
