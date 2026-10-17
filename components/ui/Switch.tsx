"use client";

import type { ReactNode } from "react";

/** สวิตช์เปิด/ปิด — เปิด = รางดำ (มืด = ขาว) ปุ่มกลมเลื่อนไปขวา */
export default function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** ข้อความให้โปรแกรมอ่านหน้าจอ — ตัวสวิตช์ไม่มีตัวหนังสือกำกับ */
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      /* กล่องกด 44px ตัวสวิตช์จริง 30px อยู่ตรงกลาง */
      className="grid h-11 w-14 shrink-0 cursor-pointer place-items-center disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Track checked={checked} />
    </button>
  );
}

function Track({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative block h-7.5 w-12.5 rounded-full transition-colors duration-200 ${
        checked ? "bg-ink" : "bg-fill-2"
      }`}
    >
      <span
        className={`absolute top-0.75 left-0.75 h-6 w-6 rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out ${
          checked ? "translate-x-5 bg-onink" : "translate-x-0 bg-white"
        }`}
      />
    </span>
  );
}

/** แถวตั้งค่าที่กดได้ทั้งแถว — ชื่อซ้าย คำอธิบายใต้ชื่อ สวิตช์ขวา */
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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex w-full cursor-pointer items-center justify-between gap-4 py-3 text-left ${className}`}
    >
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-sm text-muted">{hint}</span>}
      </span>
      <Track checked={checked} />
    </button>
  );
}
