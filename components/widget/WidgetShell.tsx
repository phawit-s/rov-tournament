"use client";

import type { CSSProperties, ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import { useWidgetOptions } from "@/hooks/useLiveTournament";
import Corners from "@/components/ui/Corners";

/** "#a99bff" -> "169 155 255" ใช้ป้อนโทเคน --accent ที่คลาสกลางทั้งเว็บอ่าน */
function rgbTriplet(hex: string): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6).padEnd(6, "0");
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return "169 155 255";
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/**
 * widget ลอยอยู่บนภาพเกมเสมอ จึงต้องล็อกโทเคนโทนมืดไว้ในตัวเอง
 * ไม่งั้นคนที่ตั้งเว็บเป็นธีมสว่างจะได้ widget สีน้ำตาลอ่อนจมหายไปกับฉาก
 * และตั้ง --accent เป็นสีที่ผู้ใช้เลือก คลาสกลาง (.slug .tally .rule / Corners) จะเปลี่ยนตามให้เอง
 */
function widgetTokens(accent: string): CSSProperties {
  return {
    "--accent": rgbTriplet(accent),
    "--hair": "255 255 255",
    "--hair-a": "0.12",
    "--tile": "255 255 255",
    "--tile-a": "0.05",
    "--field": "0 0 0",
    "--field-a": "0.3",
    "--sunken": "0 0 0",
    "--sunken-a": "0.35",
    "--st-live": "255 91 122",
    "--st-next": "169 155 255",
    "--st-win": "52 227 176",
    "--st-out": "126 130 153",
    "--st-idle": "138 142 168",
    "--color-ice": "#e7e9f5",
    "--color-muted": "#8a8ea8",
    "--color-iris": "#a99bff",
    "--color-gold": "#7c6cf5",
    "--color-iris-deep": "#4b3dbf",
    "--color-platinum": "#c7cce4",
  } as CSSProperties;
}

/**
 * กรอบร่วมของทุก widget — คุมสเกล พื้นหลัง และจังหวะเข้าฉาก
 * ค่าเริ่มต้นพื้นหลังโปร่งใสเพื่อวางทับสตรีมได้เลย
 */
export default function WidgetShell({
  children,
  align = "start",
}: {
  children: ReactNode;
  align?: "start" | "center";
}) {
  const { scale, solid, accent } = useWidgetOptions();
  const reduced = useReducedMotion();

  return (
    <div
      className={`flex min-h-dvh w-full p-3 ${
        align === "center" ? "items-center justify-center" : "items-start justify-start"
      }`}
      style={{
        ...widgetTokens(accent),
        background: solid ? "#07080f" : "transparent",
        colorScheme: "dark",
      }}
    >
      <div
        style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
        className="origin-top-left"
      >
        {/*
          ม่านกวาดซ้าย→ขวาตอนสลับซีนใน OBS แทนที่จะโผล่พรึ่บ

          เคยทำด้วย motion โดยตั้ง initial เป็น opacity 0 + clip-path ปิดสนิท
          แล้วให้ JS ค่อยเปิดออก — ซึ่งแปลว่า "มองเห็น widget ไหม" ไปขึ้นอยู่กับว่า
          แอนิเมชันวิ่งจนจบหรือเปล่า พอมันไม่วิ่ง (แท็บหลังบ้าน rAF ถูกพัก /
          เบราว์เซอร์ interpolate clip-path ไม่ได้) widget จะค้างที่ opacity 0
          ทั้งที่โค้ดรันครบ ข้อมูลมาครบ รูปโหลดครบ — เห็นเป็นจอขาวเปล่าโดยไม่มีอะไรบอก
          (เจอของจริง: network 200 ทุกเส้น รูปปกโหลดสำเร็จ แต่จอขาว)

          เปลี่ยนมาใช้ CSS ที่ "สถานะปกติคือมองเห็น" แล้วแอนิเมชันแค่วิ่งผ่าน
          ถ้ามันไม่วิ่งด้วยเหตุใดก็ตาม ผลคือเห็น widget ตามปกติ ไม่ใช่หายไปเลย
          และตัดเบลอออกด้วย — มันบังคับวาดใหม่ทุกเฟรม ผิดกติกาที่ widget ตั้งไว้เอง
        */}
        <div className={reduced ? undefined : "widget-enter"}>{children}</div>
      </div>
    </div>
  );
}

export type WidgetFrame = "plate" | "bar" | "crest";

/**
 * กล่องพื้นหลังของ widget ที่อ่านง่ายบนภาพเกม
 * frame คือทรงของกราฟิกแพ็กเกจ — plate (มุมตัดเฉียงแบบแผ่นป้าย),
 * bar (แถบเตี้ยสำหรับสกอร์/คิว), crest (ทรงสูงมีปีกสำหรับแชมป์/แจ้งเตือน)
 *
 * ไม่ตั้ง padding ให้เอง เพราะแต่ละ widget ต้องการระยะไม่เท่ากัน
 * และการทับ px-/py- จากภายนอกใน Tailwind ลำดับไม่แน่นอน
 */
export function WidgetCard({
  children,
  className = "",
  accent,
  frame = "plate",
}: {
  children: ReactNode;
  className?: string;
  accent?: string;
  frame?: WidgetFrame;
}) {
  const a = accent ?? "#a99bff";
  const chamfered = frame === "plate";
  const shape = chamfered
    ? "chamfer"
    : frame === "crest"
      ? "rounded-3xl"
      : "rounded-2xl";

  return (
    /*
      ไม่มีเงาทอดออกนอกกล่องโดยตั้งใจ

      พื้นหลัง widget โปร่งใส เงาจึงไม่ได้ตกลงบนอะไรเลย มันแค่ย้อมภาพเกม
      ที่อยู่ข้างหลังให้เป็นคราบดำฟุ้งตามรูปกล่อง ซึ่งเห็นชัดมากตอนวางบนฉากสว่าง
      ขอบกล่องอ่านออกอยู่แล้วจากเส้นขอบสีเน้นกับพื้นเข้มด้านใน
    */
    <div className="relative">
      <div
        className={`relative overflow-hidden ${shape} ${className}`}
        style={{
          background: "linear-gradient(180deg, rgba(12,12,18,0.94), rgba(8,8,12,0.9))",
          boxShadow: chamfered
            ? `inset 0 0 0 1px ${a}55, inset 0 0 0 3px rgb(0 0 0 / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.14)`
            : `0 0 0 1px ${a}55, inset 0 0 0 1px rgb(255 255 255 / 0.07), inset 0 1px 0 rgb(255 255 255 / 0.14)`,
          backdropFilter: "blur(6px)",
        }}
      >
        {/* แสงฟุ้งสีเน้นที่ขอบบน ทำให้การ์ดดูมีแหล่งไฟจริง */}
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-24"
          style={{
            background: `radial-gradient(120% 100% at 50% 0%, ${a}, transparent 70%)`,
            opacity: 0.12,
          }}
        />
        <span
          className="pointer-events-none absolute inset-x-8 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${a}, transparent)`,
          }}
        />
        <span className="grain pointer-events-none absolute inset-0 opacity-[0.32] mix-blend-overlay" />

        {chamfered && (
          <span className="pointer-events-none absolute inset-2">
            <Corners len={14} o={0.55} />
          </span>
        )}

        {frame === "crest" && <CrestWings accent={a} />}

        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

/** ปีกซ้าย-ขวาของทรงโล่ ใช้บอกว่านี่คือการ์ดพิธีการ ไม่ใช่แถบข้อมูล */
function CrestWings({ accent }: { accent: string }) {
  const wing = `linear-gradient(180deg, transparent, ${accent}, transparent)`;
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      <span
        className="absolute top-1/2 left-0 h-2/5 w-1 -translate-y-1/2"
        style={{ background: wing, opacity: 0.6 }}
      />
      <span
        className="absolute top-1/2 right-0 h-2/5 w-1 -translate-y-1/2"
        style={{ background: wing, opacity: 0.6 }}
      />
      <span
        className="absolute top-0 left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45"
        style={{ background: accent, opacity: 0.75 }}
      />
    </span>
  );
}

/**
 * ข้อความบอกว่าทำไม widget ถึงว่างเปล่า
 *
 * เดิมโชว์เฉพาะโหมดพื้นทึบ เพราะกลัวไปโผล่บนสตรีม — แต่ผลคือลิงก์ที่ตั้งค่าผิด
 * (ลืมใส่รหัสช่อง / โปรแกรมสตรีมตัด #hash ทิ้ง) กลายเป็นหน้าขาวเปล่าๆ
 * ไม่มีอะไรบอกเลยสักตัว คนตั้งค่าเลยเข้าใจว่า widget พัง แล้วไล่แก้ผิดจุด
 *
 * ตัวนี้ขึ้นเฉพาะกรณีที่ตั้งค่าผิดจนไม่มีวันทำงานได้ ไม่ใช่ตอนคิวว่างชั่วคราว
 * — ถ้ามันโผล่บนสตรีม แปลว่าอันนั้นพังอยู่แล้ว เห็นดีกว่าไม่เห็น
 */
export function WidgetHint({
  children,
  title = "ยังไม่มีข้อมูล",
  setup = false,
}: {
  children: ReactNode;
  title?: string;
  /**
   * true = ตั้งค่าผิดจนไม่มีวันทำงานได้ (ลืมใส่รหัสช่อง ฯลฯ) ให้โชว์เสมอ
   * false = แค่ยังไม่มีข้อมูลตอนนี้ (ยังไม่มีแชมป์ ยังไม่มีแมตช์)
   *         อันนี้ห้ามโชว์บนสตรีม เพราะเดี๋ยวข้อมูลก็มาเอง
   */
  setup?: boolean;
}) {
  const { solid, accent } = useWidgetOptions();
  if (!solid && !setup) return null;

  return (
    <WidgetCard accent={accent} frame="plate" className="max-w-140 px-7 py-6">
      <p className="slug">Widget</p>
      <p className="mt-2 font-display text-lg text-white">{title}</p>
      <div className="mt-2 text-sm leading-relaxed text-white/60">{children}</div>
    </WidgetCard>
  );
}
