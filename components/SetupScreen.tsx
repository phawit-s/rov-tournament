"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SAMPLE_NAMES, identityFor } from "@/lib/rov";
import { MAX_PER_TEAM, MAX_TEAMS, MIN_PER_TEAM } from "@/lib/teams";
import { sfx } from "@/lib/sound";
import type { Tournament } from "@/hooks/useTournament";
import { configSummary } from "@/hooks/useTournament";
import Button from "./ui/Button";
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

  const canStart = derived.total >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="grid gap-5 lg:grid-cols-[1.1fr_1fr] xl:gap-6"
    >
      {/* ---------------- รายชื่อผู้เล่น ---------------- */}
      <Panel className="p-6 sm:p-7">
        <SectionHead step="01" title="ใส่รายชื่อผู้เล่น" count={derived.total} />

        {!bulk ? (
          <div className="flex gap-2.5">
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
                placeholder="พิมพ์ชื่อแล้วกด Enter"
                maxLength={120}
                className="w-full field rounded-xl px-4 py-3 text-base text-ice outline-none transition-all duration-300 placeholder:text-muted/80"
              />
              {draft && (
                <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[11px] text-muted">
                  ↵
                </span>
              )}
            </div>
            <Button onClick={addFromDraft} disabled={!draft.trim()} className="shrink-0 px-6">
              เพิ่ม
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              rows={6}
              placeholder={"วางรายชื่อทีละบรรทัด\nหรือคั่นด้วยลูกน้ำ"}
              className="w-full resize-y field rounded-xl px-4 py-3 text-sm text-ice outline-none placeholder:text-muted/80 focus:border-champagne/50"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  dispatch({ type: "addNames", names: bulkText.split(/[,\n\t;]+/) });
                  setBulkText("");
                  setBulk(false);
                }}
                disabled={!bulkText.trim()}
              >
                เพิ่มทั้งหมด
              </Button>
              <Button variant="ghost" onClick={() => setBulk(false)}>
                ยกเลิก
              </Button>
            </div>
          </div>
        )}

        <div className="mt-3.5 flex flex-wrap gap-2">
          {!bulk && <Chip onClick={() => setBulk(true)}>วางหลายชื่อพร้อมกัน</Chip>}
          <Chip
            onClick={() =>
              dispatch({ type: "addNames", names: SAMPLE_NAMES.slice(0, 10) })
            }
          >
            ใส่ชื่อตัวอย่าง
          </Chip>
          {derived.total > 0 && (
            <Chip danger onClick={() => dispatch({ type: "clearPlayers" })}>
              ล้างทั้งหมด
            </Chip>
          )}
        </div>

        <div className="mt-5 max-h-[38vh] min-h-28 overflow-y-auto pr-1 lg:max-h-[46vh]">
          {derived.total === 0 ? (
            <div className="grid h-32 place-items-center rounded-xl tile-dashed">
              <div className="text-center">
                <p className="font-display text-sm tracking-[0.2em] text-champagne/70">
                  ยังไม่มีรายชื่อ
                </p>
                <p className="mt-1.5 text-xs text-muted">
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
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  >
                    <div className="flex items-center gap-2 tile rounded-lg py-1.5 pr-1.5 pl-3 transition-colors duration-300 hover:border-champagne/35 hover-tile">
                      <span className="font-display text-[11px] text-muted tabular-nums">
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
                          className="w-28 field rounded-md px-1.5 py-0.5 text-sm text-ice outline-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingId(player.id)}
                          className="max-w-40 cursor-text truncate text-sm text-ice"
                          title="คลิกเพื่อแก้ชื่อ"
                        >
                          {player.name}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`ลบ ${player.name}`}
                        onClick={() => dispatch({ type: "removePlayer", id: player.id })}
                        className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-muted transition-colors hover-tile hover:text-[#e79a9a]"
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
      <Panel className="flex flex-col p-6 sm:p-7">
        <SectionHead step="02" title="ตั้งค่าทีม" />

        <Segmented
          value={state.config.sizeMode}
          onChange={(v) =>
            dispatch({
              type: "setConfig",
              patch: { sizeMode: v as "perTeam" | "teamCount" },
            })
          }
          options={[
            { value: "perTeam", label: "กำหนดคนต่อทีม" },
            { value: "teamCount", label: "กำหนดจำนวนทีม" },
          ]}
        />

        <div className="mt-6">
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

        <div className="my-6 h-px rule" />

        {/* พรีวิว */}
        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-medium text-ice/85">พรีวิวผลลัพธ์</p>
            <p className="font-display text-sm text-champagne">
              {summary.teams} ทีม
              {summary.bench > 0 && (
                <span className="ml-1.5 text-muted">+ สำรอง {summary.bench}</span>
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
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
                    style={{
                      borderColor: `rgb(${id.rgb} / 0.35)`,
                      background: `rgb(${id.rgb} / 0.08)`,
                    }}
                  >
                    <span className="text-[10px]" style={{ color: id.hex }}>
                      {id.glyph}
                    </span>
                    <span className="font-display text-xs" style={{ color: id.hex }}>
                      {size}
                    </span>
                  </motion.div>
                );
              })}
              {summary.bench > 0 && (
                <div className="flex items-center gap-2 rounded-lg border tile-dashed px-2.5 py-1.5">
                  <span className="font-display text-xs text-muted">
                    ○ {summary.bench}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="my-6 h-px rule" />

        <div className="space-y-5">
          {state.config.sizeMode === "perTeam" && (
            <Field label="คนที่เหลือเศษ (หารไม่ลงตัว)">
              <Segmented
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
            <Segmented
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
                className="min-w-0 flex-1 field rounded-xl px-3.5 py-2.5 font-display text-sm tracking-[0.18em] text-champagne uppercase outline-none focus:border-champagne/50"
              />
              <button
                type="button"
                onClick={() => {
                  sfx.play("click");
                  dispatch({ type: "reseed" });
                }}
                className="cursor-pointer rounded-xl border border-hair tile px-3.5 text-sm text-ice/80 transition-colors hover:border-champagne/40 hover:text-champagne"
                title="สุ่ม seed ใหม่"
              >
                ↻
              </button>
            </div>
          </Field>
        </div>

        <div className="mt-8 flex-1" />

        <Button
          onClick={() => {
            sfx.play("reveal");
            dispatch({ type: "start" });
          }}
          disabled={!canStart}
          className="w-full py-4 text-base"
        >
          เริ่มจับสลาก
        </Button>
        {!canStart && (
          <p className="mt-2.5 text-center text-xs text-muted">
            ต้องมีอย่างน้อย 2 คนถึงจะเริ่มได้
          </p>
        )}
      </Panel>
    </motion.div>
  );
}

/* ------------------------- ชิ้นส่วนเล็กๆ ------------------------- */

function SectionHead({
  step,
  title,
  count,
}: {
  step: string;
  title: string;
  count?: number;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
          Step {step}
        </p>
        <h2 className="mt-1.5 font-display text-xl font-medium text-ice sm:text-2xl">
          {title}
        </h2>
      </div>
      {count !== undefined && (
        <div className="text-right">
          <p className="font-display text-3xl leading-none font-light text-ice tabular-nums">
            {count}
          </p>
          <p className="mt-1 text-xs text-muted">คน</p>
        </div>
      )}
    </div>
  );
}

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
      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-all duration-300 ${
        danger
          ? "border-[#e79a9a]/25 text-[#e79a9a]/90 hover:bg-[#e79a9a]/10"
          : "border-hair text-ice/75 hover:border-champagne/35 hover:text-champagne"
      }`}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-sm font-medium text-ice/85">{label}</p>
      {children}
    </div>
  );
}

function Segmented({
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
    <div className="relative flex gap-1 tile rounded-xl p-1">
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
            className={`relative flex-1 cursor-pointer rounded-lg px-2 py-2.5 font-display transition-colors duration-300 ${
              small ? "text-xs" : "text-sm"
            } ${active ? "text-[#1b1509]" : "text-ice/65 hover:text-ice"}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${options.map((o) => o.value).join("-")}`}
                className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)]"
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
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
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-ice/85">{label}</p>
        <div className="flex items-center gap-3">
          <StepButton onClick={() => bump(-1)} disabled={value <= min}>
            −
          </StepButton>
          <motion.span
            key={value}
            initial={{ opacity: 0.4, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-10 text-center font-display text-3xl font-light text-champagne tabular-nums"
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
      <p className="mt-2 text-right text-xs text-muted">{suffix}</p>
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
      className="grid h-9 w-9 cursor-pointer place-items-center rounded-full border border-hair text-lg leading-none text-ice/80 transition-all duration-300 hover:border-champagne/45 hover:text-champagne active:scale-90 disabled:cursor-not-allowed disabled:opacity-25"
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
      className="flex w-full cursor-pointer items-center gap-3.5 tile rounded-xl px-4 py-3 text-left transition-colors duration-300 hover:border-champagne/35"
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
