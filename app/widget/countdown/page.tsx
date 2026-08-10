"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { useWidgetOptions } from "@/hooks/useLiveTournament";
import { watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { readTimer } from "@/lib/timer/store";
import {
  clampScale,
  clockText,
  isRunning,
  remainingAt,
  timerAccent,
} from "@/lib/timer/types";
import SevenSegment from "@/components/timer/SevenSegment";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

const RING_R = 78;
const RING_C = 2 * Math.PI * RING_R;

/**
 * นาฬิกาถอยหลังบนสตรีม — คุมจากหน้า /timer/
 *
 * แยกเป็นคนละ Browser Source กับวงล้อโดยตั้งใจ: นาฬิกาค้างอยู่มุมจอทั้งไลฟ์
 * ส่วนวงล้อเปิดเฉพาะตอนจะหมุน ถ้ารวมเป็น source เดียวจะย้ายทีละอันไม่ได้เลย
 *
 * ไม่มีการอ่านฐานข้อมูลซ้ำทุกวินาที — อ่านค่า "เหลือกี่วิ + เริ่มเมื่อไหร่"
 * มาครั้งเดียวแล้วนับเองในเครื่อง ตัวเลขจึงตรงกับคอนโซลเป๊ะโดยไม่กินโควตา
 *
 * มีสามทรงให้เลือกจากคอนโซล เพราะที่ที่คนวางนาฬิกาบนจอต่างกันมาก —
 * มุมจอเปล่าๆ ต้องการตัวเลขล้วน ส่วนบนภาพเกมสว่างต้องมีแผ่นรองถึงจะอ่านออก
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
  /* สีของช่องมาก่อนค่าในลิงก์ — เปลี่ยนที่คอนโซลแล้วทุก source เปลี่ยนตามเลย */
  const tone = timerAccent(timer, accent);
  const color = urgent || done ? "#ff5b7a" : tone;
  const scale = clampScale(timer.fontScale, 0.6, 2.5);
  const caption = done ? "หมดเวลา" : (timer.label ?? "เหลืออีก");
  const skin = timer.skin ?? "card";
  const seven = (timer.digits ?? "sans") === "seven";
  const ghost = Math.min(0.3, Math.max(0, timer.ghost ?? 0.08));

  /* ตัวเลขนาฬิกา — แบบไหนก็ได้ ขนาดคุมด้วยตัวคูณเดียวกันทั้งคู่
     ห่อไว้ที่เดียวเพราะทั้งสามทรงใช้ตัวเลขชุดเดียวกัน ต่างกันแค่ของที่อยู่รอบๆ */
  const digitsOf = (rem: number) =>
    seven ? (
      <SevenSegment text={clockText(left)} color={color} height={rem} ghost={ghost} />
    ) : (
      <span
        className="fig num leading-none"
        style={{
          fontSize: `${rem}rem`,
          color,
          textShadow: `0 0 24px ${color}66`,
        }}
      >
        {clockText(left)}
      </span>
    );

  const flash = (
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
  );

  /* ---------- ตัวเลขล้วน ----------
     ไม่มีแผ่นรองเลย ใช้เงาเรืองแสงกับเส้นขอบตัวอักษรทำให้อ่านออกบนพื้นสว่างแทน
     เหมาะกับมุมจอที่ไม่มีอะไรอยู่ หรือคนที่ทำกราฟิกพื้นหลังของตัวเองไว้แล้ว */
  if (skin === "plain") {
    return (
      <WidgetShell>
        <div className="px-2 py-1">
          {caption && (
            <p
              className="slug"
              style={{ color: urgent || done ? "#ff5b7a" : tone }}
            >
              {caption}
            </p>
          )}
          {digitsOf(4.2 * scale)}
          {flash}
        </div>
      </WidgetShell>
    );
  }

  /* ---------- วงแหวน ----------
     บอก "เหลือเท่าไหร่จากทั้งหมด" ด้วยรูป ซึ่งตัวเลขล้วนบอกไม่ได้ */
  if (skin === "ring") {
    const total = Math.max(1, timer.total ?? timer.remaining);
    const pct = Math.max(0, Math.min(1, left / total));
    const size = 200 * Math.min(1.6, scale);

    return (
      <WidgetShell>
        <div className="relative grid place-items-center" style={{ width: size, height: size }}>
          <svg
            viewBox="0 0 200 200"
            width={size}
            height={size}
            className="absolute -rotate-90"
            aria-hidden
          >
            <circle
              cx="100"
              cy="100"
              r={RING_R}
              fill="none"
              stroke="rgb(255 255 255 / 0.12)"
              strokeWidth="7"
            />
            <circle
              cx="100"
              cy="100"
              r={RING_R}
              fill="none"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${RING_C * pct} ${RING_C}`}
              style={{
                transition: "stroke-dasharray 0.25s linear",
                filter: `drop-shadow(0 0 8px ${color}99)`,
              }}
            />
          </svg>

          <div className="relative flex flex-col items-center">
            {digitsOf(1.9 * Math.min(1.6, scale))}
            {caption && <p className="slug slug-2 mt-1.5">{caption}</p>}
          </div>
        </div>
      </WidgetShell>
    );
  }

  /* ---------- การ์ด (ค่าเริ่มต้น) ---------- */
  return (
    <WidgetShell>
      <WidgetCard accent={tone} frame="bar" className="px-7 py-5">
        <p
          className="slug"
          style={urgent || done ? { color: "#ff5b7a" } : undefined}
        >
          {caption}
        </p>

        <div className="mt-1.5 flex items-baseline gap-3">
          {/* ขนาดคูณจากฐาน 3.4rem — ตั้งจากคอนโซล ไม่ต้องแก้ลิงก์ */}
          {digitsOf(3.4 * scale)}
          {!isRunning(timer) && !done && (
            <span className="slug slug-2">หยุดอยู่</span>
          )}
        </div>

        {/* ผลหมุนล่าสุดลอยขึ้นข้างนาฬิกา — คนดูจะได้เห็นว่าเวลาที่เพิ่งขยับมาจากไหน */}
        {flash}
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

  const color = seconds > 0 ? "#34e3b0" : seconds < 0 ? "#ff5b7a" : "#ffffff";

  return (
    <motion.p
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? undefined : { opacity: 0, y: -8 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-2 font-display text-lg"
      style={{ color, textShadow: "0 2px 8px rgb(0 0 0 / 0.5)" }}
    >
      {label}
    </motion.p>
  );
}
