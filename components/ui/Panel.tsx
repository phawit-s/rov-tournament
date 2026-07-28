"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** "R G B" */
  accent?: string;
  style?: CSSProperties;
  interactive?: boolean;
  /** ป้ายกำกับตัวเล็กบนหัวการ์ด */
  tag?: string;
};

/** การ์ดพื้นผิวหรู: ขอบบาง เส้นทองพาดบน และไฟนวลตามเมาส์ */
export default function Panel({
  children,
  className = "",
  accent = "207 167 101",
  style,
  interactive = true,
  tag,
}: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

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
      style={{ ["--accent" as string]: accent, ...style }}
      className={`surface hairline-top ${interactive ? "spotlight" : ""} relative rounded-2xl ${className}`}
    >
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
