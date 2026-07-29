"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import RingCluster from "../fx/RingCluster";

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

/** หัวข้อใหญ่ประจำหน้า พร้อมเส้นทองที่ค่อยๆ ลากออก */
export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex flex-wrap items-end justify-between gap-6 pb-2">
      {/* วงแหวนตกแต่ง — ขยับตามเมาส์ */}
      <div className="pointer-events-none absolute -top-6 right-0 hidden translate-x-1/3 opacity-40 lg:block">
        <RingCluster size={240} />
      </div>

      <div className="relative min-w-0">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase"
        >
          {eyebrow}
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="mt-2 font-display text-3xl leading-tight font-light text-ice sm:text-4xl"
        >
          {title}
        </motion.h2>

        <motion.span
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="mt-4 block h-px w-28 origin-left bg-[linear-gradient(90deg,rgba(230,200,148,0.8),transparent)]"
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

      {action && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative shrink-0"
        >
          {action}
        </motion.div>
      )}
    </div>
  );
}
