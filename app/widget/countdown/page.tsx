"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { useWidgetOptions } from "@/hooks/useLiveTournament";
import { watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { readTimer } from "@/lib/timer/store";
import { clockText, isRunning, remainingAt } from "@/lib/timer/types";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

/**
 * นาฬิกาถอยหลังบนสตรีม — คุมจากหน้า /timer/
 *
 * แยกเป็นคนละ Browser Source กับวงล้อโดยตั้งใจ: นาฬิกาค้างอยู่มุมจอทั้งไลฟ์
 * ส่วนวงล้อเปิดเฉพาะตอนจะหมุน ถ้ารวมเป็น source เดียวจะย้ายทีละอันไม่ได้เลย
 *
 * ไม่มีการอ่านฐานข้อมูลซ้ำทุกวินาที — อ่านค่า "เหลือกี่วิ + เริ่มเมื่อไหร่"
 * มาครั้งเดียวแล้วนับเองในเครื่อง ตัวเลขจึงตรงกับคอนโซลเป๊ะโดยไม่กินโควตา
 */
export default function CountdownWidget() {
  const { accent } = useWidgetOptions();
  const channelId = useHashParam("ch");
  const reduced = useReducedMotion();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [found, setFound] = useState<boolean | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!channelId) return;
    return watchChannel(
      channelId,
      (c) => {
        setChannel(c);
        setFound(!!c);
      },
      () => setFound(false),
    );
  }, [channelId]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  if (!channelId) {
    return (
      <WidgetShell>
        <WidgetHint setup title="ยังไม่รู้ว่าจะจับเวลาของช่องไหน">
          เติม <code>#ch=รหัสช่อง</code> ท้ายลิงก์ — คัดลอกลิงก์เต็มได้ที่หน้า{" "}
          <code>/timer/</code>
        </WidgetHint>
      </WidgetShell>
    );
  }

  if (found === false) {
    return (
      <WidgetShell>
        <WidgetHint setup title="ไม่พบช่องนี้">
          รหัสช่อง <code>{channelId}</code> ไม่มีอยู่จริง — คัดลอกลิงก์ใหม่จากหน้า{" "}
          <code>/timer/</code>
        </WidgetHint>
      </WidgetShell>
    );
  }

  const timer = readTimer(channel?.timer);

  /* ปิดอยู่ = หายไปเลย ไม่ใช่โชว์กล่องเปล่า — widget นี้ค้างอยู่บนจอตลอดไลฟ์
     สตรีมเมอร์จึงต้องปิดมันจากคอนโซลได้โดยไม่ต้องไปปิด source ใน OBS */
  if (!channel || !timer.enabled) return null;

  const left = remainingAt(timer, now);
  const done = left <= 0;
  const urgent = !done && left <= 60;
  const color = urgent || done ? "rgb(var(--st-live))" : accent;

  return (
    <WidgetShell>
      <WidgetCard accent={accent} frame="bar" className="px-7 py-5">
        <p
          className="slug"
          style={urgent || done ? { color: "rgb(var(--st-live))" } : undefined}
        >
          {done ? "หมดเวลา" : (timer.label ?? "เหลืออีก")}
        </p>

        <div className="mt-1.5 flex items-baseline gap-3">
          <span
            className="fig num text-[3.4rem] leading-none"
            style={{
              color,
              /* เรืองแสงอ่อนๆ ให้ตัวเลขลอยเหนือภาพเกม โดยไม่ต้องมีกล่องทึบรอง */
              textShadow: `0 0 24px ${color}66`,
            }}
          >
            {clockText(left)}
          </span>
          {!isRunning(timer) && !done && (
            <span className="slug slug-2">หยุดอยู่</span>
          )}
        </div>

        {/* ผลหมุนล่าสุดลอยขึ้นข้างนาฬิกา — คนดูจะได้เห็นว่าเวลาที่เพิ่งขยับมาจากไหน */}
        <AnimatePresence>
          {timer.lastSpin && (
            <SpinFlash
              key={timer.lastSpin.at}
              label={timer.lastSpin.label}
              seconds={timer.lastSpin.seconds}
              at={timer.lastSpin.at}
              now={now}
              reduced={!!reduced}
            />
          )}
        </AnimatePresence>
      </WidgetCard>
    </WidgetShell>
  );
}

/** ป้ายผลหมุน โผล่ 6 วินาทีแล้วหายเอง */
function SpinFlash({
  label,
  seconds,
  at,
  now,
  reduced,
}: {
  label: string;
  seconds: number;
  at: string;
  now: number;
  reduced: boolean;
}) {
  const age = now - Date.parse(at);
  if (!Number.isFinite(age) || age < 0 || age > 6000) return null;

  const color =
    seconds > 0 ? "rgb(var(--st-win))" : seconds < 0 ? "rgb(var(--st-live))" : "#fff";

  return (
    <motion.p
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-2 font-display text-lg"
      style={{ color }}
    >
      {label}
    </motion.p>
  );
}
