"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SAMPLE_NAMES, identityFor } from "@/lib/rov";
import { MAX_PER_TEAM, MAX_TEAMS, MIN_PER_TEAM } from "@/lib/teams";
import { sfx } from "@/lib/sound";
import type { Tournament } from "@/hooks/useTournament";
import { configSummary } from "@/hooks/useTournament";
import MagneticButton from "./ui/MagneticButton";
import Panel from "./ui/Panel";

type Props = { t: Tournament };

export default function SetupScreen({ t }: Props) {
  const { state, dispatch, derived } = t;
  const [draft, setDraft] = useState("");
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const summary = useMemo(
    () => configSummary(derived.total, state.config),
    [derived.total, state.config],
  );

  const addFromDraft = () => {
    const names = draft.split(/[,\n\t;]+/);
    if (!names.some((n) => n.trim())) return;
    dispatch({ type: "addNames", names });
    setDraft("");
    sfx.play("click");
    inputRef.current?.focus();
  };

  const addBulk = () => {
    dispatch({ type: "addNames", names: bulkText.split(/[,\n\t;]+/) });
    setBulkText("");
    setBulk(false);
  };

  const canStart = derived.total >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="grid gap-5 lg:grid-cols-[1.15fr_1fr] xl:gap-6"
    >
      {/* ---------------- รายชื่อผู้เล่น ---------------- */}
      <Panel tag="ROSTER" className="p-5 sm:p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-[11px] tracking-[0.3em] text-cyan">
              STEP 01
            </p>
            <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
              ใส่รายชื่อผู้เล่น
            </h2>
          </div>
          <div className="text-right">
            <p className="font-display text-3xl leading-none font-bold text-white tabular-nums">
              {derived.total}
            </p>
            <p className="text-[11px] text-muted">คน</p>
          </div>
        </div>

        {!bulk ? (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addFromDraft();
                  }
                }}
                placeholder="พิมพ์ชื่อแล้วกด Enter..."
                maxLength={120}
                className="w-full rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-base text-white outline-none transition-all placeholder:text-muted/70 focus:border-cyan/60 focus:bg-black/55 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.15)]"
              />
              {draft && (
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] text-muted">
                  ↵ Enter
                </span>
              )}
            </div>
            <MagneticButton
              onClick={addFromDraft}
              disabled={!draft.trim()}
              className="shrink-0 px-5"
            >
              เพิ่ม
            </MagneticButton>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder={"วางรายชื่อทีละบรรทัด\nหรือคั่นด้วยลูกน้ำ"}
              className="w-full resize-y rounded-2xl border border-white/12 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-muted/70 focus:border-cyan/60"
            />
            <div className="flex gap-2">
              <MagneticButton onClick={addBulk} disabled={!bulkText.trim()}>
                เพิ่มทั้งหมด
              </MagneticButton>
              <MagneticButton variant="ghost" onClick={() => setBulk(false)}>
                ยกเลิก
              </MagneticButton>
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!bulk && (
            <Chip onClick={() => setBulk(true)}>📋 วางหลายชื่อพร้อมกัน</Chip>
          )}
          <Chip
            onClick={() =>
              dispatch({ type: "addNames", names: SAMPLE_NAMES.slice(0, 10) })
            }
          >
            ✨ ใส่ชื่อตัวอย่าง
          </Chip>
          {derived.total > 0 && (
            <Chip danger onClick={() => dispatch({ type: "clearPlayers" })}>
              🗑 ล้างทั้งหมด
            </Chip>
          )}
        </div>

        {/* รายชื่อ */}
        <div className="mt-4 max-h-[38vh] min-h-24 overflow-y-auto pr-1 lg:max-h-[46vh]">
          {derived.total === 0 ? (
            <div className="relative grid h-40 place-items-center overflow-hidden rounded-2xl border border-dashed border-white/10 bg-black/20">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_50%,rgba(34,211,238,0.10),transparent_70%)]" />
              <div className="relative text-center">
                <motion.div
                  animate={{ y: [0, -6, 0], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
                  className="mx-auto mb-3 grid h-14 w-14 place-items-center"
                >
                  <span className="hex-clip absolute h-14 w-14 bg-linear-to-br from-cyan/30 to-violet/20" />
                  <span className="relative font-display text-2xl text-cyan">◈</span>
                </motion.div>
                <p className="font-display text-sm tracking-[0.25em] text-cyan/80">
                  NO PLAYERS DETECTED
                </p>
                <p className="mt-1 text-xs text-muted">
                  เริ่มพิมพ์ชื่อด้านบน หรือกดใส่ชื่อตัวอย่าง
                </p>
              </div>
            </div>
          ) : (
            <ul className="flex flex-wrap gap-2">
              <AnimatePresence initial={false}>
                {state.players.map((player, index) => (
                  <motion.li
                    key={player.id}
                    layout
                    initial={{ opacity: 0, scale: 0.7, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    className="group relative"
                  >
                    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/6 py-1.5 pr-1.5 pl-2.5 transition-colors hover:border-cyan/45 hover:bg-white/12">
                      <span className="font-display text-[10px] text-muted tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {editingId === player.id ? (
                        <input
                          autoFocus
                          defaultValue={player.name}
                          onBlur={(e) => {
                            dispatch({
                              type: "renamePlayer",
                              id: player.id,
                              name: e.target.value,
                            });
                            setEditingId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="w-28 rounded-md bg-black/50 px-1.5 py-0.5 text-sm text-white outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingId(player.id)}
                          className="max-w-[10rem] cursor-text truncate text-sm text-white"
                          title="คลิกเพื่อแก้ชื่อ"
                        >
                          {player.name}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`ลบ ${player.name}`}
                        onClick={() =>
                          dispatch({ type: "removePlayer", id: player.id })
                        }
                        className="grid h-6 w-6 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-magenta/25 hover:text-magenta"
                      >
                        ✕
                      </button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </Panel>

      {/* ---------------- ตั้งค่าการแบ่งทีม ---------------- */}
      <Panel tag="CONFIG" accent="168 85 247" className="flex flex-col p-5 sm:p-6">
        <div className="mb-4">
          <p className="font-display text-[11px] tracking-[0.3em] text-violet">
            STEP 02
          </p>
          <h2 className="font-display text-xl font-bold text-white sm:text-2xl">
            ตั้งค่าทีม
          </h2>
        </div>

        <SegmentedControl
          value={state.config.sizeMode}
          onChange={(v) =>
            dispatch({ type: "setConfig", patch: { sizeMode: v as "perTeam" | "teamCount" } })
          }
          options={[
            { value: "perTeam", label: "กำหนดคนต่อทีม" },
            { value: "teamCount", label: "กำหนดจำนวนทีม" },
          ]}
        />

        <div className="mt-5">
          {state.config.sizeMode === "perTeam" ? (
            <Stepper
              label="ทีมละกี่คน"
              value={state.config.perTeam}
              min={MIN_PER_TEAM}
              max={MAX_PER_TEAM}
              suffix="คน / ทีม"
              onChange={(perTeam) => dispatch({ type: "setConfig", patch: { perTeam } })}
            />
          ) : (
            <Stepper
              label="จำนวนทีม"
              value={state.config.teamCount}
              min={1}
              max={MAX_TEAMS}
              suffix="ทีม"
              onChange={(teamCount) =>
                dispatch({ type: "setConfig", patch: { teamCount } })
              }
            />
          )}
        </div>

        {/* พรีวิว */}
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-display text-xs tracking-widest text-muted">
              พรีวิวผลลัพธ์
            </p>
            <p className="font-display text-sm font-bold text-white">
              {summary.teams} ทีม
              {summary.bench > 0 && (
                <span className="ml-1 text-gold">+ สำรอง {summary.bench}</span>
              )}
            </p>
          </div>
          {derived.total === 0 ? (
            <p className="text-sm text-muted">ใส่รายชื่อก่อนถึงจะเห็นพรีวิว</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {summary.sizes.map((size, i) => {
                const id = identityFor(i);
                return (
                  <motion.div
                    key={i}
                    layout
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1"
                    style={{
                      background: `rgb(${id.rgb} / 0.16)`,
                      boxShadow: `inset 0 0 0 1px rgb(${id.rgb} / 0.4)`,
                    }}
                  >
                    <span className="text-xs">{id.glyph}</span>
                    <span
                      className="font-display text-xs font-bold"
                      style={{ color: id.hex }}
                    >
                      {size}
                    </span>
                  </motion.div>
                );
              })}
              {summary.bench > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 px-2 py-1">
                  <span className="text-xs">🪑</span>
                  <span className="font-display text-xs font-bold text-muted">
                    {summary.bench}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ตัวเลือกเสริม */}
        <div className="mt-4 space-y-3">
          {state.config.sizeMode === "perTeam" && (
            <Field label="คนที่เหลือเศษ (หารไม่ลงตัว)">
              <SegmentedControl
                small
                value={state.config.remainderMode}
                onChange={(v) =>
                  dispatch({
                    type: "setConfig",
                    patch: { remainderMode: v as "bench" | "extraTeam" | "balance" },
                  })
                }
                options={[
                  { value: "bench", label: "ตัวสำรอง" },
                  { value: "extraTeam", label: "ตั้งทีมใหม่" },
                  { value: "balance", label: "เกลี่ยลงทีม" },
                ]}
              />
            </Field>
          )}

          <Field label="ลำดับการเติมคน">
            <SegmentedControl
              small
              value={state.config.fillMode}
              onChange={(v) =>
                dispatch({
                  type: "setConfig",
                  patch: { fillMode: v as "sequential" | "roundRobin" },
                })
              }
              options={[
                { value: "sequential", label: "เต็มทีละทีม" },
                { value: "roundRobin", label: "วนทุกทีม" },
              ]}
            />
          </Field>

          <Toggle
            checked={state.config.assignLanes}
            onChange={(assignLanes) =>
              dispatch({ type: "setConfig", patch: { assignLanes } })
            }
            label="สุ่มตำแหน่งเลนให้ด้วย"
            hint="ดาบ / ป่า / กลาง / ท้าย / ซัพ"
          />

          <Field label="Seed สำหรับตรวจสอบย้อนหลัง">
            <div className="flex gap-2">
              <input
                value={state.seed}
                onChange={(e) => dispatch({ type: "setSeed", seed: e.target.value })}
                className="min-w-0 flex-1 rounded-xl border border-white/12 bg-black/40 px-3 py-2 font-display text-sm tracking-widest text-gold uppercase outline-none focus:border-gold/60"
              />
              <button
                type="button"
                onClick={() => {
                  sfx.play("click");
                  dispatch({ type: "reseed" });
                }}
                className="cursor-pointer rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-sm transition-colors hover:bg-white/12"
                title="สุ่ม seed ใหม่"
              >
                🎲
              </button>
            </div>
          </Field>
        </div>

        <div className="mt-6 flex-1" />

        <MagneticButton
          onClick={() => {
            sfx.play("reveal");
            dispatch({ type: "start" });
          }}
          disabled={!canStart}
          strength={0.4}
          className="w-full py-4 text-base"
        >
          🚀 เริ่มจับสลาก
        </MagneticButton>
        {!canStart && (
          <p className="mt-2 text-center text-xs text-muted">
            ต้องมีอย่างน้อย 2 คนถึงจะเริ่มได้
          </p>
        )}
      </Panel>
    </motion.div>
  );
}

/* ------------------------- ชิ้นส่วนเล็กๆ ------------------------- */

function Chip({
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
      className={`cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-all duration-200 ${
        danger
          ? "border-magenta/30 bg-magenta/10 text-magenta hover:bg-magenta/20"
          : "border-white/12 bg-white/5 text-ice/75 hover:border-cyan/40 hover:bg-white/10 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted">{label}</p>
      {children}
    </div>
  );
}

function SegmentedControl({
  value,
  onChange,
  options,
  small,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  small?: boolean;
}) {
  return (
    <div className="relative flex gap-1 rounded-2xl border border-white/10 bg-black/35 p-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              sfx.play("click");
              onChange(opt.value);
            }}
            className={`relative flex-1 cursor-pointer rounded-xl px-2 py-2 font-display font-semibold transition-colors duration-200 ${
              small ? "text-[11px]" : "text-xs sm:text-sm"
            } ${active ? "text-white" : "text-muted hover:text-ice"}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((o) => o.value).join("-")}`}
                className="absolute inset-0 rounded-xl bg-linear-to-r from-cyan/25 to-violet/25 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const bump = (delta: number) => {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) {
      sfx.play("click");
      onChange(next);
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm text-ice/80">{label}</p>
        <div className="flex items-center gap-2">
          <StepButton onClick={() => bump(-1)} disabled={value <= min}>
            −
          </StepButton>
          <motion.span
            key={value}
            initial={{ scale: 1.35, color: "#22d3ee" }}
            animate={{ scale: 1, color: "#ffffff" }}
            className="w-10 text-center font-display text-3xl font-bold tabular-nums"
          >
            {value}
          </motion.span>
          <StepButton onClick={() => bump(1)} disabled={value >= max}>
            +
          </StepButton>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ["--fill" as string]: `${pct}%` }}
        className="w-full cursor-pointer"
        aria-label={label}
      />
      <p className="mt-1 text-right text-[11px] text-muted">{suffix}</p>
    </div>
  );
}

function StepButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl border border-white/12 bg-white/5 font-display text-xl leading-none text-ice transition-all hover:border-cyan/50 hover:bg-cyan/15 active:scale-90 disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
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
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/25 px-3 py-2.5 text-left transition-colors hover:border-white/20"
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${
          checked ? "bg-linear-to-r from-cyan to-violet" : "bg-white/12"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? 22 : 2 }}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-white">{label}</span>
        {hint && <span className="block text-[11px] text-muted">{hint}</span>}
      </span>
    </button>
  );
}
