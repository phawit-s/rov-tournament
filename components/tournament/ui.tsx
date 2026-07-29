"use client";

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { motion } from "motion/react";
import { safeUrl } from "@/lib/safe";
import type { TournamentStatus } from "@/lib/tournament/types";
import { Meter } from "../ui/hud";
import { IconCheck } from "../ui/icons";

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
    <Badge
      rgb={meta.rgb}
      hex={meta.hex}
      tone={status === "running" ? "live" : status === "finished" ? "done" : "plain"}
    >
      {meta.label}
    </Badge>
  );
}

/** ป้ายสถานะทรงเดียวกันทั้งเว็บ — จุดนำหน้าบอกว่ากำลังเกิดขึ้น จบแล้ว หรือนิ่ง */
export function Badge({
  children,
  rgb,
  hex,
  tone = "plain",
  className = "",
}: {
  children: ReactNode;
  rgb: string;
  hex?: string;
  tone?: "plain" | "live" | "done";
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-display text-[11px] ${className}`}
      style={{
        color: hex ?? `rgb(${rgb})`,
        background: `rgb(${rgb} / 0.12)`,
        boxShadow: `inset 0 0 0 1px rgb(${rgb} / 0.3)`,
      }}
    >
      {tone === "live" && (
        <motion.span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: `rgb(${rgb})` }}
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
      )}
      {tone === "done" && <IconCheck className="h-3 w-3" strokeWidth={2} />}
      {tone === "plain" && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: `rgb(${rgb} / 0.8)` }}
        />
      )}
      {children}
    </span>
  );
}

const REG_STATUS: Record<string, { label: string; rgb: string; tone: "plain" | "live" | "done" }> =
  {
    pending: { label: "รอตรวจ", rgb: "230 200 148", tone: "plain" },
    approved: { label: "อนุมัติแล้ว", rgb: "77 181 145", tone: "done" },
    rejected: { label: "ปฏิเสธ", rgb: "224 86 107", tone: "plain" },
  };

/** แปลงสถานะใบสมัคร/โดเนทจากคำอังกฤษดิบเป็นป้ายภาษาไทย */
export function RegStatusBadge({ status }: { status: string }) {
  const meta = REG_STATUS[status] ?? {
    label: status,
    rgb: "155 160 179",
    tone: "plain" as const,
  };
  return (
    <Badge rgb={meta.rgb} tone={meta.tone}>
      {meta.label}
    </Badge>
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

/**
 * ช่องกรอกตัวเลข — โชว์ค่าว่างแทน 0
 * ถ้าปล่อยให้โชว์ 0 พอผู้ใช้พิมพ์ต่อท้ายจะกลายเป็น 0111
 */
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
  ratio,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  ratio?: number;
}) {
  return (
    <div className="min-w-0">
      <p className="font-display text-[10px] tracking-luxe text-muted uppercase">
        {label}
      </p>
      <p
        className={`num mt-1 font-display text-lg ${accent ? "text-champagne" : "text-ice"}`}
      >
        {value}
      </p>
      {ratio != null && <Meter pct={ratio} className="mt-2" />}
    </div>
  );
}

/** แถวสถิติที่มีเส้นตั้งคั่นแต่ละช่อง */
export function StatRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-4 divide-x divide-[rgb(var(--hair)/var(--hair-a))] [&>*:not(:first-child)]:pl-4 ${className}`}
    >
      {children}
    </div>
  );
}

/* ---------- ภาพประกอบสถานะว่าง ---------- */

const art = (children: ReactNode) => (
  <svg
    viewBox="0 0 120 120"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-30 w-30 text-champagne/45"
    aria-hidden
  >
    {children}
  </svg>
);

export const ArtBracket = () =>
  art(
    <>
      <path d="M14 26h22v22H14zM14 72h22v22H14zM58 49h22v22H58z" />
      <path d="M36 37h11v20h11M36 83h11V63h11M80 60h26" />
      <circle cx="110" cy="60" r="5" />
    </>,
  );

export const ArtCalendar = () =>
  art(
    <>
      <rect x="16" y="24" width="88" height="80" rx="8" />
      <path d="M16 46h88M38 14v20M82 14v20" />
      <path d="M34 62h12M56 62h12M78 62h12M34 84h12M56 84h12" />
    </>,
  );

export const ArtShield = () =>
  art(
    <>
      <path d="M60 14l34 12v28c0 22-14 38-34 46-20-8-34-24-34-46V26z" />
      <path d="M60 44v24M48 56h24" />
    </>,
  );

/** สถานะว่างที่ยังดูตั้งใจ — มีเลขบท ภาพประกอบ และทางไปต่อ */
export function EmptyState({
  art: illo,
  title,
  description,
  action,
  no,
}: {
  art?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  no?: string;
}) {
  return (
    <div className="sunken hairline-top relative overflow-hidden rounded-2xl px-6 py-14 text-center">
      {no && (
        <span className="fig text-outline pointer-events-none absolute right-4 bottom-[-0.12em] text-[7rem] opacity-[0.18] select-none">
          {no}
        </span>
      )}
      {illo && <div className="mb-5 flex justify-center opacity-90">{illo}</div>}
      <p className="font-display text-xl font-light text-ice">{title}</p>
      {description && (
        <p className="mx-auto mt-2 max-w-[42ch] text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <EmptyState title={children} />;
}

/** โครงจางระหว่างรอข้อมูล เห็นรูปร่างปลายทางก่อน */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      className={`tile block rounded-lg ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(90deg,transparent,rgb(var(--hair)/var(--hair-a)),transparent)",
        backgroundSize: "220% 100%",
        animation: "var(--animate-shimmer-slow)",
      }}
      aria-hidden
    />
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
