"use client";

import { useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { themeStore } from "@/lib/theme";

type Fleck = {
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  tone: string;
};

const TONES = {
  dark: ["#f2dcb0", "#d9b273", "#e6c894", "#ffffff"],
  light: ["#a37f38", "#8a6a2c", "#c2a05a", "#6c521f"],
};

/** ผงทองร่วงช้าๆ ใช้แทนพลุกระดาษ ให้โทนงานยังดูสงบและหรู */
export default function GoldDust({ count = 34 }: { count?: number }) {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );
  const palette = TONES[theme];

  const [flecks] = useState<Fleck[]>(() =>
    Array.from({ length: count }, () => ({
      left: Math.random() * 100,
      size: 2 + Math.random() * 4,
      delay: Math.random() * 1.6,
      duration: 4.5 + Math.random() * 4,
      drift: (Math.random() - 0.5) * 90,
      tone: Math.floor(Math.random() * 4).toString(),
    })),
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {/* แสงนวลวูบเดียวตอนเปิดหน้า */}
      <motion.div
        initial={{ opacity: 0.5 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 2.2, ease: "easeOut" }}
        className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_35%,rgba(230,200,148,0.20),transparent_70%)]"
      />

      {flecks.map((fleck, i) => {
        const tone = palette[Number(fleck.tone) % palette.length];
        return (
        <motion.span
          key={i}
          className="absolute top-0 rounded-full"
          style={{
            left: `${fleck.left}%`,
            width: fleck.size,
            height: fleck.size,
            background: tone,
            boxShadow: `0 0 ${fleck.size * 2.5}px ${tone}`,
          }}
          initial={{ y: -30, opacity: 0, x: 0 }}
          animate={{
            y: ["-2vh", "104vh"],
            x: [0, fleck.drift],
            opacity: [0, 0.85, 0.85, 0],
          }}
          transition={{
            duration: fleck.duration,
            delay: fleck.delay,
            ease: "linear",
            times: [0, 0.12, 0.78, 1],
          }}
        />
        );
      })}
    </div>
  );
}
