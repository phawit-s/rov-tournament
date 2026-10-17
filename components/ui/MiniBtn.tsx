"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { safeUrl } from "@/lib/safe";
import { toast } from "./Toast";
import { IconCheck, IconCopy, IconExternal } from "./icons";

/* ปุ่มเล็กพื้นเทา — สูง 36px ใช้ในแถวรายการกับแถบเครื่องมือ */
const SHAPE =
  "inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors";

const TONE = {
  plain: "bg-fill text-ink hover:bg-fill-2",
  danger: "bg-fill text-danger hover:bg-fill-2",
};

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
      aria-label={title}
      className={`${SHAPE} ${danger ? TONE.danger : TONE.plain} disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

/** ลิงก์ออกนอกเว็บหน้าตาเดียวกับ MiniBtn — เปิดแท็บใหม่เสมอ */
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
      <IconExternal className="h-3.5 w-3.5" />
      {children}
    </a>
  );
}

/** ปุ่มคัดลอก — เปลี่ยนเป็น "คัดลอกแล้ว" ชั่วครู่ ให้รู้ว่ากดติด */
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
          toast("คัดลอกไม่ได้ — เบราว์เซอร์ไม่ให้สิทธิ์คลิปบอร์ด ลองกดค้างที่ลิงก์แล้วคัดลอกเอง", "error");
        });
        setCopied(true);
        if (toastText) toast(toastText, "success", 1600);
        if (timer.current != null) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), 1600);
      }}
    >
      {copied ? (
        <IconCheck className="h-3.5 w-3.5" strokeWidth={2.2} />
      ) : (
        <IconCopy className="h-3.5 w-3.5" />
      )}
      {copied ? done : label}
    </MiniBtn>
  );
}
