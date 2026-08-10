"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import RingCluster from "../fx/RingCluster";
import SectionHead from "./SectionHead";

type Props = {
  children: ReactNode;
  /** ลำดับที่ ใช้ทำให้ของโผล่ไล่กันทีละชิ้น */
  index?: number;
  /** ทิศที่เลื่อนเข้ามา */
  from?: "up" | "left" | "right" | "scale";
  className?: string;
  /** เล่นซ้ำทุกครั้งที่เลื่อนกลับมาเห็น */
  repeat?: boolean;
};

const OFFSET = {
  up: { y: 26, x: 0, scale: 1 },
  left: { y: 0, x: -26, scale: 1 },
  right: { y: 0, x: 26, scale: 1 },
  scale: { y: 12, x: 0, scale: 0.97 },
};

/**
 * ค่อยๆ เผยเนื้อหาตอนเลื่อนหน้ามาถึง
 * ใช้ whileInView ของ motion แทน IntersectionObserver เอง
 */
export default function Reveal({
  children,
  index = 0,
  from = "up",
  className,
  repeat = false,
}: Props) {
  const reduced = useReducedMotion();
  const offset = OFFSET[from];

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, y: 0, x: 0, scale: 1 }}
      viewport={{ once: !repeat, amount: 0.2, margin: "0px 0px -60px 0px" }}
      transition={{
        duration: 0.7,
        delay: Math.min(index * 0.06, 0.4),
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}

/** เลขบทประจำหน้า ให้ทั้งเว็บอ่านเหมือนสูจิบัตรเล่มเดียวกัน */
export const PAGE_NO: Record<string, string> = {
  "/draw": "01",
  "/wheel": "02",
  "/tournaments": "03",
  "/tournament": "03",
  "/players": "04",
  "/channel": "05",
  "/c": "05",
  "/widgets": "06",
  "/activity": "07",
  "/timer": "10",
};

/** หัวข้อใหญ่ประจำหน้า พร้อมเส้นทองที่ค่อยๆ ลากออก */
export function PageHeading({
  no,
  eyebrow,
  title,
  description,
  action,
  meta,
  ornament = false,
}: {
  no?: string;
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
  ornament?: boolean;
}) {
  const pathname = usePathname();
  const chapter = no ?? PAGE_NO[pathname?.replace(/\/$/, "") || "/"] ?? "00";

  return (
    <div className="relative pb-2">
      {ornament && (
        <div className="pointer-events-none absolute -top-6 right-0 hidden translate-x-1/3 opacity-40 lg:block">
          <RingCluster size={240} />
        </div>
      )}

      <SectionHead
        no={chapter}
        eyebrow={eyebrow}
        title={title}
        meta={meta}
        action={action}
        className="relative border-t-0 pt-0"
      />

      {description && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.24 }}
          className="mt-4 max-w-xl text-sm text-muted"
        >
          {description}
        </motion.p>
      )}
    </div>
  );
}
