"use client";

import { standings } from "@/lib/tournament/bracket";
import { PRIZE_PRESETS, calcPrizes, formatMoney } from "@/lib/tournament/prize";
import { tournamentStore } from "@/lib/tournament/store";
import type { PrizeSlot, Tournament } from "@/lib/tournament/types";
import Panel from "../ui/Panel";
import { Input, Label } from "./ui";

type Props = { tournament: Tournament; isAdmin: boolean };

export default function PrizePanel({ tournament, isAdmin }: Props) {
  const { prize } = tournament;
  const { breakdown, allocated, remaining, percentUsed } = calcPrizes(prize);
  const table = standings(tournament);
  const winnerOf = (place: number) =>
    table.filter((row) => row.placement === place).map((row) => row.team.name);

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

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,400px)]">
      <Panel className="p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
              Prize pool
            </p>
            <p className="mt-1.5 font-display text-3xl font-light text-champagne">
              {formatMoney(prize.total, prize.currency)}
            </p>
          </div>
          {isAdmin && (
            <div className="flex items-end gap-2">
              <div>
                <Label>ยอดรวม</Label>
                <Input
                  type="number"
                  min={0}
                  value={prize.total}
                  onChange={(e) => setPrize({ total: Number(e.target.value) || 0 })}
                  className="w-36"
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
        </div>

        <ul className="space-y-2.5">
          {breakdown.map((row, index) => {
            const winners = winnerOf(row.slot.place);
            return (
              <li
                key={index}
                className="grid items-center gap-3 rounded-xl tile px-4 py-3 sm:grid-cols-[auto_1fr_auto]"
              >
                <span className="font-display text-lg text-champagne tabular-nums">
                  {row.slot.place}
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
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={row.slot.percent}
                          onChange={(e) =>
                            setSlot(index, {
                              percent: Number(e.target.value) || 0,
                              fixed: undefined,
                            })
                          }
                          className="w-20 text-center"
                          disabled={row.slot.fixed != null}
                        />
                        <span className="text-xs text-muted">%</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={0}
                          placeholder="ระบุยอดตายตัว"
                          value={row.slot.fixed ?? ""}
                          onChange={(e) =>
                            setSlot(index, {
                              fixed: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          className="w-36"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSlot(index)}
                        className="cursor-pointer px-1.5 text-xs text-muted transition-colors hover:text-[#e79a9a]"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-ice">{row.slot.label}</p>
                      {winners.length > 0 && (
                        <p className="mt-0.5 text-xs text-champagne">
                          {winners.join(" · ")}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <span className="text-right font-display text-lg text-ice tabular-nums">
                  {formatMoney(row.amount, prize.currency)}
                </span>
              </li>
            );
          })}
        </ul>

        {isAdmin && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={addSlot}
              className="cursor-pointer rounded-lg tile px-3 py-1.5 text-xs text-muted transition-colors hover:text-champagne"
            >
              + เพิ่มอันดับ
            </button>
            {PRIZE_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                onClick={() => setPrize({ slots: preset.slots.map((s) => ({ ...s })) })}
                className="cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-champagne"
              >
                {preset.name}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 grid gap-2 border-t border-hair pt-4 text-sm sm:grid-cols-3">
          <p className="text-muted">
            แบ่งไปแล้ว{" "}
            <span className="text-ice">{formatMoney(allocated, prize.currency)}</span>
          </p>
          <p className="text-muted">
            ใช้ไป <span className="text-ice">{percentUsed}%</span>
          </p>
          <p
            className={
              remaining === 0
                ? "text-muted"
                : remaining > 0
                  ? "text-champagne"
                  : "text-[#e79a9a]"
            }
          >
            {remaining === 0
              ? "แบ่งครบพอดี"
              : remaining > 0
                ? `เหลือ ${formatMoney(remaining, prize.currency)}`
                : `เกินมา ${formatMoney(-remaining, prize.currency)}`}
          </p>
        </div>
      </Panel>

      <Panel className="p-6">
        <h3 className="font-display text-lg font-medium text-ice">อันดับปัจจุบัน</h3>
        <p className="mt-1 text-xs text-muted">
          คำนวณจากรอบที่ตกรอบ — ตกรอบเดียวกันถือว่าอันดับเท่ากัน
        </p>

        <ol className="mt-5 space-y-2">
          {table.map((row) => (
            <li
              key={row.team.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2"
              style={
                row.placement === 1
                  ? {
                      background: "rgb(207 167 101 / 0.12)",
                      boxShadow: "inset 0 0 0 1px rgb(207 167 101 / 0.3)",
                    }
                  : undefined
              }
            >
              <span className="w-6 font-display text-sm text-muted tabular-nums">
                {row.placement > 0 ? row.placement : "–"}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ice">
                {row.team.name}
              </span>
              {row.placement === 1 && (
                <span className="font-display text-xs text-champagne">แชมป์</span>
              )}
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
