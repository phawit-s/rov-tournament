"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { IconMore } from "./icons";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export type ActionItem = {
  label: string;
  Icon: IconType;
  onSelect: () => void;
  /** ลบ/เอาออก — ตัวหนังสือแดงแบบเมนูของ iOS */
  danger?: boolean;
  disabled?: boolean;
};

/**
 * ปุ่ม "…" ที่กางเมนูคำสั่งแบบ context menu ของ iOS
 * ชื่อคำสั่งซ้าย ไอคอนขวา คั่นด้วยเส้นบาง คำสั่งลบเป็นสีแดง
 *
 * ใช้แทนแถวปุ่มไอคอนเล็กๆ หลายปุ่มต่อแถว — ปุ่มไอคอนเปล่าไม่มีชื่อ อ่านยาก
 * กดพลาดง่าย และกินที่ชื่อเพลง (แถวคิวเคยมีสี่ปุ่ม: ขึ้นหัวคิว ขึ้น ลง ลบ)
 *
 * ไม่มีแอนิเมชันโดยตั้งใจ — หน้านี้เปิดค้างบนเครื่องที่กำลังเข้ารหัสสตรีม
 * เมนูขึ้นทันทีเบาที่สุด และกางขึ้นข้างบนเองถ้าใกล้ขอบล่างจอ
 */
export default function ActionMenu({
  label,
  items,
  className = "",
}: {
  /** ชื่อปุ่ม "…" สำหรับโปรแกรมอ่านจอและ tooltip */
  label: string;
  items: ActionItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [upward, setUpward] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={boxRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={() => {
          if (!open) {
            // วัดครั้งเดียวตอนกด — เหลือที่ข้างล่างไม่พอก็กางขึ้น
            const box = btnRef.current?.getBoundingClientRect();
            setUpward(!!box && window.innerHeight - box.bottom < 56 * items.length + 24);
          }
          setOpen((v) => !v);
        }}
        className={`grid h-11 w-11 cursor-pointer place-items-center rounded-full transition-colors ${
          open ? "bg-fill text-ink" : "text-muted hover:bg-fill hover:text-ink"
        }`}
      >
        <IconMore className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className={`absolute right-0 z-50 w-60 overflow-hidden rounded-[14px] bg-paper shadow-float ring-1 ring-line ${
            upward ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {items.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 px-4 text-left transition-colors hover:bg-fill disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent ${
                i > 0 ? "border-t border-line" : ""
              } ${item.danger ? "text-danger" : "text-ink"}`}
            >
              <span className="min-w-0 truncate">{item.label}</span>
              <item.Icon className="h-[18px] w-[18px] shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
