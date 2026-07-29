"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * หัวข้อประจำองก์ — เลขบทตัวโปร่ง ชื่อองก์ หัวข้อใหญ่ และเส้นทองที่ลากออกตอนเลื่อนมาถึง
 * ใช้ตัวเดียวกันทั้งเว็บแทนการเขียน text-3xl sm:text-5xl ซ้ำทุกหน้า
 */
export default function SectionHead({
  no,
  eyebrow,
  title,
  meta,
  action,
  tone = "gold",
  className = "",
}: {
  no: string;
  eyebrow: string;
  title: string;
  meta?: ReactNode;
  action?: ReactNode;
  tone?: "gold" | "platinum";
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div
      className={`grid grid-cols-12 items-end gap-x-3 gap-y-4 border-t border-hair pt-4 ${className}`}
    >
      <span className="fig text-outline col-span-2 text-[clamp(1.6rem,3.5vw,2.6rem)] lg:col-span-1">
        {no}
      </span>

      <div className="col-span-10 min-w-0 lg:col-span-7">
        <p className={`slug ${tone === "platinum" ? "slug-2" : ""}`}>{eyebrow}</p>
        <h2 className="mt-2 font-display text-h2 font-light text-ice">{title}</h2>
        {reduced ? (
          <span className="mt-4 block h-px w-28 bg-[linear-gradient(90deg,rgb(var(--accent)/.85),transparent)]" />
        ) : (
          <motion.span
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 block h-px w-28 origin-left bg-[linear-gradient(90deg,rgb(var(--accent)/.85),transparent)]"
          />
        )}
      </div>

      {(meta || action) && (
        <div className="col-span-12 flex items-center justify-between gap-4 lg:col-span-4 lg:justify-end">
          {meta && <span className="num text-sm text-muted">{meta}</span>}
          {action}
        </div>
      )}
    </div>
  );
}
