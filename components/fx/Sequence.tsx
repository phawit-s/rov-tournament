"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { sfx } from "@/lib/sound";

type Act = "count" | "flash" | "curtain";

/**
 * พิธีปิดของการจับสลาก ยาว 1.5 วินาที
 * เดิมช่วงเวลานี้เป็น setTimeout เปล่าๆ ที่ปล่อยจอนิ่งแล้วกระโดดไปหน้าผล
 * แบ่งเป็นสามองก์: นับถอยหลัง → ไล่ไฟการ์ดทีมทีละใบ → ม่านทองกวาดลง แล้วค่อยจบ
 */
export default function Sequence({
  cards,
  onFlash,
  onDone,
}: {
  /** จำนวนการ์ดที่จะไล่ไฟ (ทีม + ม้านั่งสำรอง) */
  cards: number;
  /** -1 = ดับไฟทุกใบ */
  onFlash?: (index: number) => void;
  onDone: () => void;
}) {
  const reduced = useReducedMotion();
  const [act, setAct] = useState<Act>("count");
  const [count, setCount] = useState(3);

  // เก็บ callback ล่าสุดไว้ใน ref เพื่อไม่ให้ไทม์ไลน์ถูกตั้งใหม่ทุกครั้งที่ parent รีเรนเดอร์
  const flashRef = useRef(onFlash);
  const doneRef = useRef(onDone);
  useEffect(() => {
    flashRef.current = onFlash;
    doneRef.current = onDone;
  });

  useEffect(() => {
    const ids: number[] = [];
    const at = (ms: number, fn: () => void) => {
      ids.push(window.setTimeout(fn, ms));
    };
    const clear = () => ids.forEach((id) => window.clearTimeout(id));

    // ปิดการเคลื่อนไหว = ข้ามทั้งชุด เหลือแค่จางสั้นๆ กันหน้ากระตุก
    if (reduced) {
      at(200, () => doneRef.current());
      return clear;
    }

    sfx.play("tick");
    at(200, () => {
      setCount(2);
      sfx.play("tick");
    });
    at(400, () => {
      setCount(1);
      sfx.play("tick");
    });
    at(600, () => setAct("flash"));

    // ไล่ไฟให้จบภายในช่วง 600-1100ms ไม่ว่าจะมีกี่ใบ
    const step = cards > 0 ? Math.min(110, 460 / cards) : 0;
    for (let i = 0; i < cards; i++) {
      at(620 + i * step, () => flashRef.current?.(i));
    }

    at(1100, () => {
      flashRef.current?.(-1);
      setAct("curtain");
      sfx.play("reveal");
    });
    at(1500, () => doneRef.current());

    return clear;
  }, [cards, reduced]);

  if (reduced) {
    return (
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-70 bg-ink/45"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-70 grid place-items-center overflow-hidden"
    >
      {/* ไฟนวลกลางจอ ให้เลขนับถอยหลังลอยขึ้นมาจากพื้นหลังที่มีการ์ดเต็มไปหมด */}
      <motion.div
        className="absolute inset-0 bg-[radial-gradient(52%_46%_at_50%_50%,rgb(var(--st-next)/0.16),transparent_72%)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: act === "curtain" ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      />

      <AnimatePresence>
        {act === "count" && (
          <motion.div
            key="count"
            className="relative grid place-items-center"
            exit={{ opacity: 0, scale: 1.15 }}
            transition={{ duration: 0.2 }}
          >
            {/* วงแหวนหดเข้าหาเลข — กลับทิศกับวงแหวนตอนออกผลของตู้จับสลาก */}
            <motion.span
              key={`ring-${count}`}
              className="absolute h-28 w-28 rounded-full border border-iris/45"
              initial={{ scale: 3.4, opacity: 0 }}
              animate={{ scale: 0.35, opacity: 0.85 }}
              transition={{ duration: 0.22, ease: "easeIn" }}
            />
            <motion.span
              key={`n-${count}`}
              className="fig num relative text-[clamp(3rem,12vw,7rem)] text-iris"
              initial={{ opacity: 0, scale: 1.35 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              {count}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {act === "curtain" && (
        <motion.span
          className="absolute inset-0 origin-top bg-[linear-gradient(180deg,transparent,rgb(var(--st-next)/0.18),transparent)]"
          initial={{ scaleY: 0 }}
          animate={{ scaleY: [0, 1, 0] }}
          transition={{ duration: 0.4, times: [0, 0.55, 1], ease: "easeInOut" }}
        />
      )}
    </div>
  );
}
