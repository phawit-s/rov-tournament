"use client";

import { useCallback } from "react";
import { motion, useReducedMotion } from "motion/react";
import { standings } from "@/lib/tournament/bracket";
import { PRIZE_PRESETS, calcPrizes, formatMoney } from "@/lib/tournament/prize";
import { tournamentStore } from "@/lib/tournament/store";
import type { PrizeSlot, Tournament } from "@/lib/tournament/types";
import Figure from "../ui/Figure";
import Panel from "../ui/Panel";
import { EmptyState, Input, Label, NumberInput } from "./ui";

type Props = { tournament: Tournament; isAdmin: boolean };

/** ไล่เฉดตามอันดับ: ที่ 1 สว่างสุด อันดับท้ายๆ เข้มลงไปทางทองเก่า */
function rampColor(index: number, count: number): string {
  const t = count <= 1 ? 0 : index / (count - 1);
  const champagne = Math.round((1 - t) * 100);
  return `color-mix(in srgb, var(--color-champagne) ${champagne}%, var(--color-gold-deep))`;
}

const PODIUM_INK: Record<number, string> = {
  1: "var(--color-champagne)",
  2: "var(--color-platinum)",
  3: "#c98c5a",
};

/** เหรียญเส้นบาง ใช้แทนคำว่า "แชมป์" ที่เคยเป็นตัวหนังสือลอยๆ */
function Medal({ place, className = "h-4 w-4" }: { place: number; className?: string }) {
  const c = PODIUM_INK[place] ?? "var(--color-muted)";
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7.6 2.4l3 6.1M16.4 2.4l-3 6.1" />
      <circle cx="12" cy="15.2" r="6" />
      <path d="M12 11.7l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" />
    </svg>
  );
}

export default function PrizePanel({ tournament, isAdmin }: Props) {
  const { prize } = tournament;
  const { breakdown, allocated, remaining, percentUsed } = calcPrizes(prize);
  const table = standings(tournament);
  const reduced = useReducedMotion();

  const winnerOf = (place: number) =>
    table.filter((row) => row.placement === place).map((row) => row.team.name);

  const money = useCallback(
    (n: number) => formatMoney(Math.round(n), prize.currency),
    [prize.currency],
  );

  const setPrize = (patch: Partial<typeof prize>) =>
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      prize: { ...t.prize, ...patch },
    }));

  const setSlot = (index: number, patch: Partial<PrizeSlot>) =>
    setPrize({
      slots: prize.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });

  const addSlot = () =>
    setPrize({
      slots: [
        ...prize.slots,
        {
          place: prize.slots.length + 1,
          label: `อันดับ ${prize.slots.length + 1}`,
          percent: 0,
        },
      ],
    });

  const removeSlot = (index: number) =>
    setPrize({ slots: prize.slots.filter((_, i) => i !== index) });

  // แถบจัดสรร: ฐานคือยอดที่มากกว่าระหว่าง "ยอดรวม" กับ "แบ่งไปแล้ว"
  // จะได้เห็นทั้งกรณีแบ่งไม่หมดและกรณีแบ่งเกิน บนสเกลเดียวกัน
  const base = Math.max(prize.total, allocated) || 1;
  const overrun = remaining < 0;

  // แท่นรางวัลสามอันดับแรก — ความสูงตามสัดส่วนเงินจริง
  const podium = [2, 1, 3]
    .map((place) => {
      const row = breakdown.find((b) => b.slot.place === place);
      return row ? { place, row } : null;
    })
    .filter((x): x is { place: number; row: (typeof breakdown)[number] } => x !== null);
  const podiumMax = Math.max(1, ...podium.map((p) => p.row.amount));

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,400px)]">
      <div className="space-y-5">
        {/* ---------- ยอดรวม + แท่นรางวัล ---------- */}
        <Panel className="p-6">
          <Panel.Header eyebrow="Prize pool" title="เงินรางวัล" />

          <div className="grid gap-6 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-end">
            {/* key = total เพื่อให้ตัวเลขนับใหม่ทุกครั้งที่ผู้จัดแก้ยอด ไม่ค้างที่ค่าเก่า
                ยอดเงินยาวกว่าตัวเลขทั่วไป จึงย่อสเกล .fig ลงให้พอดีคอลัมน์ */}
            <Figure
              key={prize.total}
              value={prize.total}
              label="เงินรางวัลรวม"
              fmt={money}
              className="min-w-0 [&_.fig]:text-[clamp(2rem,3.6vw,3rem)]"
            />

            {podium.length > 0 && prize.total > 0 && (
              <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
                {podium.map(({ place, row }) => (
                  <PodiumStep
                    key={place}
                    place={place}
                    label={row.slot.label}
                    amount={row.amount}
                    currency={prize.currency}
                    winners={winnerOf(place)}
                    ratio={row.amount / podiumMax}
                    reduced={!!reduced}
                  />
                ))}
              </div>
            )}
          </div>

          {isAdmin && (
            <div className="mt-6 flex flex-wrap items-end gap-3 border-t border-hair pt-5">
              <div className="min-w-0 flex-1">
                <Label>ยอดรวม</Label>
                <NumberInput
                  value={prize.total}
                  onChange={(total) => setPrize({ total })}
                  max={100000000}
                  placeholder="0"
                  className="w-full max-w-44"
                />
              </div>
              <div>
                <Label>สกุล</Label>
                <Input
                  value={prize.currency}
                  onChange={(e) => setPrize({ currency: e.target.value })}
                  className="w-16 text-center"
                  maxLength={3}
                />
              </div>
            </div>
          )}

          {/* ---------- แถบจัดสรรเงินรางวัล ---------- */}
          <div className="mt-7 border-t border-hair pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="slug">การจัดสรร</span>
              <span className="num text-xs text-muted">
                แบ่งไปแล้ว <span className="text-ice">{money(allocated)}</span> ·{" "}
                {percentUsed}%
              </span>
            </div>

            <div className="rule relative mt-3 flex h-2.5 w-full overflow-hidden rounded-full">
              {breakdown.map((row, i) => (
                <motion.span
                  key={`${row.slot.place}-${i}`}
                  className="block h-full shrink-0"
                  style={{ background: rampColor(i, breakdown.length) }}
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: `${(row.amount / base) * 100}%` }}
                  transition={{
                    duration: 0.7,
                    delay: i * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  title={`${row.slot.label} · ${money(row.amount)}`}
                />
              ))}

              {/* แบ่งเกินยอดรวม — ทาส่วนที่ล้นออกไปด้วยสีเตือน พร้อมเส้นบอกขีดยอดรวม */}
              {overrun && (
                <>
                  <span
                    className="absolute inset-y-0 right-0 bg-[#e79a9a]"
                    style={{ left: `${(prize.total / base) * 100}%` }}
                  />
                  <span
                    className="absolute inset-y-0 w-px bg-ice/70"
                    style={{ left: `${(prize.total / base) * 100}%` }}
                  />
                </>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {breakdown.map((row, i) => (
                  <span key={`${row.slot.place}-legend`} className="flex items-center gap-1.5 text-muted">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: rampColor(i, breakdown.length) }}
                    />
                    {row.slot.label}
                  </span>
                ))}
              </span>
              <span
                className={`num ${
                  remaining === 0
                    ? "text-muted"
                    : remaining > 0
                      ? "text-champagne"
                      : "text-[#e79a9a]"
                }`}
              >
                {remaining === 0
                  ? "แบ่งครบพอดี"
                  : remaining > 0
                    ? `เหลือ ${money(remaining)}`
                    : `เกินมา ${money(-remaining)}`}
              </span>
            </div>
          </div>
        </Panel>

        {/* ---------- ตารางแบ่งรางวัล ---------- */}
        <Panel className="p-6">
          <Panel.Header eyebrow="Breakdown" title="แบ่งรางวัล" count={breakdown.length} />

          {breakdown.length === 0 ? (
            <EmptyState
              title="ยังไม่ได้ตั้งการแบ่งรางวัล"
              description="เลือกรูปแบบสำเร็จรูปด้านล่าง หรือกดเพิ่มอันดับเอง"
            />
          ) : (
            <ul className="space-y-2.5">
              {breakdown.map((row, index) => {
                const winners = winnerOf(row.slot.place);
                return (
                  <li
                    key={index}
                    className="tile relative grid items-center gap-3 overflow-hidden rounded-xl px-4 py-3 sm:grid-cols-[auto_1fr_auto]"
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-0.75"
                      style={{ background: rampColor(index, breakdown.length) }}
                      aria-hidden
                    />

                    <span className="flex items-center gap-2">
                      {row.slot.place <= 3 ? (
                        <Medal place={row.slot.place} className="h-5 w-5" />
                      ) : (
                        <span className="grid h-5 w-5 place-items-center" aria-hidden />
                      )}
                      <span className="num font-display text-lg text-champagne">
                        {row.slot.place}
                      </span>
                    </span>

                    <div className="min-w-0">
                      {isAdmin ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            value={row.slot.label}
                            onChange={(e) => setSlot(index, { label: e.target.value })}
                            className="w-40"
                          />
                          <div className="flex items-center gap-1.5">
                            <NumberInput
                              max={100}
                              value={row.slot.percent}
                              onChange={(percent) =>
                                setSlot(index, { percent, fixed: undefined })
                              }
                              className="w-20 text-center"
                              disabled={row.slot.fixed != null}
                              placeholder="0"
                            />
                            <span className="text-xs text-muted">%</span>
                          </div>
                          <NumberInput
                            placeholder="ยอดตายตัว"
                            value={row.slot.fixed ?? 0}
                            onChange={(fixed) =>
                              setSlot(index, { fixed: fixed > 0 ? fixed : undefined })
                            }
                            className="w-36"
                          />
                          <button
                            type="button"
                            onClick={() => removeSlot(index)}
                            aria-label={`ลบ ${row.slot.label}`}
                            className="cursor-pointer px-1.5 text-xs text-muted transition-colors hover:text-[#e79a9a]"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-ice">{row.slot.label}</p>
                          {winners.length > 0 && (
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-champagne">
                              {winners.join(" · ")}
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    <span
                      className={`num text-right font-display text-lg ${
                        row.slot.place === 1 ? "text-gold-grad" : "text-ice"
                      }`}
                    >
                      {money(row.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {isAdmin && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-hair pt-4">
              <button
                type="button"
                onClick={addSlot}
                className="tile cursor-pointer rounded-lg px-3 py-1.5 text-xs text-muted transition-colors hover:text-champagne"
              >
                + เพิ่มอันดับ
              </button>
              {PRIZE_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() =>
                    setPrize({ slots: preset.slots.map((s) => ({ ...s })) })
                  }
                  className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-champagne"
                >
                  {preset.name}
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      {/* ---------- อันดับปัจจุบัน ---------- */}
      <Panel className="p-6 lg:sticky lg:top-24 lg:self-start">
        <Panel.Header
          eyebrow="Standings"
          title="อันดับปัจจุบัน"
          count={table.length || null}
        />
        <p className="-mt-2 mb-4 text-xs leading-relaxed text-muted">
          คำนวณจากรอบที่ตกรอบ — ตกรอบเดียวกันถือว่าอันดับเท่ากัน
        </p>

        {table.length === 0 ? (
          <EmptyState
            title="ยังไม่มีอันดับ"
            description="จัดสายและกรอกผลก่อน ระบบจะจัดอันดับให้อัตโนมัติ"
          />
        ) : (
          <ol className="space-y-1.5">
            {table.map((row) => {
              const podiumRow = row.placement >= 1 && row.placement <= 3;
              return (
                <li
                  key={row.team.id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    podiumRow ? "tile" : ""
                  }`}
                  style={
                    row.placement === 1
                      ? {
                          background: "rgb(var(--accent) / 0.12)",
                          boxShadow: "inset 0 0 0 1px rgb(var(--accent) / 0.3)",
                        }
                      : undefined
                  }
                >
                  <span className="num w-6 font-display text-sm text-muted">
                    {row.placement > 0 ? row.placement : "–"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ice">
                    {row.team.name}
                  </span>
                  {podiumRow && <Medal place={row.placement} className="h-4.5 w-4.5" />}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}

/** แท่นรางวัลหนึ่งช่อง — สูงตามสัดส่วนเงินจริง ที่ 1 ยกเป็นการ์ดตัวเอก */
function PodiumStep({
  place,
  label,
  amount,
  currency,
  winners,
  ratio,
  reduced,
}: {
  place: number;
  label: string;
  amount: number;
  currency: string;
  winners: string[];
  ratio: number;
  reduced: boolean;
}) {
  const ink = PODIUM_INK[place] ?? "var(--color-muted)";
  // ต่ำสุด 2.5rem สูงสุด 6rem — ต่างกันพอให้เห็นลำดับแต่ไม่ล้นการ์ด
  const height = `${2.5 + Math.max(0, Math.min(1, ratio)) * 3.5}rem`;

  const body = (
    <div className="flex h-full flex-col items-center text-center">
      <Medal place={place} className="h-6 w-6" />
      <p className={`slug mt-1.5 ${place === 2 ? "slug-2" : ""}`}>{label}</p>
      <p className="mt-1 w-full truncate text-xs text-ice" title={winners.join(" · ")}>
        {winners.length > 0 ? winners.join(" · ") : "—"}
      </p>
      <p
        className={`num mt-1 font-display text-sm ${place === 1 ? "text-gold-grad" : ""}`}
        style={place === 1 ? undefined : { color: ink }}
      >
        {formatMoney(amount, currency)}
      </p>

      <span className="flex-1" />

      <motion.span
        className="mt-3 block w-full rounded-t-lg"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${ink} 34%, transparent), transparent)`,
          boxShadow: `inset 0 1px 0 color-mix(in srgb, ${ink} 55%, transparent)`,
        }}
        initial={reduced ? false : { height: 0 }}
        animate={{ height }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <span
          className="fig num block pt-2 text-center text-4xl opacity-70"
          style={{ color: ink }}
        >
          {place}
        </span>
      </motion.span>
    </div>
  );

  if (place === 1) {
    return (
      <Panel variant="feature" interactive={false} className="overflow-hidden p-2.5 pb-0">
        {body}
      </Panel>
    );
  }
  return <div className="p-2.5 pb-0">{body}</div>;
}
