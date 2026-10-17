"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { safeUrl } from "@/lib/safe";

/* ---------------- ป้ายสถานะ ---------------- */

type BadgeTone = "neutral" | "open" | "live" | "danger" | "ink";

const BADGE: Record<BadgeTone, string> = {
  neutral: "bg-fill text-muted",
  open: "bg-open/12 text-open",
  live: "bg-live/12 text-live",
  danger: "bg-danger/12 text-danger",
  ink: "bg-ink text-onink",
};

/**
 * ป้ายแคปซูลเล็ก — บอกสถานะของแถว/ช่อง
 * ใช้สีสัญญาณสามตัวเท่านั้น (เปิดรับ / ไลฟ์ / ผิดพลาด) ที่เหลือเป็นเทา
 * `dot` = จุดนำหน้า ใช้กับสถานะที่ "กำลังเกิดอยู่ตอนนี้"
 */
export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className = "",
}: {
  children: ReactNode;
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ${BADGE[tone]} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** ป้าย "ไลฟ์อยู่" ที่กดแล้วพาไปดูไลฟ์ */
export function LiveBadge({ url, label = "ไลฟ์อยู่" }: { url: string; label?: string }) {
  const href = safeUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex min-h-6 shrink-0 items-center gap-1.5 rounded-full bg-live px-2.5 text-xs font-semibold text-white transition-opacity hover:opacity-85"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
      {label}
    </a>
  );
}

/* ---------------- ช่องกรอก ---------------- */

/** ชื่อช่องกรอก + คำอธิบายใต้ชื่อ */
export function Label({
  children,
  hint,
  htmlFor,
}: {
  children: ReactNode;
  hint?: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mb-2">
      <label htmlFor={htmlFor} className="block font-medium">
        {children}
      </label>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** ช่องที่ไม่ได้ระบุความกว้างเองให้เต็มแถว */
function widthClass(className: string): string {
  return /(^|\s)(w-|min-w-|max-w-|flex-1|shrink|grow)/.test(className) ? "" : "w-full";
}

const FIELD =
  "rounded-field bg-fill px-4 text-ink outline-none transition-[box-shadow,background-color] placeholder:text-faint focus:bg-canvas focus:shadow-[inset_0_0_0_2px_var(--c-ink)] aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--c-danger)] disabled:opacity-50";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return <input {...rest} className={`${FIELD} min-h-12 ${widthClass(className)} ${className}`} />;
}

/** ช่องตัวเลขที่ลบเลข 0 นำหน้าให้เอง และว่าง = 0 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  className = "",
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value === 0 ? "" : String(value)}
      onChange={(e) => {
        const raw = e.target.value.replace(/^0+(?=\d)/, "");
        const next = raw === "" ? 0 : Number(raw);
        if (!Number.isFinite(next)) return;
        onChange(Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, next)));
      }}
      className={`${FIELD} num min-h-12 ${widthClass(className)} ${className}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`${FIELD} resize-y py-3 leading-relaxed ${widthClass(className)} ${className}`}
    />
  );
}

/* ---------------- ว่าง / รอ ---------------- */

/**
 * หน้าว่าง — บอกว่าตอนนี้ไม่มีอะไร และต้องทำอะไรต่อ
 * พร็อพ art / no เป็นของดีไซน์เก่า รับไว้แต่ไม่แสดง
 */
export function EmptyState({
  title,
  description,
  action,
  className = "",
}: {
  art?: ReactNode;
  no?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-sheet bg-fill px-6 py-10 ${className}`}>
      <p className="text-lg font-bold">{title}</p>
      {description && <p className="mt-1.5 max-w-[46ch] text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <EmptyState title={children} />;
}

/** โครงจางระหว่างรอข้อมูล ให้เห็นรูปร่างปลายทางก่อน */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse rounded-thumb bg-fill ${className}`} aria-hidden />;
}

/** แปลง datetime-local <-> ISO */
export function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
