import type { CSSProperties, ReactNode } from "react";

/**
 * แผ่นจัดกลุ่ม — ใช้เมื่อจำเป็นต้องล้อมของหลายชิ้นให้อ่านเป็นก้อนเดียว
 *
 * ตั้งใจให้เรียบที่สุด: ไม่มีเงา (ของที่วางบนพื้นไม่ลอย) ขอบบางหรือพื้นเทาอย่างใดอย่างหนึ่ง
 *   plain / feature  ขอบบาง พื้นเดียวกับหน้า
 *   quiet            พื้นเทา ไม่มีขอบ — กลุ่มย่อยที่อยู่ในกลุ่มอีกที
 *
 * ก่อนใช้ ถามตัวเองก่อนว่าแถว + เส้นคั่นพอไหม (docs/DESIGN.md ข้อ 3)
 * พร็อพ accent / interactive / tag / state / ornament เป็นของดีไซน์เก่า รับไว้แต่ไม่ใช้
 */
type Variant = "plain" | "feature" | "quiet";

type Props = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  variant?: Variant;
  accent?: string;
  interactive?: boolean;
  tag?: string;
  state?: string;
  ornament?: string;
};

const LOOK: Record<Variant, string> = {
  plain: "border border-line",
  feature: "border border-line",
  quiet: "bg-fill",
};

export default function Panel({ children, className = "", style, variant = "plain" }: Props) {
  return (
    <div className={`relative rounded-sheet ${LOOK[variant]} ${className}`} style={style}>
      {children}
    </div>
  );
}

/**
 * หัวกลุ่ม — หัวข้อหนาบรรทัดเดียว ตัวเลขจำนวนต่อท้าย ปุ่มชิดขวา
 * eyebrow รับไว้ให้โค้ดเก่าแต่ไม่แสดง (ป้ายเล็กเหนือหัวข้อไม่บอกอะไรเพิ่ม)
 */
export function PanelHeader({
  title,
  count,
  action,
  description,
}: {
  eyebrow?: string;
  title: ReactNode;
  count?: number | string | null;
  action?: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-title font-bold">
          {title}
          {count != null && <span className="num ml-2 font-normal text-muted">{count}</span>}
        </h3>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

Panel.Header = PanelHeader;
