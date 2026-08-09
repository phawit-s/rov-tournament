"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { safeUrl } from "@/lib/safe";
import { toast } from "./Toast";
import { IconCheck, IconCopy, IconExternal } from "./icons";

/**
 * ปุ่มรองขนาดเล็ก — ใช้กับงานที่ไม่ใช่ทางเดินหลักของการ์ด
 *
 * เคยมีสำเนาของปุ่มนี้อยู่สามไฟล์ (หน้าช่อง · คิวเพลง · แผงคลาวด์) ซึ่งค่อยๆ
 * เพี้ยนออกจากกันทีละนิดจนความสูงไม่เท่ากันเวลามาอยู่แถวเดียวกัน
 * ทางเดินหลักยังเป็น <Button> เหมือนเดิม ตัวนี้คือ "ทางเลือกรอง" เท่านั้น
 */
const TONE = {
  plain: "border-hair text-muted hover:text-iris",
  danger: "border-danger/25 text-danger/90 hover:bg-danger/10",
};

const SHAPE =
  "inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors";

export default function MiniBtn({
  children,
  onClick,
  danger = false,
  disabled = false,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${SHAPE} ${
        danger ? TONE.danger : TONE.plain
      } disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

/** ทรงเดียวกับ MiniBtn แต่เป็นลิงก์ออกนอกเว็บ — เปิดแท็บใหม่เสมอ */
export function MiniLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const safe = safeUrl(href);
  if (!safe) return null;
  return (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer noopener"
      className={`${SHAPE} ${TONE.plain} ${className}`}
    >
      <IconExternal className="h-3 w-3" />
      {children}
    </a>
  );
}

/**
 * ปุ่มคัดลอกข้อความ
 *
 * รวมไว้ที่เดียวเพราะทั้งเว็บมีที่ต้องคัดลอกลิงก์อยู่เกือบสิบจุด แล้วแต่ละจุด
 * เขียน state "คัดลอกแล้ว" กับ setTimeout ของตัวเอง ซึ่งลืมเคลียร์ตอน unmount
 * กันทุกที่ (กดคัดลอกแล้วปิดกล่องทันทีจะได้ warning เรื่อง setState หลัง unmount)
 */
export function CopyBtn({
  text,
  label = "คัดลอก",
  done = "คัดลอกแล้ว",
  toastText = "คัดลอกลิงก์แล้ว",
  className = "",
}: {
  text: string;
  label?: string;
  done?: string;
  /** null = ไม่ต้องเด้ง toast (ใช้ตอนมีปุ่มคัดลอกหลายอันเรียงกันในหน้าเดียว) */
  toastText?: string | null;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <MiniBtn
      className={className}
      onClick={() => {
        void navigator.clipboard.writeText(text).catch(() => {
          toast("คัดลอกไม่สำเร็จ — เบราว์เซอร์ไม่ให้สิทธิ์คลิปบอร์ด", "error");
        });
        setCopied(true);
        if (toastText) toast(toastText, "success", 1600);
        if (timer.current != null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? (
        <IconCheck className="h-3 w-3" strokeWidth={2} />
      ) : (
        <IconCopy className="h-3 w-3" />
      )}
      {copied ? done : label}
    </MiniBtn>
  );
}
