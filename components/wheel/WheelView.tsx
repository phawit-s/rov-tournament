"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { sfx } from "@/lib/sound";
import { pickWinnerIndex, segments, wheelStore } from "@/lib/wheel";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import GoldDust from "../fx/GoldDust";
import Wheel from "./Wheel";

const POINTER_ANGLE = -Math.PI / 2;
const SAMPLE = ["ก้อง", "เบียร์", "ปอนด์", "นัท", "แบงค์", "ฟลุ๊ค", "โอ๊ต", "เจมส์"];

export default function WheelView() {
  const state = useSyncExternalStore(
    wheelStore.subscribe,
    wheelStore.getSnapshot,
    wheelStore.getServerSnapshot,
  );

  const [draft, setDraft] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [showWinner, setShowWinner] = useState(false);
  const rafRef = useRef(0);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const spin = useCallback(
    (power = 1) => {
      const entries = wheelStore.getSnapshot().entries;
      if (spinning || entries.length < 2) return;

      sfx.unlock();
      setWinnerIndex(null);
      setShowWinner(false);
      setSpinning(true);

      const useWeights = state.useWeights;
      const index = pickWinnerIndex(entries, useWeights);
      const segs = segments(entries, useWeights);
      const seg = segs[index];
      const arc = seg.end - seg.start;

      // เล็งให้กลางช่องผู้ชนะไปหยุดตรงเข็ม เผื่อสุ่มตำแหน่งในช่องนิดหน่อยให้ดูเป็นธรรมชาติ
      const jitter = (Math.random() - 0.5) * arc * 0.6;
      const turns = 5 + Math.floor(Math.random() * 3) + Math.min(3, Math.abs(power));
      const twoPi = Math.PI * 2;
      let target = POINTER_ANGLE - (seg.mid + jitter);
      while (target < rotation + turns * twoPi) target += twoPi;

      const start = rotation;
      const distance = target - start;
      const duration = Math.max(2600, state.duration * 1000);
      const t0 = performance.now();

      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        // ออกตัวไว แล้วค่อยๆ หน่วงยาวๆ ตอนจบให้ลุ้น
        const eased = 1 - Math.pow(1 - t, 4.2);
        setRotation(start + distance * eased);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
          return;
        }
        setSpinning(false);
        setWinnerIndex(index);
        setShowWinner(true);
        sfx.play("reveal");
        wheelStore.pushHistory(entries[index].name);
        recordActivity(
          "wheel.spin",
          `ได้ "${entries[index].name}" จาก ${entries.length} ชื่อ`,
        );
        if (state.removeWinner) {
          window.setTimeout(() => wheelStore.remove(entries[index].id), 1400);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [rotation, spinning, state.duration, state.removeWinner, state.useWeights],
  );

  // กด Space เพื่อหมุน
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        spin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spin]);

  const addFromDraft = () => {
    if (!draft.trim()) return;
    wheelStore.addNames(draft.split(/[,\n\t;]+/));
    setDraft("");
    sfx.play("click");
  };

  const winnerName =
    winnerIndex != null ? (state.entries[winnerIndex]?.name ?? null) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
            Lucky wheel
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-medium text-ice sm:text-3xl">
            วงล้อสุ่ม
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            ใส่ชื่อ แล้วกดหมุน — หรือใช้เมาส์สะบัดวงล้อเอาก็ได้
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(320px,380px)_1fr]">
        {/* รายชื่อ — บนมือถือให้วงล้ออยู่บนก่อน */}
        <div className="order-2 space-y-5 lg:order-1">
          <Panel className="p-6">
            <div className="mb-4 flex items-end justify-between gap-3">
              <h3 className="font-display text-lg font-medium text-ice">รายชื่อ</h3>
              <p className="font-display text-2xl font-light text-champagne tabular-nums">
                {state.entries.length}
              </p>
            </div>

            <div className="flex gap-2.5">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addFromDraft();
                  }
                }}
                placeholder="พิมพ์ชื่อแล้วกด Enter"
                className="field w-full rounded-xl px-3.5 py-2.5 text-sm text-ice outline-none placeholder:text-muted/80"
              />
              <Button onClick={addFromDraft} disabled={!draft.trim()} className="shrink-0 px-5">
                เพิ่ม
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <MiniButton onClick={() => wheelStore.addNames(SAMPLE)}>
                ใส่ชื่อตัวอย่าง
              </MiniButton>
              {state.entries.length > 0 && (
                <MiniButton danger onClick={() => wheelStore.clear()}>
                  ล้างทั้งหมด
                </MiniButton>
              )}
            </div>

            <ul className="mt-5 max-h-[42vh] space-y-2 overflow-y-auto pr-1">
              <AnimatePresence initial={false}>
                {state.entries.map((entry, i) => (
                  <motion.li
                    key={entry.id}
                    layout
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2.5 rounded-lg tile px-3 py-2"
                  >
                    <span className="font-display text-[11px] text-muted tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ice">
                      {entry.name}
                    </span>
                    {state.useWeights && (
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={entry.weight}
                        onChange={(e) =>
                          wheelStore.setWeight(entry.id, Number(e.target.value))
                        }
                        className="field w-14 rounded-md px-2 py-1 text-center text-xs text-ice outline-none"
                        title="น้ำหนัก ยิ่งมากยิ่งมีโอกาสออกมาก"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => wheelStore.remove(entry.id)}
                      className="cursor-pointer px-1 text-xs text-muted transition-colors hover:text-[#e79a9a]"
                    >
                      ✕
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
              {state.entries.length === 0 && (
                <li className="grid h-24 place-items-center rounded-xl tile-dashed text-sm text-muted">
                  ยังไม่มีชื่อ
                </li>
              )}
            </ul>
          </Panel>

          <Panel className="space-y-4 p-6">
            <h3 className="font-display text-lg font-medium text-ice">ลูกเล่น</h3>

            <Switch
              checked={state.removeWinner}
              onChange={(v) => wheelStore.set({ removeWinner: v })}
              label="คัดชื่อที่ออกแล้วทิ้ง"
              hint="เหมาะกับจับฉลากไล่ทีละคน"
            />
            <Switch
              checked={state.useWeights}
              onChange={(v) => wheelStore.set({ useWeights: v })}
              label="ถ่วงน้ำหนักรายคน"
              hint="ใส่ตัวเลขให้แต่ละชื่อ ยิ่งมากยิ่งมีโอกาสออก"
            />

            <div>
              <p className="mb-2 text-sm font-medium text-ice/85">
                ความยาวการหมุน{" "}
                <span className="text-champagne">{state.duration} วิ</span>
              </p>
              <input
                type="range"
                min={2}
                max={12}
                value={state.duration}
                onChange={(e) => wheelStore.set({ duration: Number(e.target.value) })}
                style={{
                  ["--fill" as string]: `${((state.duration - 2) / 10) * 100}%`,
                }}
                className="w-full cursor-pointer"
              />
            </div>
          </Panel>
        </div>

        {/* วงล้อ */}
        <div className="order-1 space-y-5 lg:order-2">
          <Panel className="p-6 sm:p-8">
            <Wheel
              entries={state.entries}
              useWeights={state.useWeights}
              rotation={rotation}
              spinning={spinning}
              winnerIndex={winnerIndex}
              onFlick={(v) => spin(Math.abs(v) / 4)}
            />

            <div className="mt-7 flex flex-col items-center gap-3">
              <Button
                onClick={() => spin()}
                disabled={spinning || state.entries.length < 2}
                className="min-w-56 py-4 text-base"
              >
                {spinning
                  ? "กำลังหมุน…"
                  : state.entries.length < 2
                    ? "ใส่ชื่ออย่างน้อย 2 คน"
                    : "หมุนวงล้อ"}
              </Button>
              <p className="text-center text-xs text-muted">
                กด <kbd className="rounded tile px-1.5 py-0.5 text-[11px]">Space</kbd>{" "}
                หรือสะบัดวงล้อด้วยเมาส์ก็ได้
              </p>
            </div>
          </Panel>

          {state.history.length > 0 && (
            <Panel className="p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-medium text-ice">
                  ประวัติการสุ่ม
                </h3>
                <div className="flex items-center gap-1">
                  <MiniButton
                    onClick={() =>
                      navigator.clipboard.writeText(
                        state.history
                          .map((h, i) => `${state.history.length - i}. ${h.name}`)
                          .reverse()
                          .join("\n"),
                      )
                    }
                  >
                    คัดลอก
                  </MiniButton>
                  <MiniButton danger onClick={() => wheelStore.clearHistory()}>
                    ล้าง
                  </MiniButton>
                </div>
              </div>
              <ol className="flex flex-wrap gap-2">
                {state.history.map((h, i) => (
                  <li
                    key={h.id}
                    className={`rounded-lg px-3 py-1.5 text-sm ${
                      i === 0
                        ? "bg-champagne/15 text-champagne"
                        : "tile text-ice/75"
                    }`}
                  >
                    <span className="mr-1.5 font-display text-[11px] text-muted tabular-nums">
                      {state.history.length - i}
                    </span>
                    {h.name}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </div>

      {/* ประกาศผู้ชนะ */}
      <AnimatePresence>
        {showWinner && winnerName && (
          <>
            <GoldDust count={26} />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowWinner(false)}
              className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-6 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.85, y: 18, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                onClick={(e) => e.stopPropagation()}
                className="surface hairline-top relative w-full max-w-md rounded-2xl p-8 text-center"
              >
                <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
                  Winner
                </p>
                <p className="mt-4 font-display text-3xl font-medium wrap-break-word sm:text-4xl">
                  <span className="text-gold-grad">{winnerName}</span>
                </p>
                <div className="mx-auto mt-6 h-px w-20 bg-[linear-gradient(90deg,transparent,rgba(230,200,148,0.5),transparent)]" />
                <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                  <Button onClick={() => setShowWinner(false)}>ปิด</Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowWinner(false);
                      window.setTimeout(() => spin(), 250);
                    }}
                  >
                    หมุนอีกครั้ง
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniButton({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        sfx.play("click");
        onClick();
      }}
      className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        danger
          ? "border-[#e79a9a]/25 text-[#e79a9a]/90 hover:bg-[#e79a9a]/10"
          : "border-hair text-muted hover:text-champagne"
      }`}
    >
      {children}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        sfx.play("click");
        onChange(!checked);
      }}
      className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl tile px-4 py-3 text-left transition-colors hover:border-champagne/35"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
          checked ? "bg-[linear-gradient(90deg,#bd9350,#f0d8ab)]" : "rule"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? 22 : 2 }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-ice">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}
