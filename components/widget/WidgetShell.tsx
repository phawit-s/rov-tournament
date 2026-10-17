"use client";

import type { ReactNode } from "react";
import { useWidgetOptions } from "@/hooks/useWidgetOptions";

/**
 * ระยะขอบรอบ widget เป็นพิกเซล — ขนาด Browser Source ที่หน้าแจกลิงก์บอก
 * คือขนาดของ widget บวกขอบนี้สองด้าน (ดู SOURCE_SIZE ใน NowPlayingCard)
 */
export const SHELL_PAD = 12;

/**
 * สีของตัวหนังสือบน widget
 *
 * เขียนเป็น rgb() ตรงๆ ไม่ใช้คลาสแบบ text-white/70 ด้วยสองเหตุผล
 *   1. Tailwind v4 แปลงค่านั้นเป็น color-mix() ซึ่งเบราว์เซอร์ใน OBS รุ่นเก่า
 *      (CEF/Chromium 103) อ่านไม่ออก ตัวหนังสือจะกลายเป็นสีตั้งต้นของหน้า
 *   2. ค่าตรงๆ คิดคอนทราสต์ย้อนกลับได้ — พื้นการ์ดสว่างไม่เกิน ~0.11 เสมอ
 *      (ดู lookOf ใน NowPlayingCard) กรณีแย่สุดขาวล้วนได้ 6.6:1 ขาว 78% ได้ 4.8:1
 */
export const WIDGET_TEXT = {
  ink: "#ffffff",
  /** ตัวหนังสือรองทุกอย่างที่ต้องอ่าน — ศิลปิน คนขอ เวลา */
  soft: "rgb(255 255 255 / 0.78)",
  /**
   * เลขลำดับคิวเท่านั้น (กรณีแย่สุด ~4.2:1) — ห้ามใช้กับเนื้อหาที่ต้องอ่าน
   * เหมือน faint ของเว็บ เลขบอกลำดับซึ่งตำแหน่งแถวบอกอยู่แล้ว
   */
  faint: "rgb(255 255 255 / 0.7)",
  line: "rgb(255 255 255 / 0.12)",
};

/** พื้นการ์ดตอนไม่มีสีจากปกและไม่ได้ตั้งสีสำรอง — เทาเข้มกลางๆ อ่านออกทุกฉาก */
export const IDLE_SURFACE = "rgb(34 34 38)";

/** พื้นของโหมดพรีวิว (?solid=1) — เทาเข้มแทนฉากเกม ให้เห็นขอบการ์ดชัด */
const PREVIEW_BACKDROP = "rgb(58 58 64)";

/**
 * กรอบร่วมของ widget — คุมสเกลกับพื้นหลัง
 *
 * พื้นหลังโปร่งใสเป็นค่าเริ่มต้นเพื่อวางทับภาพเกมได้เลย
 * ไม่มีแอนิเมชันที่ชั้นนี้ — ของข้างในเล่นจังหวะเข้าเองตอนเพลงเปลี่ยน
 * (ถ้าที่นี่เล่นด้วย ครั้งแรกที่โผล่จะขยับซ้อนกันสองชั้น)
 */
export default function WidgetShell({ children }: { children: ReactNode }) {
  const { scale, solid } = useWidgetOptions();

  return (
    <div
      className="flex w-full items-start justify-start"
      style={{
        minHeight: "100vh",
        padding: SHELL_PAD,
        background: solid ? PREVIEW_BACKDROP : "transparent",
        color: WIDGET_TEXT.ink,
      }}
    >
      {/*
        ย่อ/ขยายด้วย transform ไม่ใช่ zoom หรือเปลี่ยนขนาดตัวอักษร
        เบราว์เซอร์วาดใหม่ครั้งเดียวที่ความละเอียดใหม่ ตัวหนังสือคมเหมือนเดิม
        (ต่างจากการลากยืดกรอบใน OBS ซึ่งขยายภาพที่วาดเสร็จแล้ว ได้ตัวหนังสือเบลอ)
      */}
      <div style={scale !== 1 ? { transform: `scale(${scale})`, transformOrigin: "top left" } : undefined}>
        {children}
      </div>
    </div>
  );
}

/**
 * ข้อความบอกว่าทำไม widget ถึงว่างเปล่า
 *
 * ลิงก์ที่ตั้งค่าผิด (ลืมใส่รหัสช่อง / โปรแกรมสตรีมตัด #hash ทิ้ง / ต่อฐานข้อมูลไม่ติด)
 * ถ้าปล่อยเป็นหน้าว่าง คนตั้งค่าจะเข้าใจว่า widget พังแล้วไล่แก้ผิดจุด
 *
 * setup = ตั้งค่าผิดจนไม่มีวันทำงานได้ ให้โชว์เสมอ ถ้ามันโผล่บนสตรีม
 *         แปลว่าอันนั้นพังอยู่แล้ว เห็นดีกว่าไม่เห็น
 * ไม่ใส่ = แค่ยังไม่มีข้อมูลตอนนี้ (คิวว่าง) โชว์เฉพาะโหมดพรีวิว
 *         บนสตรีมห้ามโผล่ เพราะเดี๋ยวข้อมูลก็มาเอง
 */
export function WidgetHint({
  children,
  title,
  setup = false,
}: {
  children: ReactNode;
  title: string;
  setup?: boolean;
}) {
  const { solid } = useWidgetOptions();
  if (!solid && !setup) return null;

  return (
    <div
      className="rounded-sheet px-5 py-4 [&_code]:rounded-[6px] [&_code]:bg-[rgb(255_255_255/0.14)] [&_code]:px-1.5 [&_code]:text-[14px] [&_code]:text-white"
      style={{
        // กว้างพอดีกรอบ Browser Source ที่เล็กที่สุด (การ์ดนอน 500px) ไม่ล้นออกขวา
        width: `min(560px, calc(100vw - ${SHELL_PAD * 2}px))`,
        background: IDLE_SURFACE,
        boxShadow: `inset 0 0 0 1px ${WIDGET_TEXT.line}`,
      }}
    >
      <p className="text-[18px] leading-[1.3] font-bold">{title}</p>
      <div className="mt-1.5 text-[15px] leading-[1.55]" style={{ color: WIDGET_TEXT.soft }}>
        {children}
      </div>
    </div>
  );
}
