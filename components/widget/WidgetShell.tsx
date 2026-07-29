"use client";

import type { ReactNode } from "react";
import { useWidgetOptions } from "@/hooks/useLiveTournament";

/**
 * กรอบร่วมของทุก widget — คุมสเกลและพื้นหลัง
 * ค่าเริ่มต้นพื้นหลังโปร่งใสเพื่อวางทับสตรีมได้เลย
 */
export default function WidgetShell({
  children,
  align = "start",
}: {
  children: ReactNode;
  align?: "start" | "center";
}) {
  const { scale, solid } = useWidgetOptions();

  return (
    <div
      className={`flex min-h-dvh w-full p-3 ${
        align === "center" ? "items-center justify-center" : "items-start justify-start"
      }`}
      style={{ background: solid ? "#0a0a0e" : "transparent" }}
    >
      <div
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        className="origin-top-left"
      >
        {children}
      </div>
    </div>
  );
}

/** กล่องพื้นหลังของ widget ที่อ่านง่ายบนภาพเกม */
export function WidgetCard({
  children,
  className = "",
  accent,
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl px-6 py-4 ${className}`}
      style={{
        background: "linear-gradient(180deg, rgba(12,12,18,0.94), rgba(8,8,12,0.9))",
        boxShadow: `0 0 0 1px ${accent ?? "rgba(230,200,148,0.35)"}, 0 22px 60px -26px rgba(0,0,0,0.95)`,
        backdropFilter: "blur(6px)",
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent ?? "#e6c894"}, transparent)`,
        }}
      />
      {children}
    </div>
  );
}

/** ข้อความบอกสถานะตอนยังไม่มีข้อมูล — โชว์เฉพาะโหมดพื้นทึบ จะได้ไม่ไปโผล่บนสตรีม */
export function WidgetHint({ children }: { children: ReactNode }) {
  const { solid } = useWidgetOptions();
  if (!solid) return null;
  return (
    <div className="rounded-xl border border-dashed border-white/20 px-6 py-4 font-display text-sm text-white/60">
      {children}
    </div>
  );
}
