"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { identityFor } from "@/lib/game";
import { sfx } from "@/lib/sound";
import { pickWinnerIndex, segments, wheelStore } from "@/lib/wheel";
import Crest from "../team/Crest";
import Button from "../ui/Button";
import Figure, { FigureRow } from "../ui/Figure";
import Panel, { PanelHeader } from "../ui/Panel";
import SectionHead from "../ui/SectionHead";
import { Meter, StatTile } from "../ui/hud";
import GoldDust from "../fx/GoldDust";
import Wheel from "./Wheel";

const POINTER_ANGLE = -Math.PI / 2;
const SAMPLE = ["ก้อง", "เบียร์", "ปอนด์", "นัท", "แบงค์", "ฟลุ๊ค", "โอ๊ต", "เจมส์"];
/** แถวแจกแจงยาวเกินนี้กลายเป็นกำแพงตัวเลข ตัดที่จำนวนที่ยังกวาดตาไหว */
const DIST_ROWS = 12;

/**
 * นาฬิกากลางของหน้า — เดินเฉพาะตอนมีคนซับสไครบ์ ทำให้ 'x นาทีที่แล้ว'
 * ขยับเองได้โดยไม่ต้อง setState ใน effect
 */
let clockNow = 0;
let clockTimer = 0;
const clockListeners = new Set<() => void>();
const clockStore = {
  subscribe(fn: () => void) {
    clockListeners.add(fn);
    if (!clockTimer) {
      clockNow = Date.now();
      clockTimer = window.setInterval(() => {
        clockNow = Date.now();
        clockListeners.forEach((l) => l());
      }, 30_000);
    }
    return () => {
      clockListeners.delete(fn);
      if (clockListeners.size === 0) {
        window.clearInterval(clockTimer);
        clockTimer = 0;
      }
    };
  },
  getSnapshot: () => clockNow,
  getServerSnapshot: () => 0,
};

/** ผู้ชนะถูกแช่ไว้เป็นสแนปช็อต ไม่งั้นโหมด 'คัดชื่อที่ออกแล้วทิ้ง' จะลบข้อมูลใต้ป๊อปอัป */
type WinnerInfo = {
  name: string;
  identityIndex: number;
  /** เปอร์เซ็นต์โอกาสของช่องนี้ */
  chance: number;
  /** ชื่อนี้ออกมาแล้วกี่ครั้ง (รวมครั้งนี้) */
  count: number;
  /** จำนวนชื่อทั้งหมดในวงตอนหมุน */
  total: number;
};

const oneDecimal = (n: number) => n.toFixed(1);

export default function WheelView() {
  const state = useSyncExternalStore(
    wheelStore.subscribe,
    wheelStore.getSnapshot,
    wheelStore.getServerSnapshot,
  );
  const now = useSyncExternalStore(
    clockStore.subscribe,
    clockStore.getSnapshot,
    clockStore.getServerSnapshot,
  );
  const reduced = useReducedMotion();

  const [draft, setDraft] = useState("");
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  const [winner, setWinner] = useState<WinnerInfo | null>(null);
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
        const name = entries[index].name;
        setSpinning(false);
        setWinnerIndex(index);
        sfx.play("reveal");
        wheelStore.pushHistory(name);
        recordActivity("wheel.spin", `ได้ "${name}" จาก ${entries.length} ชื่อ`);

        // สรุปตัวเลขจากข้อมูลที่มีอยู่แล้ว ก่อนที่ removeWinner จะไปแก้รายชื่อ
        const totalWeight = entries.reduce(
          (sum, e) => sum + (useWeights ? e.weight : 1),
          0,
        );
        const weight = useWeights ? entries[index].weight : 1;
        setWinner({
          name,
          identityIndex: index,
          chance: (weight / totalWeight) * 100,
          count: wheelStore
            .getSnapshot()
            .history.filter((h) => h.name === name).length,
          total: entries.length,
        });
        setShowWinner(true);

        if (state.removeWinner) {
          window.setTimeout(() => wheelStore.remove(entries[index].id), 1400);
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [rotation, spinning, state.duration, state.removeWinner, state.useWeights],
  );

  // กด Space เพื่อหมุน / Esc เพื่อปิดแท่นประกาศผล
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape" && showWinner) {
        setShowWinner(false);
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (showWinner) {
          setShowWinner(false);
          return;
        }
        spin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [spin, showWinner]);

  const addFromDraft = () => {
    if (!draft.trim()) return;
    wheelStore.addNames(draft.split(/[,\n\t;]+/));
    setDraft("");
    sfx.play("click");
  };

  /**
   * แจกแจงความถี่ — เทียบ "ที่ออกจริง" กับ "โอกาสตามทฤษฎี" บนสเกลเดียวกัน
   * (ทั้งคู่เป็นสัดส่วนของทั้งหมด) จะได้ดูออกว่าวงล้อเอนไปทางไหนหรือแค่บังเอิญ
   */
  const dist = useMemo(() => {
    const spins = state.history.length;
    if (spins === 0) return [];

    const counts = new Map<string, number>();
    for (const h of state.history) counts.set(h.name, (counts.get(h.name) ?? 0) + 1);

    const totalWeight = state.entries.reduce(
      (sum, e) => sum + (state.useWeights ? e.weight : 1),
      0,
    );
    const expectedOf = new Map<string, number>();
    for (const e of state.entries) {
      if (totalWeight > 0) {
        expectedOf.set(e.name, (state.useWeights ? e.weight : 1) / totalWeight);
      }
    }
    // ชื่อที่ยังอยู่ในวงแต่ยังไม่เคยออก ก็ต้องเห็นว่าเป็นศูนย์
    for (const e of state.entries) if (!counts.has(e.name)) counts.set(e.name, 0);

    const rows = [...counts.entries()]
      .map(([name, count]) => ({
        name,
        count,
        observed: count / spins,
        expected: expectedOf.get(name),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"))
      .slice(0, DIST_ROWS);

    const scale = Math.max(
      0.08,
      ...rows.map((r) => Math.max(r.observed, r.expected ?? 0)),
    );
    return rows.map((r) => ({ ...r, scale }));
  }, [state.history, state.entries, state.useWeights]);

  const avgChance =
    state.entries.length > 0 ? 100 / state.entries.length : null;

  return (
    <div className="space-y-8">
      <div>
        <SectionHead
          no="02"
          eyebrow="Lucky wheel"
          title="วงล้อสุ่ม"
          meta={
            state.entries.length > 0
              ? `${state.entries.length} ชื่อ · หมุนแล้ว ${state.history.length} ครั้ง`
              : "ยังไม่มีชื่อ"
          }
        />
        <p className="mt-4 max-w-[52ch] text-sm text-muted">
          ใส่ชื่อ แล้วกดหมุน — หรือใช้เมาส์สะบัดวงล้อเอาก็ได้
          ผลทุกครั้งถูกบันทึกไว้ให้ย้อนดูพร้อมสถิติว่าใครออกบ่อยแค่ไหน
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(320px,380px)_1fr]">
        {/* รายชื่อ — บนมือถือให้วงล้ออยู่บนก่อน */}
        <div className="order-2 space-y-5 lg:order-1">
          <Panel className="p-6">
            <PanelHeader
              eyebrow="Entries"
              title="รายชื่อ"
              action={
                <span className="num font-display text-2xl font-light text-champagne">
                  {state.entries.length}
                </span>
              }
            />

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
                {state.entries.map((entry, i) => {
                  const identity = identityFor(i);
                  return (
                    <motion.li
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      style={{ ["--st" as string]: identity.rgb }}
                      className="tally flex items-center gap-2.5 rounded-lg tile py-2 pr-3 pl-3.5"
                    >
                      <span className="num font-display text-[11px] text-muted">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Crest identity={identity} size={20} className="shrink-0" />
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
                          className="field num w-14 rounded-md px-2 py-1 text-center text-xs text-ice outline-none"
                          title="น้ำหนัก ยิ่งมากยิ่งมีโอกาสออกมาก"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => wheelStore.remove(entry.id)}
                        aria-label={`ลบ ${entry.name}`}
                        className="cursor-pointer px-1 text-xs text-muted transition-colors hover:text-[#e79a9a]"
                      >
                        ✕
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {state.entries.length === 0 && (
                <li className="grid h-24 place-items-center rounded-xl tile-dashed text-sm text-muted">
                  ยังไม่มีชื่อ
                </li>
              )}
            </ul>
          </Panel>

          <Panel className="p-6">
            <PanelHeader eyebrow="Options" title="ลูกเล่น" />

            <div className="space-y-4">
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
                <p className="mb-2 flex items-baseline justify-between text-sm font-medium text-ice/85">
                  <span>ความยาวการหมุน</span>
                  <span className="num text-champagne">{state.duration} วิ</span>
                </p>
                <input
                  type="range"
                  min={2}
                  max={12}
                  value={state.duration}
                  onChange={(e) => wheelStore.set({ duration: Number(e.target.value) })}
                  style={{ ["--fill" as string]: (state.duration - 2) / 10 }}
                  className="w-full cursor-pointer"
                  aria-label="ความยาวการหมุน (วินาที)"
                />
              </div>
            </div>
          </Panel>
        </div>

        {/* วงล้อ */}
        <div className="order-1 space-y-5 lg:order-2">
          <Panel variant="feature" className="p-6 sm:p-8">
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
                size="lg"
                loading={spinning}
                onClick={() => spin()}
                disabled={state.entries.length < 2}
                className="min-w-56"
              >
                {state.entries.length < 2 ? "ใส่ชื่ออย่างน้อย 2 คน" : "หมุนวงล้อ"}
              </Button>
              <p className="text-center text-xs text-muted">
                กด <kbd className="rounded tile px-1.5 py-0.5 text-[11px]">Space</kbd>{" "}
                หรือสะบัดวงล้อด้วยเมาส์ก็ได้
              </p>
            </div>

            <div className="mt-7 grid grid-cols-3 divide-x divide-[rgb(var(--hair)/var(--hair-a))] border-t border-hair pt-5">
              <StatTile
                label="ชื่อในวง"
                value={state.entries.length || "—"}
                className="pr-4"
              />
              <StatTile
                label="หมุนไปแล้ว"
                value={state.history.length || "—"}
                className="px-4"
              />
              <StatTile
                label="โอกาสเฉลี่ย"
                value={avgChance ? `${oneDecimal(avgChance)}%` : "—"}
                className="pl-4"
              />
            </div>
          </Panel>

          {state.history.length > 0 && (
            <Panel className="p-6">
              <PanelHeader
                eyebrow="History"
                title="ประวัติการสุ่ม"
                count={state.history.length}
                action={
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
                }
              />

              <ol className="flex flex-wrap gap-2">
                {state.history.map((h, i) => {
                  const rel = i === 0 ? relTime(h.at, now) : null;
                  return (
                    <li
                      key={h.id}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        i === 0 ? "bg-champagne/15 text-champagne" : "tile text-ice/75"
                      }`}
                    >
                      <span className="num mr-1.5 font-display text-[11px] text-muted">
                        {state.history.length - i}
                      </span>
                      {h.name}
                      {rel && (
                        <span className="num ml-2 text-[11px] text-muted">{rel}</span>
                      )}
                    </li>
                  );
                })}
              </ol>

              {dist.length > 0 && (
                <div className="mt-7 border-t border-hair pt-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="slug slug-2">Distribution</p>
                    <p className="text-[11px] text-muted">
                      เส้นประ = โอกาสตามทฤษฎี
                    </p>
                  </div>

                  <ul className="mt-4 space-y-3">
                    {dist.map((row) => (
                      <li key={row.name}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-sm text-ice/85">
                            {row.name}
                          </span>
                          <span className="num shrink-0 text-[11px] text-muted">
                            {row.count} ครั้ง · {Math.round(row.observed * 100)}%
                          </span>
                        </div>
                        <span className="relative mt-1.5 block">
                          <Meter pct={row.observed / row.scale} h={4} />
                          {row.expected != null && (
                            <span
                              aria-hidden
                              className="absolute inset-y-0 border-l border-dashed border-champagne/55"
                              style={{
                                left: `${Math.min(100, (row.expected / row.scale) * 100)}%`,
                              }}
                            />
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>

      {/* แท่นประกาศผล — portal ออกไป body เพราะ overlay fixed ห้ามอยู่ในการ์ดที่ hover-transform */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showWinner && winner && (
              <>
                <GoldDust count={26} />
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowWinner(false)}
                  role="dialog"
                  aria-modal
                  aria-label={`ผู้ชนะ ${winner.name}`}
                  className="fixed inset-0 z-90 grid items-end justify-items-center bg-black/55 backdrop-blur-sm sm:place-items-center sm:px-6"
                >
                  <motion.div
                    initial={{ scale: 0.9, y: 24, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.96, y: 12, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full sm:w-auto"
                  >
                    <Panel
                      variant="feature"
                      interactive={false}
                      className="relative w-full overflow-hidden rounded-t-3xl px-6 pt-8 pb-[calc(1.75rem+var(--sab))] text-center sm:w-[min(92vw,32rem)] sm:rounded-2xl sm:p-9"
                    >
                      {/* วงแหวนทองแผ่ออกครั้งเดียวตอนเปิด ไม่วนลูป */}
                      {!reduced && (
                        <motion.span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 grid place-items-center"
                          initial={{ opacity: 0.7 }}
                          animate={{ opacity: 0 }}
                          transition={{ duration: 1.2, ease: "easeOut" }}
                        >
                          <motion.span
                            className="block h-40 w-40 rounded-full border border-champagne/60"
                            initial={{ scale: 0.25 }}
                            animate={{ scale: 3.4 }}
                            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </motion.span>
                      )}

                      <div className="relative">
                        <span className="grid justify-items-center">
                          <Crest
                            identity={identityFor(winner.identityIndex)}
                            size={72}
                            locked
                          />
                        </span>

                        <p className="slug mt-5">Winner</p>
                        <p className="mt-3 font-display text-4xl font-light wrap-break-word sm:text-5xl">
                          <span className="text-gold-grad">{winner.name}</span>
                        </p>

                        <span className="mx-auto mt-6 block h-px w-20 bg-[linear-gradient(90deg,transparent,rgb(var(--accent)/.55),transparent)]" />

                        <FigureRow className="mt-6 grid-cols-3! text-left sm:grid-cols-3!">
                          <Figure
                            value={winner.chance}
                            fmt={oneDecimal}
                            suffix="%"
                            label="โอกาส"
                            className="px-2 first:pl-0"
                          />
                          <Figure
                            value={winner.count}
                            label="ครั้งที่ออก"
                            tone="platinum"
                            className="px-4"
                          />
                          <Figure
                            value={winner.total}
                            label="จากทั้งหมด"
                            suffix="ชื่อ"
                            tone="platinum"
                            className="pl-4"
                          />
                        </FigureRow>

                        <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
                          <Button
                            size="lg"
                            autoFocus
                            onClick={() => setShowWinner(false)}
                            className="min-h-11 w-full sm:w-auto"
                          >
                            ปิด
                          </Button>
                          <Button
                            size="lg"
                            variant="ghost"
                            onClick={() => {
                              setShowWinner(false);
                              window.setTimeout(() => spin(), 250);
                            }}
                            className="min-h-11 w-full sm:w-auto"
                          >
                            หมุนอีกครั้ง
                          </Button>
                        </div>
                      </div>
                    </Panel>
                  </motion.div>
                </motion.div>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/** 'x นาทีที่แล้ว' — ฟิลด์ at ของประวัติถูกเก็บมาตลอดแต่ไม่เคยถูกแสดง */
function relTime(iso: string, now: number): string | null {
  if (!now) return null;
  const diff = now - new Date(iso).getTime();
  if (Number.isNaN(diff)) return null;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "เมื่อครู่";
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hr / 24)} วันที่แล้ว`;
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
      role="switch"
      aria-checked={checked}
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
