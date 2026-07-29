"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { motion } from "motion/react";
import { safeUrl } from "@/lib/safe";
import type { TournamentStatus } from "@/lib/tournament/types";

export const STATUS_META: Record<
  TournamentStatus,
  { label: string; rgb: string; hex: string }
> = {
  draft: { label: "ร่าง", rgb: "155 160 179", hex: "#9ba0b3" },
  registration: { label: "เปิดรับสมัคร", rgb: "109 146 219", hex: "#6d92db" },
  ready: { label: "ปิดรับแล้ว", rgb: "221 175 100", hex: "#ddaf64" },
  running: { label: "กำลังแข่ง", rgb: "77 181 145", hex: "#4db591" },
  finished: { label: "จบแล้ว", rgb: "160 121 216", hex: "#a079d8" },
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px]"
      style={{
        color: meta.hex,
        background: `rgb(${meta.rgb} / 0.12)`,
        boxShadow: `inset 0 0 0 1px rgb(${meta.rgb} / 0.3)`,
      }}
    >
      {meta.label}
    </span>
  );
}

export function LiveBadge({ url, title }: { url: string; title?: string }) {
  const href = safeUrl(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#e0566b]/15 px-3 py-1 font-display text-[11px] text-[#e0566b] transition-colors hover:bg-[#e0566b]/25"
      style={{ boxShadow: "inset 0 0 0 1px rgba(224,86,107,0.35)" }}
    >
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-[#e0566b]"
        animate={{ opacity: [1, 0.25, 1] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />
      LIVE{title ? ` · ${title}` : ""}
    </a>
  );
}

export function Label({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-2">
      <p className="text-sm font-medium text-ice/85">{children}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * ถ้าผู้เรียกกำหนดความกว้างมาเอง ต้องไม่ใส่ w-full ให้
 * ไม่งั้นสองคลาสจะชนกันแล้วผลลัพธ์ขึ้นกับลำดับใน stylesheet ไม่ใช่ลำดับที่เขียน
 */
function widthClass(className: string): string {
  return /(^|\s)(w-|min-w-|max-w-|flex-1|shrink|grow)/.test(className)
    ? ""
    : "w-full";
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`field ${widthClass(className)} rounded-xl px-3.5 py-2.5 text-sm text-ice outline-none placeholder:text-muted/80 ${className}`}
    />
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = "", ...rest } = props;
  return (
    <textarea
      {...rest}
      className={`field ${widthClass(className)} resize-y rounded-xl px-3.5 py-2.5 text-sm text-ice outline-none placeholder:text-muted/80 ${className}`}
    />
  );
}

export function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="font-display text-[10px] tracking-luxe text-muted uppercase">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-lg ${accent ? "text-champagne" : "text-ice"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-xl tile-dashed px-6 py-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}

/** แปลง datetime-local <-> ISO */
export function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
