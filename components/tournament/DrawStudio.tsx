"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { BENCH_IDENTITY, identityFor } from "@/lib/game";
import { makeSeed, uid } from "@/lib/random";
import { sfx } from "@/lib/sound";
import { buildTeams, clamp, drawOrder, planTeams, teamsToText } from "@/lib/teams";
import { tournamentStore } from "@/lib/tournament/store";
import type { SoloEntry, TeamEntry, Tournament } from "@/lib/tournament/types";
import type { Config, Player } from "@/lib/types";
import DrawMachine from "../DrawMachine";
import TeamBoard from "../TeamBoard";
import Sequence from "../fx/Sequence";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { PipRail } from "../ui/hud";
import { toast } from "../ui/Toast";
import { Label, NumberInput } from "./ui";

/**
 * โรงจับสลากของทัวร์ — ยกพิธีจากหน้า /draw มาไว้ในทัวร์ทั้งชุด
 *
 * ของเดิมปุ่ม "สุ่มแบ่งทีม" ในแท็บทีมเป็นการคำนวณเงียบๆ ครั้งเดียวจบ:
 * หั่นรายชื่อเป็นก้อนละ teamSize ตามลำดับที่สุ่มไว้ แล้วเขียนทับ tournament.teams
 * ทันที ไม่มีให้ตั้งค่า ไม่มีให้ดูก่อน ไม่มีตัวสำรอง ไม่มีเลน และย้อนกลับไม่ได้ —
 * ทั้งที่หน้า /draw ซึ่งเป็นเครื่องมือเดียวกันมีครบทุกอย่างและเป็นโมเมนต์ที่คนดูรอ
 *
 * ที่นี่ใช้เครื่องคิดชุดเดียวกับ /draw (lib/teams.ts) เป๊ะๆ ทั้ง planTeams,
 * drawOrder และ buildTeams จึงได้ผลเหมือนกันเมื่อ seed เท่ากัน
 * ต่างกันแค่ต้นทาง (ผู้สมัครในทัวร์ ไม่ใช่รายชื่อที่พิมพ์เอง) และปลายทาง
 * (เขียนกลับเป็นทีมของทัวร์เมื่อกดยืนยัน ไม่ใช่แค่รูปสรุป)
 */
type Phase = "setup" | "draw" | "done";

type Props = {
  tournament: Tournament;
  onClose: () => void;
};

/** ผู้สมัครเดี่ยวที่ผ่านแล้ว -> ผู้เล่นในเครื่องจับสลาก */
function toPlayers(list: SoloEntry[]): Player[] {
  return list
    .filter((p) => p.approved)
    .map((p) => ({ id: p.id, name: p.ign?.trim() || p.name }));
}

export default function DrawStudio({ tournament, onClose }: Props) {
  const reduced = useReducedMotion();

  const players = useMemo(
    () => toPlayers(tournament.soloPlayers),
    [tournament.soloPlayers],
  );
  const total = players.length;

  const [phase, setPhase] = useState<Phase>("setup");
  const [seed, setSeed] = useState(() => makeSeed());
  const [revealed, setRevealed] = useState(0);
  const [teamNames, setTeamNames] = useState<Record<number, string>>({});
  const [flashIndex, setFlashIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  /* ค่าเริ่มต้นเดาจากทัวร์ — ทัวร์บอกอยู่แล้วว่าทีมละกี่คน ไม่ต้องถามซ้ำ */
  const [config, setConfig] = useState<Config>(() => ({
    sizeMode: "perTeam",
    perTeam: clamp(tournament.teamSize || 5, 1, 10),
    teamCount: Math.max(2, Math.round(total / Math.max(1, tournament.teamSize || 5))),
    remainderMode: "bench",
    fillMode: "sequential",
    assignLanes: true,
  }));

  const plan = useMemo(() => planTeams(total, config), [total, config]);
  const order = useMemo(() => drawOrder(players, seed), [players, seed]);
  const { teams, bench } = useMemo(
    () => buildTeams(order, plan, revealed, seed, config.assignLanes),
    [order, plan, revealed, seed, config.assignLanes],
  );

  const remaining = useMemo(() => order.slice(revealed), [order, revealed]);
  const nextSlot = plan.slots[revealed] ?? null;
  const isComplete = total > 0 && revealed >= total;
  const ceremony = isComplete && phase === "draw";

  const patch = (next: Partial<Config>) => {
    setConfig((prev) => ({ ...prev, ...next }));
    setRevealed(0);
  };

  const identity =
    nextSlot === null
      ? null
      : nextSlot.teamIndex === null
        ? BENCH_IDENTITY
        : identityFor(nextSlot.teamIndex);
  const label =
    nextSlot === null || identity === null
      ? ""
      : nextSlot.teamIndex === null
        ? BENCH_IDENTITY.name
        : teamNames[nextSlot.teamIndex] || identity.name;

  /** สีของขีดที่ i บนราง = สีทีมที่คนลำดับนั้นถูกส่งเข้าไป */
  const railColor = (i: number) => {
    const s = plan.slots[i];
    if (!s || s.teamIndex === null) return BENCH_IDENTITY.rgb;
    return identityFor(s.teamIndex).rgb;
  };

  /**
   * เขียนผลกลับเข้าทัวร์
   *
   * ล้างสายเดิมทิ้งด้วย — ทีมเปลี่ยนแล้วสายเก่าชี้ไปทีมที่ไม่มีอยู่จริง
   * ปล่อยไว้จะได้ตารางแข่งที่มีช่องว่างเปล่าโดยไม่มีอะไรฟ้อง
   */
  const commit = () => {
    if (!teams.length) return;
    setSaving(true);
    const stamp = new Date().toISOString();
    const built: TeamEntry[] = teams.map((team, i) => ({
      id: uid(),
      name: teamNames[i]?.trim() || team.identity.name,
      members: team.members.map((m) =>
        m.lane ? `${m.player.name} — ${m.lane}` : m.player.name,
      ),
      registeredAt: stamp,
      approved: true,
      seed: i + 1,
    }));

    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      teams: built,
      bracket: null,
      status: t.status === "draft" ? "registration" : t.status,
    }));
    recordActivity(
      "bracket.generate",
      `สุ่มแบ่ง ${total} คนเป็น ${built.length} ทีม (seed ${seed})`,
      { tournamentId: tournament.id, tournamentName: tournament.name },
    );
    toast(`บันทึก ${built.length} ทีมลงทัวร์แล้ว`, "success");
    setSaving(false);
    onClose();
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(teamsToText(teams, bench, seed));
      toast("คัดลอกผลแล้ว", "success");
    } catch {
      toast("คัดลอกไม่สำเร็จ", "error");
    }
  };

  /* ---------------- คนไม่พอ ---------------- */
  if (total < 2) {
    return (
      <Panel className="p-6">
        <Panel.Header eyebrow="Draw" title="ยังจับสลากไม่ได้" />
        <p className="text-sm leading-relaxed text-muted">
          ต้องมีผู้สมัครที่ผ่านแล้วอย่างน้อย 2 คน — ตอนนี้มี {total} คน
          ไปอนุมัติใบสมัครที่แท็บ &ldquo;ใบสมัคร&rdquo; ก่อน
        </p>
        <Button className="mt-5" variant="ghost" onClick={onClose}>
          ปิด
        </Button>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="slug">Draw</p>
          <h3 className="mt-1 font-display text-xl font-light text-ice">
            {phase === "setup"
              ? "ตั้งค่าการแบ่งทีม"
              : phase === "draw"
                ? "จับสลากทีละคน"
                : "ผลการแบ่งทีม"}
          </h3>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ปิดโรงจับสลาก
        </Button>
      </div>

      {/* ================= 1. ตั้งค่า ================= */}
      {phase === "setup" && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,22rem)] lg:items-start">
          <Panel className="p-6">
            <Panel.Header
              eyebrow="Setup"
              title="แบ่งยังไง"
              count={`${total} คน`}
            />

            <div className="space-y-6">
              {/* คนส่วนใหญ่ตอบคำถามนี้แบบเดียว: "ทีมละกี่คน" — ให้เป็นตัวเลือกแรก
                  ส่วน "อยากได้กี่ทีม" มีไว้สำหรับคนที่ล็อกจำนวนสายไว้แล้ว */}
              <div>
                <Label>กำหนดจาก</Label>
                <div className="flex flex-wrap gap-2">
                  <Choice
                    on={config.sizeMode === "perTeam"}
                    onClick={() => patch({ sizeMode: "perTeam" })}
                  >
                    ทีมละกี่คน
                  </Choice>
                  <Choice
                    on={config.sizeMode === "teamCount"}
                    onClick={() => patch({ sizeMode: "teamCount" })}
                  >
                    อยากได้กี่ทีม
                  </Choice>
                </div>
              </div>

              {config.sizeMode === "perTeam" ? (
                <div>
                  <Label hint="กดเลขที่ใช้บ่อย หรือพิมพ์เอง">ทีมละกี่คน</Label>
                  <div className="mb-2.5 flex flex-wrap gap-2">
                    {[3, 5, 6].map((n) => (
                      <Choice
                        key={n}
                        on={config.perTeam === n}
                        onClick={() => patch({ perTeam: n })}
                      >
                        {n} คน
                      </Choice>
                    ))}
                  </div>
                  <NumberInput
                    value={config.perTeam}
                    min={1}
                    max={10}
                    onChange={(v) => patch({ perTeam: clamp(v, 1, 10) })}
                  />
                </div>
              ) : (
                <div>
                  <Label>อยากได้กี่ทีม</Label>
                  <NumberInput
                    value={config.teamCount}
                    min={2}
                    max={12}
                    onChange={(v) => patch({ teamCount: clamp(v, 2, 12) })}
                  />
                </div>
              )}

              {/* เศษคนโผล่เฉพาะตอนที่หารไม่ลง — ถามตอนไม่มีเศษคือถามฟรี */}
              {config.sizeMode === "perTeam" && total % config.perTeam !== 0 && (
                <div>
                  <Label hint={`หารไม่ลงตัว เหลือ ${total % config.perTeam} คน`}>
                    คนที่เหลือเอาไง
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Choice
                      on={config.remainderMode === "bench"}
                      onClick={() => patch({ remainderMode: "bench" })}
                    >
                      เป็นตัวสำรอง
                    </Choice>
                    <Choice
                      on={config.remainderMode === "balance"}
                      onClick={() => patch({ remainderMode: "balance" })}
                    >
                      แทรกให้ทีมที่มีอยู่
                    </Choice>
                    <Choice
                      on={config.remainderMode === "extraTeam"}
                      onClick={() => patch({ remainderMode: "extraTeam" })}
                    >
                      ตั้งทีมเพิ่ม
                    </Choice>
                  </div>
                </div>
              )}

              <div>
                <Label>ตัวเลือกอื่น</Label>
                <div className="flex flex-wrap gap-2">
                  <Choice
                    on={config.assignLanes}
                    onClick={() => patch({ assignLanes: !config.assignLanes })}
                  >
                    สุ่มเลนให้ด้วย
                  </Choice>
                  <Choice
                    on={config.fillMode === "roundRobin"}
                    onClick={() =>
                      patch({
                        fillMode:
                          config.fillMode === "roundRobin" ? "sequential" : "roundRobin",
                      })
                    }
                  >
                    วนแจกทีละทีม
                  </Choice>
                </div>
              </div>

              <div>
                <Label hint="seed เดิม + คนชุดเดิม = ผลเดิมเสมอ ตรวจย้อนหลังได้">
                  Seed
                </Label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num field flex min-h-11 flex-1 items-center rounded-xl px-3.5 font-display text-sm text-iris">
                    {seed}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSeed(makeSeed());
                      setRevealed(0);
                    }}
                  >
                    สุ่มใหม่
                  </Button>
                </div>
              </div>
            </div>
          </Panel>

          <Panel variant="feature" className="p-6 lg:sticky lg:top-20">
            <Panel.Header eyebrow="Preview" title="จะได้แบบนี้" />
            <div className="space-y-3">
              <PreviewRow label="ผู้เล่นที่ผ่านแล้ว" value={`${total} คน`} />
              <PreviewRow label="จำนวนทีม" value={`${plan.sizes.length} ทีม`} />
              <PreviewRow
                label="ขนาดทีม"
                value={
                  plan.sizes.length
                    ? [...new Set(plan.sizes)].join(" / ") + " คน"
                    : "—"
                }
              />
              <PreviewRow
                label="ตัวสำรอง"
                value={plan.benchCount ? `${plan.benchCount} คน` : "ไม่มี"}
              />
            </div>

            <p className="mt-5 text-xs leading-relaxed text-muted">
              กด &ldquo;เริ่มจับสลาก&rdquo; แล้วจะได้พิธีเหมือนหน้าสุ่มทีม —
              จับทีละคน มีเสียง มีตู้หมุน ย้อนได้ และผลยังไม่ถูกเขียนลงทัวร์
              จนกว่าจะกดยืนยันที่หน้าสุดท้าย
            </p>

            <Button
              className="mt-5 w-full"
              size="lg"
              disabled={plan.sizes.length < 2}
              onClick={() => {
                setRevealed(0);
                setPhase("draw");
              }}
            >
              เริ่มจับสลาก
            </Button>
            {plan.sizes.length < 2 && (
              <p className="mt-2 text-center text-xs text-danger">
                ค่าปัจจุบันได้ทีมเดียว ปรับขนาดทีมลงก่อน
              </p>
            )}
          </Panel>
        </div>
      )}

      {/* ================= 2. จับสลาก ================= */}
      {phase === "draw" && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPhase("setup");
                setRevealed(0);
              }}
            >
              ← แก้การตั้งค่า
            </Button>
            <div className="flex min-w-45 flex-1 items-center gap-3.5">
              <span className="min-w-0 flex-1">
                <PipRail total={total} revealed={revealed} colorOf={railColor} />
              </span>
              <span className="num shrink-0 font-display text-sm text-iris">
                {revealed}
                <span className="text-muted">/{total}</span>
              </span>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(330px,400px)_1fr]">
            <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <DrawMachine
                remaining={remaining}
                next={order[revealed] ?? null}
                target={
                  identity && nextSlot
                    ? {
                        identity,
                        label,
                        seat: nextSlot.seat,
                        isBench: nextSlot.teamIndex === null,
                      }
                    : null
                }
                round={revealed + 1}
                total={total}
                canUndo={revealed > 0}
                onCommit={() => setRevealed((r) => r + 1)}
                onUndo={() => {
                  sfx.play("undo");
                  setRevealed((r) => Math.max(0, r - 1));
                }}
                onRevealAll={() => setRevealed(total)}
              />
            </div>

            <TeamBoard
              teams={teams}
              bench={bench}
              benchCount={plan.benchCount}
              activeTeamIndex={nextSlot?.teamIndex ?? null}
              activeIsBench={nextSlot?.teamIndex === null}
              teamName={(i) => teamNames[i] ?? ""}
              onRenameTeam={(index, name) =>
                setTeamNames((prev) => {
                  const next = { ...prev };
                  const clean = name.trim().slice(0, 18);
                  if (clean) next[index] = clean;
                  else delete next[index];
                  return next;
                })
              }
              layoutAnimations
              compact
              flashIndex={flashIndex}
            />
          </div>

          {/* พิธีปิด 1.5 วิ ก่อนพาไปหน้าสรุป — ชุดเดียวกับหน้า /draw */}
          {ceremony && (
            <Sequence
              cards={teams.length + (plan.benchCount > 0 ? 1 : 0)}
              onFlash={(i) => setFlashIndex(i < 0 ? null : i)}
              onDone={() => setPhase("done")}
            />
          )}
        </motion.div>
      )}

      {/* ================= 3. ยืนยัน ================= */}
      {phase === "done" && (
        <AnimatePresence>
          <motion.div
            key="done"
            initial={reduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-5"
          >
            <Panel variant="feature" className="p-6 sm:p-7">
              <Panel.Header
                eyebrow="Result"
                title={`ได้ ${teams.length} ทีม`}
                count={plan.benchCount ? `สำรอง ${plan.benchCount} คน` : undefined}
              />
              <p className="text-sm leading-relaxed text-muted">
                ยังไม่ได้เขียนลงทัวร์ — เปลี่ยนชื่อทีมในการ์ดข้างล่างได้ก่อน
                แล้วค่อยกดยืนยัน · กด &ldquo;สุ่มใหม่&rdquo; ถ้าอยากได้ชุดอื่น
                <span className="num ml-1.5 text-iris">seed {seed}</span>
              </p>

              <div className="mt-5 flex flex-wrap gap-2.5">
                <Button size="lg" loading={saving} onClick={commit}>
                  ยืนยัน ใช้ทีมชุดนี้
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSeed(makeSeed());
                    setRevealed(0);
                    setTeamNames({});
                    setPhase("draw");
                  }}
                >
                  สุ่มใหม่
                </Button>
                <Button variant="ghost" onClick={copyText}>
                  คัดลอกเป็นข้อความ
                </Button>
              </div>

              {tournament.teams.length > 0 && (
                <p className="mt-4 text-xs text-danger">
                  ทัวร์นี้มี {tournament.teams.length} ทีมอยู่แล้ว —
                  กดยืนยันจะเขียนทับทั้งชุดและล้างสายแข่งที่จัดไว้
                </p>
              )}
            </Panel>

            <TeamBoard
              teams={teams}
              bench={bench}
              benchCount={plan.benchCount}
              activeTeamIndex={null}
              teamName={(i) => teamNames[i] ?? ""}
              onRenameTeam={(index, name) =>
                setTeamNames((prev) => {
                  const next = { ...prev };
                  const clean = name.trim().slice(0, 18);
                  if (clean) next[index] = clean;
                  else delete next[index];
                  return next;
                })
              }
            />
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-11 cursor-pointer rounded-xl px-4 font-display text-xs whitespace-nowrap transition-colors ${
        on ? "accent-fill text-onaccent" : "tile text-muted hover:text-ice"
      }`}
    >
      {children}
    </button>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-hair pb-2.5 last:border-0 last:pb-0">
      <span className="slug slug-2">{label}</span>
      <span className="num font-display text-sm text-ice">{value}</span>
    </div>
  );
}
