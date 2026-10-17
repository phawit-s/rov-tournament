import type { ReactNode } from "react";

/**
 * หัวหน้าของทุกหน้าในสตูดิโอ — หัวข้อหนาใหญ่ คำอธิบายสั้น ปุ่มชิดขวา
 *
 * ไม่มีป้ายเล็กเหนือหัวข้อ (eyebrow ยังรับไว้ให้โค้ดเก่าแต่ไม่แสดง)
 * meta = ตัวเลข/สถานะสั้นๆ ข้างหัวข้อ เช่นจำนวนเพลงในคิว
 */
export default function PageHead({
  title,
  description,
  meta,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        <h1 className="text-headline font-bold">
          {title}
          {meta != null && <span className="num ml-3 text-title font-normal text-muted">{meta}</span>}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
