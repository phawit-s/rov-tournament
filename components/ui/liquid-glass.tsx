import type { CSSProperties, ReactNode } from "react";

/**
 * กระจกเหลว (liquid glass) — วัสดุของ "ของที่ลอยทับเนื้อหา"
 *
 * ต่างจากกระจกฝ้าเดิมตรงที่ของข้างหลังไม่ได้แค่มัวลง แต่ถูก "บิด" ออกจาก
 * ตำแหน่งเดิมด้วย เหมือนมองผ่านเลนส์ที่หนาไม่เท่ากันทั้งแผ่น — ความบิดนี่แหละ
 * คือสิ่งที่ทำให้ตาอ่านมันเป็นแก้ว ไม่ใช่แผ่นพลาสติกขุ่น
 *
 * ไฟล์นี้คุมแค่ "โครงสี่ชั้น" ส่วนสี/ความหนา/ขอบ อยู่ที่ .liquid-glass* ใน
 * globals.css เพราะทั้งหมดต้องพลิกตามธีมสว่าง/มืด ซึ่งเขียนเป็น inline style
 * ไม่ได้ (ดูค่าจริงและเหตุผลของแต่ละชั้นได้ที่นั่น)
 *
 * ไม่มี "use client" เพราะไม่มี state/handler เลย จะถูกเรียกจากทั้งฝั่ง
 * server (layout) และ client (NavBar) ก็ได้โดยไม่ต้องแบก JS เพิ่ม
 */

type GlassEffectProps = {
  children: ReactNode;
  /** คลาสของตัวกระจกเอง — ใส่รัศมีมุมกับระยะขอบในตรงนี้ */
  className?: string;
  /** คลาสของชั้นเนื้อหาข้างใน — ใส่ flex/grid ของข้างในตรงนี้ */
  contentClassName?: string;
  style?: CSSProperties;
  href?: string;
  target?: string;
};

export function GlassEffect({
  children,
  className = "",
  contentClassName = "",
  style,
  href,
  target = "_blank",
}: GlassEffectProps) {
  const content = (
    <div
      className={`liquid-glass relative overflow-hidden ${className}`}
      style={style}
    >
      {/*
        สี่ชั้นนี้ต้องเรียงตามนี้เท่านั้น: ฝ้า -> บิด -> สีทับ -> แสงที่ขอบ
        ถ้าสลับ สีทับจะไปกลบแสงขอบ แล้วกระจกจะแบนทันที

        ที่ต้องแยก "ฝ้า" กับ "บิด" เป็นคนละชั้น ทั้งที่เขียนรวมใน backdrop-filter
        เส้นเดียวได้ เพราะเบราว์เซอร์ที่ทำ SVG filter บน backdrop ไม่ได้จะทิ้ง
        ทั้งเส้น ไม่ใช่แค่ทิ้ง url() (เจอกับ Chrome ที่วาดด้วย CPU: เบลอหายเกลี้ยง
        เหลือตัวหนังสือข้างหลังคมชัดทะลุขึ้นมาบนแถบเมนู) รวมเส้นเดียวเมื่อไหร่
        ฝ้าก็หายไปพร้อมกัน แยกไว้แบบนี้อย่างแย่ที่สุดคือไม่บิด แต่ยังเป็น
        กระจกฝ้าที่อ่านออกเสมอ
      */}
      <div aria-hidden className="liquid-glass-frost" />
      <div aria-hidden className="liquid-glass-warp" />
      <div aria-hidden className="liquid-glass-tint" />
      <div aria-hidden className="liquid-glass-rim" />

      <div className={`relative z-30 ${contentClassName}`}>{children}</div>
    </div>
  );

  return href ? (
    <a href={href} target={target} rel="noopener noreferrer" className="block">
      {content}
    </a>
  ) : (
    content
  );
}

/**
 * ตัวบิดภาพ — ต้องมีอยู่ในหน้าเดียวกับกระจก ไม่งั้น backdrop-filter ของชั้น warp
 * ชี้ไปที่ที่ไม่มีอะไร แล้วกระจกจะเหลือแค่เบลอเฉยๆ (ไม่พัง แค่แบน)
 * วางไว้ใน layout ชั้นบนสุดครั้งเดียวพอ ทั้งเว็บใช้ตัวเดียวกัน
 *
 * ตัดชั้น feComponentTransfer / feSpecularLighting ของต้นฉบับออก — ผลของสองตัวนั้น
 * ไม่ได้ถูกใช้ต่อ (ตัวปิดท้ายคือ feDisplacementMap ที่กิน SourceGraphic กับ softMap
 * เท่านั้น) แต่ GPU ต้องคำนวณให้ใหม่ทุกเฟรมที่แถบเมนูเลื่อน
 */
export function GlassFilter() {
  return (
    <svg aria-hidden focusable="false" style={{ display: "none" }}>
      <filter
        id="glass-distortion"
        x="0%"
        y="0%"
        width="100%"
        height="100%"
        filterUnits="objectBoundingBox"
      >
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.001 0.005"
          numOctaves="1"
          seed="17"
          result="turbulence"
        />
        {/* เบลอแผนที่ก่อนเอาไปบิด ไม่งั้นได้ขอบหยักเป็นฟันเลื่อยแทนคลื่นแก้ว */}
        <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="softMap"
          scale="110"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}
