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
  /** มุมกรอบแบบ HUD */
  corners?: boolean;
  /** ป้ายกำกับเล็กๆ มุมบนขวา */
  tag?: string;
};

/** กล่องกระจกพร้อมขอบเรืองแสง มุม HUD และไฟสปอตไลต์ตามเมาส์ */
export default function Panel({
  children,
  className = "",
  accent = "34 211 238",
  style,
  interactive = true,
  corners = true,
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
      className={`glass neon-edge ${interactive ? "spotlight" : ""} relative rounded-3xl ${className}`}
    >
      {corners && (
        <>
          <span className="hud-corner tl" />
          <span className="hud-corner tr" />
          <span className="hud-corner bl" />
          <span className="hud-corner br" />
        </>
      )}

      {tag && (
        <span
          className="pointer-events-none absolute -top-2.5 right-6 rounded-md px-2 py-0.5 font-display text-[9px] tracking-[0.3em] backdrop-blur"
          style={{
            color: `rgb(${accent})`,
            background: `rgb(${accent} / 0.12)`,
            boxShadow: `inset 0 0 0 1px rgb(${accent} / 0.35)`,
          }}
        >
          {tag}
        </span>
      )}

      {children}
    </div>
  );
}
