"use client";

import { useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { themeStore } from "@/lib/theme";
import { useMediaQuery } from "@/hooks/useClient";

type Fleck = {
  left: number;
  /** แผ่นทองเปลว: กว้างน้อย สูงมาก แล้วบิดตัวตอนร่วง */
  w: number;
  h: number;
  delay: number;
  duration: number;
  drift: number;
  /** จำนวนรอบที่หมุน ติดลบ = หมุนย้อน */
  spin: number;
  tone: number;
  /** 0 = ชั้นหน้า, 1 = ชั้นกลาง, 2 = ชั้นหลัง */
  layer: 0 | 1 | 2;
};

const TONES = {
  dark: ["#cfc7ff", "#a99bff", "#a99bff", "#ffffff"],
  light: ["#6c5ce7", "#5b4bd6", "#8a79f2", "#3a2e9e"],
};

const DEPTH = [
  { blur: 0, scale: 1, speed: 1, opacity: 0.9 },
  { blur: 0.6, scale: 0.82, speed: 1.25, opacity: 0.72 },
  { blur: 1.5, scale: 0.62, speed: 1.55, opacity: 0.5 },
] as const;

/** ทองเปลวร่วงช้าๆ ใช้แทนพลุกระดาษ ให้โทนงานยังดูสงบและหรู */
export default function GoldDust({ count = 34 }: { count?: number }) {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );
  const reduced = useReducedMotion();
  const narrow = useMediaQuery("(max-width: 640px)");
  const palette = TONES[theme];

  const [flecks] = useState<Fleck[]>(() =>
    Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      w: 2 + Math.random() * 2,
      h: 6 + Math.random() * 8,
      delay: Math.random() * 1.6,
      duration: 4.5 + Math.random() * 4,
      drift: (Math.random() - 0.5) * 110,
      spin: (Math.random() < 0.5 ? -1 : 1) * (1 + Math.round(Math.random())),
      tone: Math.floor(Math.random() * 4),
      layer: (i % 3) as 0 | 1 | 2,
    })),
  );

  // มือถือ: ตัดชั้นหลังทิ้งและเหลือ 14 แผ่น ไม่งั้น paint หนักโดยแทบไม่เห็นผล
  const shown = reduced
    ? []
    : narrow
      ? flecks.filter((f) => f.layer !== 2).slice(0, 14)
      : flecks;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {/* แสงนวลวูบเดียวตอนเปิดหน้า — ถ้าปิดการเคลื่อนไหวไว้ จะเหลือแค่ชั้นนี้ */}
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 2.2, ease: "easeOut" }}
        className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_35%,rgba(230,200,148,0.20),transparent_70%)]"
      />

      {shown.map((fleck, i) => {
        const tone = palette[fleck.tone % palette.length];
        const d = DEPTH[fleck.layer];
        const dur = fleck.duration * d.speed;
        return (
          <motion.span
            key={i}
            className="absolute top-0"
            style={{
              left: `${fleck.left}%`,
              width: fleck.w * d.scale,
              height: fleck.h * d.scale,
              borderRadius: 1,
              background: `linear-gradient(150deg, ${tone}, ${tone}66)`,
              boxShadow: `0 0 ${fleck.w * 2.5}px ${tone}55`,
              filter: d.blur ? `blur(${d.blur}px)` : undefined,
            }}
            initial={{ y: -30, opacity: 0, x: 0 }}
            animate={{
              y: ["-4vh", "106vh"],
              x: [0, fleck.drift],
              rotate: [0, 360 * fleck.spin],
              scaleX: [1, 0.2, 1],
              opacity: [0, d.opacity, d.opacity, 0],
            }}
            transition={{
              // แยก transition รายค่า เพราะจำนวน keyframe ของแต่ละค่าไม่เท่ากัน
              y: { duration: dur, delay: fleck.delay, ease: "linear" },
              x: { duration: dur, delay: fleck.delay, ease: "easeIn" },
              rotate: { duration: dur, delay: fleck.delay, ease: "linear" },
              scaleX: {
                duration: dur,
                delay: fleck.delay,
                times: [0, 0.5, 1],
                ease: "easeInOut",
              },
              opacity: {
                duration: dur,
                delay: fleck.delay,
                times: [0, 0.12, 0.78, 1],
                ease: "linear",
              },
            }}
          />
        );
      })}
    </div>
  );
}
