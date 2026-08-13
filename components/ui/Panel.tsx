"use client";

import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
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
  accent = "169 155 255",
  style,
  interactive = true,
  tag,
  variant = "plain",
  state,
  ornament,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  /*
    ไฟนวลตามเมาส์ — เขียนค่าลง DOM อย่างมากเฟรมละครั้ง

    pointermove ยิงถี่กว่าอัตราเฟรมของจอ (เมาส์เกม 1000Hz ยิงได้พันครั้งต่อวินาที)
    ทุกครั้งที่เขียน --mx/--my เบราว์เซอร์ต้องคิดสไตล์ใหม่แล้ววาดไล่สีวงกลม
    340px ใหม่ทั้งวง เขียนสิบหกครั้งระหว่างสองเฟรมจึงเป็นการวาดทิ้งสิบห้าครั้ง

    เก็บตำแหน่งล่าสุดไว้ใน ref แล้วให้ rAF เป็นคนเขียนจริง — ได้ภาพเดียวกัน
    ด้วยงานเท่าจำนวนเฟรมที่วาดจริงเท่านั้น
  */
  const pending = useRef<{ x: number; y: number } | null>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const trackPointer = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    pending.current = { x: clientX - rect.left, y: clientY - rect.top };
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const spot = pending.current;
      const node = ref.current;
      if (!spot || !node) return;
      node.style.setProperty("--mx", `${spot.x}px`);
      node.style.setProperty("--my", `${spot.y}px`);
    });
  };

  const vars = {
    ["--accent"]: accent,
    ...(state ? { ["--st"]: `var(--st-${state})` } : null),
    ...style,
  } as CSSProperties;

  return (
    <div
      ref={ref}
      onPointerMove={
        /* เฉพาะเมาส์จริง — นิ้วบนจอสัมผัสไม่มี "ตำแหน่งตอนไม่ได้กด" อยู่แล้ว
           การไล่คำนวณให้จึงเป็นงานฟรีที่ไม่มีใครเห็นผล */
        interactive
          ? (e) => {
              if (e.pointerType === "touch") return;
              trackPointer(e.clientX, e.clientY);
            }
          : undefined
      }
      style={vars}
      className={`${LIFT[variant]} hairline-top ${interactive ? "spotlight" : ""} ${
        state ? "tally" : ""
      } ${state === "out" ? "state-out" : ""} relative rounded-2xl ${className}`}
    >
      {/*
        การ์ดตัวเอกไม่มีกรอบสีแล้ว

        เดิมมีขอบไล่สีรอบใบ ซึ่งตอนเป็นทองยังพอกลืน แต่พอเป็นม่วงสว่างมันกลายเป็น
        กรอบเรืองแสงรอบกล่องที่ดึงสายตาไปที่ "ขอบ" แทนที่จะเป็นของข้างใน
        และตีกับผิวกระจกฝ้าโดยตรง — กระจกจริงสว่างที่ขอบเพราะแสงหักเห ไม่ใช่เพราะ
        มีใครวาดเส้นสีล้อมไว้

        ความเป็นตัวเอกตอนนี้มาจากเงาที่ลอยกว่า (shadow-lift-3) กับเส้นแสงบางๆ
        ที่ขอบบน (.hairline-top) ซึ่งพอแล้วสำหรับการ์ดที่มีไม่เกินสองใบต่อหน้า
      */}
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
      <span className="rule-fade mt-3 block" />
    </div>
  );
}

Panel.Header = PanelHeader;
