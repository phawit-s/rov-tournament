"use client";

import type { ReactNode } from "react";

/**
 * หัวหน้าเพจของหลังบ้าน — เตี้ยกว่าของหน้าสาธารณะมาก
 *
 * หน้าสาธารณะใช้ PageHeading ที่มีเลขบทตัวโตกับพาดหัวขนาด clamp(2.8rem, …)
 * ซึ่งเหมาะกับหน้าที่คนเปิดมาดูครั้งเดียว แต่ในหลังบ้านมันกินความสูงเกือบ 200px
 * ก่อนถึงเนื้อหาแถวแรก — ทุกครั้งที่สลับหน้า ต้องเลื่อนลงมาหาของที่มาทำ
 * และแถบบนก็บอกชื่อหน้าซ้ำอยู่แล้ว
 *
 * ที่นี่จึงเหลือแค่สิ่งที่ยังต้องมี: ชื่อหน้า คำอธิบายหนึ่งบรรทัด ตัวเลขสรุป
 * และปุ่มหลักของหน้า วางบนเส้นเดียวกัน ปิดท้ายด้วยเส้นบางคั่นจากเนื้อหา
 */
export default function PageHead({
  eyebrow,
  title,
  description,
  meta,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  /** ตัวเลขสรุปสั้นๆ เช่น "12 รายการ · กำลังแข่ง 2" */
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-b border-hair pb-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && <p className="slug">{eyebrow}</p>}
          <h1 className="mt-1.5 font-display text-2xl leading-tight font-light text-ice sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>

        {(action || meta) && (
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {meta && (
              <span className="num font-display text-xs text-muted">{meta}</span>
            )}
            {action}
          </div>
        )}
      </div>
    </div>
  );
}
