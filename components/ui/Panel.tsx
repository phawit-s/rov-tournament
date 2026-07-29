"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";
import RingCluster from "../fx/RingCluster";

type Variant = "plain" | "feature" | "quiet";
type State = "live" | "next" | "win" | "out" | "idle";

type Props = {
  children: ReactNode;
  className?: string;
  /** "R G B" */
  accent?: string;
  style?: CSSProperties;
  interactive?: boolean;
  /** ป้ายกำกับตัวเล็กบนหัวการ์ด */
  tag?: string;
  /**
   * ระดับวัสดุ — feature คือตัวเอกของหน้า (ห้ามเกิน 2 ใบต่อหน้า)
   * quiet คือบล็อกอ่านอย่างเดียว ไม่ต้องลอย
   */
  variant?: Variant;
  /** สถานะ ทำให้ได้ขีดสีชิดซ้ายอัตโนมัติ */
  state?: State;
  /** ของหมุนจางๆ หลังการ์ด */
  ornament?: "ring";
};

const LIFT: Record<Variant, string> = {
  plain: "surface shadow-lift-2",
  feature: "surface shadow-lift-3",
  quiet: "sunken",
};

/** การ์ดพื้นผิวหรู: ขอบบาง เส้นทองพาดบน และไฟนวลตามเมาส์ */
export default function Panel({
  children,
  className = "",
  accent = "207 167 101",
  style,
  interactive = true,
  tag,
  variant = "plain",
  state,
  ornament,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  const vars = {
    ["--accent"]: accent,
    ...(state ? { ["--st"]: `var(--st-${state})` } : null),
    ...style,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      onPointerMove={
        interactive
          ? (e) => {
              const el = ref.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
              el.style.setProperty("--my", `${e.clientY - rect.top}px`);
            }
          : undefined
      }
      style={vars}
      className={`${LIFT[variant]} hairline-top ${interactive ? "spotlight" : ""} ${
        state ? "tally" : ""
      } ${state === "out" ? "state-out" : ""} relative rounded-2xl ${className}`}
    >
      {/* ขอบทองไล่ระดับของการ์ดตัวเอก — วาดด้วย mask ไม่ใช้ backdrop-filter เพิ่ม */}
      {variant === "feature" && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] p-px"
          style={{
            backgroundImage:
              "linear-gradient(rgb(var(--tile)),rgb(var(--tile))), conic-gradient(from 210deg, rgb(var(--accent)/.7), transparent 40%, rgb(var(--accent)/.5))",
            backgroundOrigin: "border-box",
            WebkitMask:
              "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
          }}
        />
      )}

      {ornament === "ring" && (
        <RingCluster
          size={200}
          className="absolute -top-10 -right-10 opacity-[0.2]"
        />
      )}

      {tag && (
        <span
          className="pointer-events-none absolute top-4 right-5 font-display text-[10px] font-medium tracking-luxe uppercase"
          style={{ color: `rgb(${accent} / 0.65)` }}
        >
          {tag}
        </span>
      )}
      {children}
    </div>
  );
}

/** หัวการ์ดมาตรฐาน — แทน h3 มือเปล่าที่เขียนซ้ำอยู่หลายสิบจุด */
export function PanelHeader({
  eyebrow,
  title,
  count,
  action,
}: {
  eyebrow: string;
  title: string;
  count?: number | string | null;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="slug">{eyebrow}</p>
          <h3 className="mt-1.5 font-display text-lg font-medium text-ice">
            {title}
            {count != null && <span className="num ml-2 text-sm text-muted">{count}</span>}
          </h3>
        </div>
        {action}
      </div>
      <span className="rule mt-3 block h-px" />
    </div>
  );
}

Panel.Header = PanelHeader;
