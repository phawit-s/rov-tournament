"use client";

import { useReducedMotion } from "motion/react";

function Row({
  items,
  speed,
  reverse,
  className,
}: {
  items: string[];
  speed: number;
  reverse?: boolean;
  className: string;
}) {
  return (
    <div
      className={`marquee ${reverse ? "marquee-rev" : ""} flex w-max gap-8 ${className}`}
      style={{ ["--dur" as string]: `${speed}s` }}
    >
      {/* ต้องซ้ำสองรอบพอดี เพราะ keyframe เลื่อน -50% */}
      {[0, 1].map((pass) =>
        items.map((t) => (
          <span
            key={`${pass}-${t}`}
            className="flex items-center gap-8 font-display text-[clamp(1.2rem,4vw,2.6rem)] tracking-luxe uppercase"
          >
            {t}
            <span className="inline-block h-[5px] w-[5px] rotate-45 bg-[rgb(var(--accent)/.45)]" />
          </span>
        )),
      )}
    </div>
  );
}

/**
 * แถบตัวอักษรวิ่งเต็มความกว้างจอ ใช้คั่นระหว่างองก์
 * ระวัง: .band ใช้ left:50%/width:100vw จึงห้ามอยู่ใต้บรรพบุรุษที่มี transform
 */
export default function Marquee({
  items,
  rows = 2,
  speed = 38,
}: {
  items: string[];
  rows?: 1 | 2;
  speed?: number;
}) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <div className="band overflow-hidden border-y border-hair py-3" aria-hidden>
        <div className="flex justify-center gap-8">
          {items.slice(0, 4).map((t) => (
            <span
              key={t}
              className="font-display text-[clamp(1rem,3vw,1.8rem)] tracking-luxe text-champagne/25 uppercase"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="band space-y-1 overflow-hidden border-y border-hair py-3"
      aria-hidden
    >
      <Row items={items} speed={speed} className="text-champagne/25" />
      {rows === 2 && (
        <Row
          items={items}
          speed={speed * 1.25}
          reverse
          className="text-outline hidden sm:flex"
        />
      )}
    </div>
  );
}
