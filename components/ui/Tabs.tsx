"use client";

import type { ReactNode } from "react";

export type TabItem<K extends string = string> = {
  key: K;
  label: string;
  /** ตัวเลขต่อท้ายชื่อแท็บ — ส่ง null เมื่อไม่อยากให้โชว์ */
  count?: number | null;
  /** มีของค้างรออยู่ — จุดแดงเล็กหน้าชื่อ (ค่าสีเก่า "R G B" ไม่ใช้แล้ว ขอแค่มีค่า) */
  dot?: string;
  icon?: ReactNode;
};

type Size = "sm" | "md";

const SIZE: Record<Size, string> = {
  sm: "min-h-9 px-3.5 text-sm",
  md: "min-h-10 px-4 text-[0.94rem]",
};

/**
 * ตัวเลือกแบบแบ่งช่อง (segmented control)
 * รางเทา ช่องที่เลือกเป็นพื้นขาวลอยขึ้นมา (มืด = เทาเข้ม) ตัวหนังสือหนาขึ้น
 */
export default function Tabs<K extends string>({
  items,
  value,
  onChange,
  size = "sm",
  grow = true,
  label,
  className = "",
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  size?: Size;
  /** true = ทุกช่องกว้างเท่ากันเต็มแถว, false = กว้างตามชื่อแล้วเลื่อนแนวนอน */
  grow?: boolean;
  /** ของเดิม — ไม่ใช้แล้ว */
  bare?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`no-scrollbar flex gap-0.5 overflow-x-auto rounded-full bg-fill p-1 ${className}`}
    >
      {items.map((item) => {
        const on = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(item.key)}
            className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full whitespace-nowrap transition-colors ${
              grow ? "flex-1" : ""
            } ${SIZE[size]} ${
              on
                ? "bg-canvas font-semibold text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12)] dark:bg-fill-2"
                : "text-muted hover:text-ink"
            }`}
          >
            {item.dot && <span className="h-1.5 w-1.5 rounded-full bg-live" aria-hidden />}
            {item.icon}
            {item.label}
            {item.count != null && (
              <span className={`num ${on ? "text-muted" : "text-faint"}`}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** แท็บที่ติดหัวจอตอนเลื่อน — ใช้กับหน้ายาวที่มีหลายส่วน */
export function StickyTabs<K extends string>(props: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="sticky top-16 z-30 -mx-1 bg-canvas/90 px-1 py-2 backdrop-blur">
      <Tabs {...props} size="md" grow />
    </div>
  );
}
