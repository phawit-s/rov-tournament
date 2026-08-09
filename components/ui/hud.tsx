"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * ชิ้นส่วนตัวเลขที่ทุกโซนใช้ซ้ำ — เม็ดคะแนน แถบสัดส่วน รางความคืบหน้า วงแหวนความจุ
 * ทุกตัวใช้ tabular-nums ผ่านคลาส .num และเคารพ prefers-reduced-motion
 */

/** เม็ดข้าวหลามตัดบอกสกอร์ซีรีส์ เช่น BO3 ชนะ 2 เกม */
export function SeriesPips({
  need,
  score,
  align = "left",
  rgb,
}: {
  need: number;
  score: number;
  align?: "left" | "right";
  rgb?: string;
}) {
  return (
    <span
      className={`flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}
      style={rgb ? ({ ["--st" as string]: rgb } as never) : undefined}
    >
      {Array.from({ length: need }, (_, i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rotate-45"
          style={
            i < score
              ? { background: "rgb(var(--st, var(--accent)))" }
              : { boxShadow: "inset 0 0 0 1px rgb(var(--hair) / var(--hair-a))" }
          }
        />
      ))}
    </span>
  );
}

/** แถบสัดส่วน 0..1 ส่วนที่เกิน 1 ย้อมแดงเตือน */
export function Meter({
  pct,
  h = 2,
  className = "",
}: {
  pct: number;
  h?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const over = pct > 1;
  const width = Math.max(0, Math.min(1, pct));

  return (
    <span className={`rule block w-full ${className}`} style={{ height: h }}>
      {reduced ? (
        <span
          className="block h-full origin-left"
          style={{
            transform: `scaleX(${width})`,
            background: over
              ? "var(--color-danger)"
              : "linear-gradient(90deg,var(--color-iris-deep),var(--color-iris))",
          }}
        />
      ) : (
        <motion.span
          className="block h-full origin-left"
          style={{
            background: over
              ? "var(--color-danger)"
              : "linear-gradient(90deg,var(--color-iris-deep),var(--color-iris))",
          }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: width }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      )}
    </span>
  );
}

/** ราง 1 ขีดต่อ 1 ที่นั่ง — เห็นทั้งความคืบหน้าและเห็นว่าใครลงทีมไหน */
export function PipRail({
  total,
  revealed,
  colorOf,
}: {
  total: number;
  revealed: number;
  colorOf: (i: number) => string;
}) {
  const reduced = useReducedMotion();

  return (
    <span className="flex flex-wrap items-center gap-1">
      {Array.from({ length: total }, (_, i) => {
        if (i < revealed) {
          return (
            <span
              key={i}
              className="inline-block h-2.5 w-1.5 rounded-full"
              style={{ background: `rgb(${colorOf(i)} / 0.85)` }}
            />
          );
        }
        if (i === revealed && !reduced) {
          return (
            <motion.span
              key={i}
              className="inline-block h-2.5 w-1.5 rounded-full bg-iris"
              animate={{ opacity: [1, 0.35, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          );
        }
        return <span key={i} className="rule inline-block h-2.5 w-1.5 rounded-full" />;
      })}
    </span>
  );
}

/** ช่องสถิติขนาดเล็ก ใช้ที่ที่ Figure ใหญ่เกิน */
export function StatTile({
  label,
  value,
  ratio,
  className = "",
}: {
  label: string;
  value: string | number;
  ratio?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="slug slug-2">{label}</p>
      <p className="num mt-1 font-display text-2xl font-light text-ice">{value}</p>
      {ratio != null && <Meter pct={ratio} className="mt-2" />}
    </div>
  );
}

/** วงแหวนความจุ เช่น ทีมที่รับแล้ว / ที่รับได้ */
export function CapacityRing({
  value,
  max,
  size = 44,
  label,
}: {
  value: number;
  max: number;
  size?: number;
  label?: string;
}) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return (
    <span
      className="relative inline-grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--hair) / var(--hair-a))"
          strokeWidth="3"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-iris)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
        />
      </svg>
      <span className="num absolute font-display text-xs text-ice">{value}</span>
      {label && <span className="slug slug-2 absolute -bottom-4">{label}</span>}
    </span>
  );
}
