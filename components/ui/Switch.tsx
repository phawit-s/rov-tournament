"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { sfx } from "@/lib/sound";

/**
 * สวิตช์กลางของทั้งเว็บ
 *
 * บอกสถานะเป็นตัวหนังสือในราง ไม่ใช่สีอย่างเดียว — สีทองบนธีมสว่างแยกยาก
 * ว่าเปิดหรือปิด และคนตาบอดสีก็อ่านไม่ออก
 * กล่องคลิกสูง 44px ตามขนาดนิ้วขั้นต่ำ
 */
export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** ข้อความอ่านให้โปรแกรมอ่านหน้าจอฟัง — ตัวสวิตช์เองไม่มีตัวหนังสือกำกับ */
  label: string;
  disabled?: boolean;
}) {
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        sfx.unlock();
        sfx.play("click");
        onChange(!checked);
      }}
      className="relative grid h-11 w-21 shrink-0 cursor-pointer place-items-center disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={`relative block h-7 w-full rounded-full transition-colors duration-300 ${
          checked ? "accent-fill" : "rule"
        }`}
      >
        <span
          className={`pointer-events-none absolute inset-y-0 flex items-center font-display text-eyebrow tracking-luxe ${
            checked ? "left-3 text-onaccent" : "right-3 text-muted"
          }`}
        >
          {checked ? "เปิด" : "ปิด"}
        </span>
        <motion.span
          layout={!reduced}
          transition={
            reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 34 }
          }
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? 60 : 4 }}
        />
      </span>
    </button>
  );
}

/**
 * สวิตช์แบบเต็มแถว — กดได้ทั้งแถว มีชื่อกับคำอธิบายอยู่ข้างใน
 *
 * ใช้กับรายการตั้งค่าที่เรียงกันเป็นลิสต์ ซึ่งพื้นที่กดควรเป็นทั้งแถว
 * ไม่ใช่เฉพาะตัวสวิตช์เล็กๆ ท้ายแถว
 */
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  className = "",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        sfx.unlock();
        sfx.play("click");
        onChange(!checked);
      }}
      className={`hover-tile tile flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-4 py-3 text-left transition-colors ${className}`}
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
          checked ? "accent-fill" : "rule"
        }`}
      >
        <motion.span
          layout={!reduced}
          transition={
            reduced ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 34 }
          }
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? 22 : 2 }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ice">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}
