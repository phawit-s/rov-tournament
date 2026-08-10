"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { useWidgetOptions } from "@/hooks/useLiveTournament";
import { watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { readTimer } from "@/lib/timer/store";
import { SPIN_SECONDS } from "@/lib/timer/types";
import { segments, type WheelEntry } from "@/lib/wheel";
import Wheel from "@/components/wheel/Wheel";
import WidgetShell, { WidgetCard, WidgetHint } from "@/components/widget/WidgetShell";

const POINTER_ANGLE = -Math.PI / 2;
const TWO_PI = Math.PI * 2;
/** ผลค้างบนจอหลังหมุนจบกี่มิลลิวินาที */
const HOLD_MS = 5000;

/**
 * วงล้อสุ่มเวลาบนสตรีม — คนละ Browser Source กับนาฬิกา
 *
 * ตัวนี้ไม่ได้สุ่มเอง มันแค่ "เล่นซ้ำ" ผลที่คอนโซลสุ่มไว้แล้ว: พอเห็น lastSpin
 * ใบใหม่ ก็หมุนไปหยุดที่ช่องนั้น — ผลจึงตรงกับที่คอนโซลกับนาฬิกาเห็นเสมอ
 * ไม่มีทางที่วงล้อบนจอจะหยุดคนละช่องกับเวลาที่บวกเข้าไปจริง
 */
export default function WheelWidget() {
  const { accent } = useWidgetOptions();
  const channelId = useHashParam("ch");
  const reduced = useReducedMotion();

  const [channel, setChannel] = useState<Channel | null>(null);
  const [found, setFound] = useState<boolean | null>(null);

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  /** at ของใบที่เล่นไปแล้ว — กัน snapshot ที่ยิงซ้ำทำให้หมุนใหม่ไม่จบ */
  const playedRef = useRef<string | null>(null);
  const rotationRef = useRef(0);
  const raf = useRef(0);
  const hideRef = useRef(0);
  /** โชว์ป้ายผลอยู่ไหม — ตั้งตอนหมุนจบ แล้วดับเองด้วย timeout */
  const [showResult, setShowResult] = useState(false);

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

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(hideRef.current);
    },
    [],
  );

  const timer = readTimer(channel?.timer);
  const slices = timer.slices;
  const spin = timer.lastSpin ?? null;

  /* เห็นผลหมุนใบใหม่ = เริ่มหมุน
     อ่านมุมปัจจุบันจาก ref ไม่ใช่จาก state เพื่อไม่ให้ rotation อยู่ใน deps
     (ไม่งั้น effect จะรีสตาร์ตทุกเฟรมระหว่างที่กำลังหมุน) */
  useEffect(() => {
    if (!spin || slices.length < 2) return;
    if (playedRef.current === spin.at) return;
    playedRef.current = spin.at;

    const index = slices.findIndex((s) => s.id === spin.sliceId);
    if (index < 0) return;

    const entries: WheelEntry[] = slices.map((s) => ({
      id: s.id,
      name: s.label,
      weight: s.weight,
    }));
    const seg = segments(entries, true)[index];

    const start = rotationRef.current;
    let target = POINTER_ANGLE - seg.mid;
    const turns = 5;
    while (target < start + turns * TWO_PI) target += TWO_PI;

    const distance = target - start;
    const duration = reduced ? 400 : SPIN_SECONDS * 1000;

    /*
      ทุก setState อยู่ในคอลแบ็กของ rAF ไม่ใช่ในตัว effect ตรงๆ

      setState ในตัว effect บังคับให้ React เรนเดอร์รอบพิเศษทันทีก่อนจะได้วาดจอ
      ซึ่งที่นี่ไม่ได้อะไรเลย เพราะเฟรมแรกของแอนิเมชันก็มาถึงในไม่กี่มิลลิวินาที
      อยู่แล้ว — จับเวลาเริ่มจากเฟรมแรกที่ได้จริงด้วย จะได้ไม่นับเวลาที่หายไป
      ระหว่างรอเฟรมเป็นส่วนหนึ่งของการหมุน
    */
    let t0 = 0;
    const step = (t: number) => {
      if (!t0) {
        t0 = t;
        setWinnerIndex(null);
        setSpinning(true);
      }
      const p = Math.min(1, (t - t0) / duration);
      const next = start + distance * (1 - Math.pow(1 - p, 4.2));
      rotationRef.current = next;
      setRotation(next);
      if (p < 1) {
        raf.current = requestAnimationFrame(step);
        return;
      }
      setSpinning(false);
      setWinnerIndex(index);
      // ผลค้างบนจอครู่หนึ่งแล้วหายเอง ไม่ต้องมีใครมาสั่งปิด
      hideRef.current = window.setTimeout(() => setShowResult(false), HOLD_MS);
      setShowResult(true);
    };
    raf.current = requestAnimationFrame(step);
  }, [spin, slices, reduced]);

  if (!channelId) {
    return (
      <WidgetShell>
        <WidgetHint setup title="ยังไม่รู้ว่าจะโชว์วงล้อของช่องไหน">
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
          รหัสช่อง <code>{channelId}</code> ไม่มีอยู่จริง
        </WidgetHint>
      </WidgetShell>
    );
  }

  if (!channel || !timer.enabled || slices.length < 2) return null;

  const entries: WheelEntry[] = slices.map((s) => ({
    id: s.id,
    name: s.label,
    weight: s.weight,
  }));

  return (
    <WidgetShell align="center">
      <WidgetCard accent={accent} frame="plate" className="px-6 py-6">
        <div className="w-90">
          <Wheel
            entries={entries}
            useWeights
            rotation={rotation}
            spinning={spinning}
            winnerIndex={winnerIndex}
          />
        </div>

        <div className="mt-4 grid h-9 place-items-center">
          <AnimatePresence mode="wait">
            {!spinning && showResult && spin && (
              <motion.p
                key={spin.at}
                initial={reduced ? false : { opacity: 0, y: 8, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                className="fig text-3xl"
                style={{
                  color:
                    spin.seconds > 0
                      ? "rgb(var(--st-win))"
                      : spin.seconds < 0
                        ? "rgb(var(--st-live))"
                        : "#fff",
                }}
              >
                {spin.label}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </WidgetCard>
    </WidgetShell>
  );
}
