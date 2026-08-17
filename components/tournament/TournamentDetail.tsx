"use client";

import { safeImageSrc } from "@/lib/safe";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam, useHydrated, useNow } from "@/hooks/useClient";
import { useAccess } from "@/hooks/useAdmin";
import { adminStore } from "@/lib/tournament/admin";
import { authStore } from "@/lib/backend/firebase";
import { CAN, ROLE_META, roleFor } from "@/lib/tournament/roles";
import { cloudReady, watchTournament } from "@/lib/tournament/cloud";
import { championId, standings } from "@/lib/tournament/bracket";
import { calcPrizes, formatMoney } from "@/lib/tournament/prize";
import { tournamentStore } from "@/lib/tournament/store";
import { findMyEntry, registerGate, slotsLeft } from "@/lib/tournament/registration";
import {
  decodeTournament,
  formatThaiDate,
  tournamentShareUrl,
  tournamentSummaryText,
} from "@/lib/tournament/share";
import type { Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import Corners from "../ui/Corners";
import RingCluster from "../fx/RingCluster";
import RotatingBadge from "../fx/RotatingBadge";
import { CapacityRing } from "../ui/hud";
import { toast } from "../ui/Toast";
import { IconCopy, IconExternal } from "../ui/icons";
import BracketPanel from "./BracketPanel";
import PrizePanel from "./PrizePanel";
import SchedulePanel, { Countdown } from "./SchedulePanel";
import AccessPanel from "./AccessPanel";
import CloudPanel from "./CloudPanel";
import RegisterPanel from "./RegisterPanel";
import TeamsPanel from "./TeamsPanel";
import TournamentForm from "./TournamentForm";
import { EmptyNote, Input, LiveBadge, Stat, StatRow, StatusBadge } from "./ui";

/** manage = true คือแท็บที่เปิดให้เฉพาะเจ้าของกับทีมงาน */
const TABS = [
  { key: "overview", label: "ภาพรวม", manage: false },
  { key: "register", label: "สมัคร", manage: false },
  { key: "teams", label: "ทีม", manage: false },
  { key: "bracket", label: "สายแข่ง", manage: false },
  { key: "schedule", label: "ตารางแข่ง", manage: false },
  { key: "prize", label: "เงินรางวัล", manage: false },
  { key: "support", label: "คลาวด์ / สมทบทุน", manage: true },
  { key: "access", label: "สิทธิ์", manage: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function TournamentDetail() {
  const all = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );
  useSyncExternalStore(
    adminStore.subscribe,
    adminStore.getSnapshot,
    adminStore.getServerSnapshot,
  );
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const access = useAccess();
  const reduced = useReducedMotion();

  const [tab, setTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);

  // อ่าน id จาก hash — รองรับทั้ง #t=<id> และลิงก์แชร์ #s=<data>
  const hydrated = useHydrated();
  // ต้องเรียกก่อน early return ด้านล่าง ลำดับ hook ห้ามเปลี่ยนระหว่าง render
  const now = useNow();
  const sharedRaw = useHashParam("s");
  const hashId = useHashParam("t");
  const cloudId = useHashParam("c");
  const shared = useMemo(
    () => (sharedRaw ? decodeTournament(sharedRaw) : null),
    [sharedRaw],
  );
  const id = shared?.id ?? cloudId ?? hashId;

  // เปิดจากลิงก์แชร์ = เอาข้อมูลในลิงก์มาแสดงเลย คนดูไม่ต้องล็อกอิน
  useEffect(() => {
    if (shared) tournamentStore.adopt(shared);
  }, [shared]);

  // เปิดจากคลาวด์ = ฟังสด ผลอัปเดตเองไม่ต้องรีเฟรช
  useEffect(() => {
    if (!cloudId || !cloudReady()) return;
    return watchTournament(cloudId, (data) => {
      if (data) tournamentStore.adopt(data);
    });
  }, [cloudId]);

  const tournament = all.find((t) => t.id === id) ?? null;

  if (!hydrated) return null;

  if (!tournament) {
    return (
      <EmptyNote>
        ไม่พบทัวร์นาเมนต์นี้ในเครื่อง —{" "}
        <Link href="/studio/tournaments/" className="text-iris underline-offset-2 hover:underline">
          กลับไปหน้ารายการ
        </Link>
      </EmptyNote>
    );
  }

  // สิทธิ์จริงมาจากบัญชีที่ล็อกอิน ส่วน PIN เป็นแค่ชั้นกันมือลั่นของทัวร์ในเครื่อง
  const role = roleFor(
    tournament,
    {
      uid: user?.uid,
      email: user?.email,
      anonymous: user?.anonymous,
    },
    // เฉพาะสิทธิ์ที่ Firestore ยืนยัน รหัสในเครื่องไม่นับ เพราะคลาวด์ก็ไม่ให้เขียนอยู่ดี
    access === "verified",
  );
  const pinOk = adminStore.isUnlocked(tournament.id, tournament.adminPin);
  const isAdmin = CAN.manage(role) && pinOk;
  const locked = CAN.manage(role) && !!tournament.adminPin && !pinOk;
  const visibleTabs = TABS.filter((t) => !t.manage || CAN.manage(role));

  if (editing) {
    return (
      <TournamentForm
        tournament={tournament}
        onClose={() => setEditing(false)}
        onSaved={() => toast("บันทึกแล้ว", "success")}
      />
    );
  }

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(message, "success");
    } catch {
      toast("คัดลอกไม่สำเร็จ", "error");
    }
  };

  const champ = championId(tournament.bracket);
  const champName = champ
    ? (tournament.teams.find((t) => t.id === champ)?.name ?? null)
    : null;

  const pending = tournament.teams.filter((t) => !t.approved).length;
  const noBracket = tournament.bracket === null;

  /* สถานะการสมัครของคนที่กำลังดูอยู่ — ใช้ตัดสินว่าปุ่มใหญ่ควรพูดว่าอะไร */
  const gate = registerGate(tournament, now, cloudReady() && !!tournament.ownerUid);
  const myEntry = findMyEntry(tournament, user?.uid);
  const left = slotsLeft(tournament);
  const cover = tournament.cover ? safeImageSrc(tournament.cover) : null;
  const finished = tournament.status === "finished";

  /** ตัวเลขมุมขวาของแท็บ — ให้รู้ว่ามีอะไรรออยู่โดยไม่ต้องกดเข้าไปดู */
  const badgeOf = (key: TabKey): number | null => {
    if (key === "teams") return tournament.teams.length || null;
    if (key === "bracket" || key === "schedule") {
      const list = tournament.bracket?.matches.filter((m) => !m.bye) ?? [];
      return list.length || null;
    }
    return null;
  };
  const disabledOf = (key: TabKey) =>
    noBracket && (key === "bracket" || key === "schedule");

  return (
    <div className="space-y-6">
      {/* ---------- โปสเตอร์ทัวร์ ---------- */}
      <Panel variant="feature" interactive={false} className="overflow-hidden p-0">
        <div className="relative flex min-h-[clamp(260px,38vw,380px)] flex-col justify-end">
          {/* ชั้น 1 — ปกหรือฉากหลังพร้อมของหมุนจางๆ */}
          <div className="scene-base absolute inset-0 z-0 overflow-hidden">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                className="h-full w-full object-cover opacity-75"
              />
            )}
            <span className="grain pointer-events-none absolute inset-0 opacity-60" />
            {cover && <span className="scene-veil absolute inset-0" />}
            <RingCluster
              size={280}
              className="absolute -top-16 -right-16 opacity-40"
            />
          </div>

          {/* ชั้น 2 — ม่านไล่จากล่างขึ้น ให้ตัวหนังสืออ่านออกทับปกทุกแบบ
              (เขียนเป็น inline style เพราะ --color-ink เป็นค่าสีจริง ไม่ใช่ทริปเปิล R G B) */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background:
                "linear-gradient(0deg, var(--color-ink) 2%, color-mix(in srgb, var(--color-ink) 74%, transparent) 42%, transparent 88%)",
            }}
          />
          <Corners len={20} o={0.35} />

          {/* ชั้น 3 — เนื้อหาโปสเตอร์ */}
          <div className="relative z-10 p-6 sm:p-8">
            <Link
              href="/studio/tournaments/"
              className="slug slug-2 inline-block transition-colors hover:text-iris"
            >
              ← ทัวร์นาเมนต์ทั้งหมด
            </Link>

            <p className="slug mt-4">Tournament</p>
            <h2 className="mt-1.5 font-display text-display font-light text-ice">
              {finished ? (
                <span className="text-accent-grad">{tournament.name}</span>
              ) : (
                tournament.name
              )}
            </h2>

            {tournament.tagline && (
              <p className="mt-3 max-w-[52ch] text-deck text-muted">
                {tournament.tagline}
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-xs text-muted">
              <StatusBadge status={tournament.status} />
              {tournament.live.isLive && tournament.live.url && (
                <LiveBadge url={tournament.live.url} />
              )}
              {CAN.manage(role) && (
                <span
                  className="rounded-full px-2.5 py-1 font-display text-[11px]"
                  style={{
                    color: `rgb(${ROLE_META[role].rgb})`,
                    background: `rgb(${ROLE_META[role].rgb} / 0.12)`,
                    boxShadow: `inset 0 0 0 1px rgb(${ROLE_META[role].rgb} / 0.3)`,
                  }}
                  title={ROLE_META[role].hint}
                >
                  {ROLE_META[role].label}
                </span>
              )}
              <span className="num">{formatThaiDate(tournament.startAt)}</span>
              <span className="text-muted/40">·</span>
              <span className="num">
                {tournament.teams.length} ทีม · ทีมละ {tournament.teamSize} คน
              </span>
              {tournament.venue && (
                <>
                  <span className="text-muted/40">·</span>
                  <span>{tournament.venue}</span>
                </>
              )}
            </div>

            {/* ปุ่มสมัครอยู่บนโปสเตอร์เลย — คนมาจากลิงก์แชร์จะได้ไม่ต้องไล่หาแท็บ */}
            {(gate.open || myEntry) && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={() => setTab("register")}>
                  {myEntry ? "ดูใบสมัครของคุณ" : "สมัครเข้าแข่ง"}
                </Button>
                {!myEntry && left !== null && (
                  <span className="num text-xs text-muted">
                    เหลืออีก {left} {tournament.entryMode === "solo" ? "ที่" : "ทีม"}
                  </span>
                )}
                {myEntry && (
                  <span className="text-xs text-muted">
                    {myEntry.entry.approved ? "ผ่านแล้ว" : "รอผู้จัดตรวจ"}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="absolute right-5 bottom-5 z-10 hidden md:block">
            <RotatingBadge text={`${tournament.name.toUpperCase()} · `} size={120} />
          </div>
        </div>
      </Panel>

      {/* ---------- แถบเครื่องมือใต้โปสเตอร์ ---------- */}
      <div className="tile flex flex-wrap items-center gap-2.5 rounded-xl p-3">
        <Button
          size="sm"
          icon={<IconCopy className="h-3.5 w-3.5" />}
          onClick={() => copy(tournamentShareUrl(tournament), "คัดลอกลิงก์แชร์แล้ว")}
        >
          คัดลอกลิงก์แชร์
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => copy(tournamentSummaryText(tournament), "คัดลอกข้อความแล้ว")}
        >
          คัดลอกข้อความ
        </Button>
        {typeof navigator !== "undefined" && "share" in navigator && (
          <Button
            size="sm"
            variant="ghost"
            icon={<IconExternal className="h-3.5 w-3.5" />}
            onClick={() =>
              navigator
                .share({
                  title: tournament.name,
                  text: tournamentSummaryText(tournament),
                  url: tournamentShareUrl(tournament),
                })
                .catch(() => undefined)
            }
          >
            แชร์…
          </Button>
        )}
        <span className="flex-1" />
        {isAdmin && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            แก้ไขข้อมูล
          </Button>
        )}
        {isAdmin && tournament.adminPin && (
          <button
            type="button"
            onClick={() => adminStore.lock(tournament.id)}
            className="cursor-pointer px-2 text-xs text-muted transition-colors hover:text-ice"
          >
            ออกจากโหมดผู้จัด
          </button>
        )}
      </div>

      {locked && (
        <Panel interactive={false} state="next" className="p-5">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="min-w-0 flex-1">
              <p className="slug">โหมดผู้จัด</p>
              <p className="mt-1 text-sm text-muted">
                ใส่ PIN เพื่อกรอกผลและแก้ข้อมูล
              </p>
            </div>
            <Input
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              placeholder="PIN"
              className="w-28"
              type="password"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const ok = adminStore.tryUnlock(
                  tournament.id,
                  tournament.adminPin ?? "",
                  pinInput,
                );
                if (ok) {
                  setPinInput("");
                  toast("เข้าโหมดผู้จัดแล้ว", "success");
                } else {
                  setPinError(true);
                }
              }}
            >
              ปลดล็อก
            </Button>
          </div>
          {pinError && <p className="mt-2 text-xs text-danger">PIN ไม่ถูก</p>}
        </Panel>
      )}

      {/* ---------- สถิติหัวเรื่อง ---------- */}
      <Panel interactive={false} className="p-5 sm:p-6">
        <StatRow className="grid-cols-2 sm:grid-cols-4">
          <div className="min-w-0">
            <p className="font-display text-eyebrow tracking-luxe text-muted uppercase">
              ทีม
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              {tournament.maxTeams > 0 ? (
                <CapacityRing
                  value={tournament.teams.length}
                  max={tournament.maxTeams}
                  size={40}
                />
              ) : (
                <span className="num font-display text-lg text-ice">
                  {tournament.teams.length}
                </span>
              )}
              <span className="num text-xs text-muted">
                {tournament.maxTeams > 0 ? `รับ ${tournament.maxTeams}` : "ไม่จำกัด"}
                {pending > 0 && ` · รอตรวจ ${pending}`}
              </span>
            </div>
          </div>

          <Stat
            label="เงินรางวัล"
            accent
            value={
              tournament.prize.total > 0
                ? formatMoney(tournament.prize.total, tournament.prize.currency)
                : "—"
            }
          />

          <div className="min-w-0">
            <p className="font-display text-eyebrow tracking-luxe text-muted uppercase">
              วันแข่ง
            </p>
            <Countdown
              iso={tournament.startAt}
              className="mt-1 block font-display text-lg text-ice"
            />
            {tournament.startAt && (
              <p className="num mt-0.5 truncate text-[11px] text-muted">
                {formatThaiDate(tournament.startAt)}
              </p>
            )}
          </div>

          <Stat label="แชมป์" accent value={champName ?? "—"} />
        </StatRow>
      </Panel>

      {/* ---------- แท็บ ---------- */}
      <div className="tile no-scrollbar flex gap-1 overflow-x-auto rounded-xl p-1 mask-[linear-gradient(90deg,transparent,#000_18px,#000_calc(100%-18px),transparent)]">
        {visibleTabs.map((item) => {
          const off = disabledOf(item.key);
          const count = badgeOf(item.key);
          return (
            <button
              key={item.key}
              type="button"
              disabled={off}
              onClick={() => setTab(item.key)}
              className={`relative shrink-0 grow cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs whitespace-nowrap transition-colors duration-300 sm:text-sm ${
                off
                  ? "cursor-not-allowed text-muted opacity-40"
                  : tab === item.key
                    ? "text-onaccent"
                    : "text-muted hover:text-ice"
              }`}
            >
              {tab === item.key && !off && (
                <motion.span
                  layoutId="tournament-tab"
                  className="absolute inset-0 rounded-lg accent-fill"
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5">
                {item.label}
                {count != null && (
                  <span
                    className={`num text-eyebrow ${
                      tab === item.key && !off ? "text-onaccent/60" : "text-muted/70"
                    }`}
                  >
                    {count}
                  </span>
                )}
                {item.key === "teams" && pending > 0 && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: "rgb(var(--st-next))" }}
                  />
                )}
                {/* จุดบนแท็บสมัคร — เขียวคือผ่านแล้ว เหลืองคือรอตรวจ แดงคือยังไม่ได้สมัครแต่เปิดอยู่ */}
                {item.key === "register" && (myEntry || gate.open) && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: myEntry
                        ? myEntry.entry.approved
                          ? "rgb(var(--st-win))"
                          : "rgb(var(--st-next))"
                        : "rgb(var(--st-live))",
                    }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0, y: -12 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          {tab === "overview" && (
            <Overview tournament={tournament} champName={champName} />
          )}
          {tab === "register" && <RegisterPanel tournament={tournament} />}
          {tab === "teams" && (
            /* สุ่มสายเสร็จคือโมเมนต์ใหญ่สุดของทัวร์ — พาไปดูสายให้เลย ไม่ต้องกดเอง */
            <TeamsPanel
              tournament={tournament}
              isAdmin={isAdmin}
              onGenerated={() => setTab("bracket")}
              onGoRegister={() => setTab("register")}
            />
          )}
          {tab === "bracket" && (
            <BracketPanel
              tournament={tournament}
              isAdmin={isAdmin}
              onGoTeams={() => setTab("teams")}
            />
          )}
          {tab === "schedule" && (
            <SchedulePanel tournament={tournament} isAdmin={isAdmin} />
          )}
          {tab === "prize" && (
            <PrizePanel tournament={tournament} isAdmin={isAdmin} />
          )}
          {tab === "support" && CAN.manage(role) && (
            <CloudPanel tournament={tournament} isAdmin={isAdmin} />
          )}
          {tab === "access" && CAN.manage(role) && (
            <AccessPanel tournament={tournament} role={role} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Overview({
  tournament,
  champName,
}: {
  tournament: Tournament;
  champName: string | null;
}) {
  const prize = calcPrizes(tournament.prize);
  const table = standings(tournament).filter((row) => row.placement > 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <Panel className="p-6">
        <Panel.Header eyebrow="รายละเอียด" title="เกี่ยวกับทัวร์นี้" />
        {tournament.description ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap text-ice/85">
            {tournament.description}
          </p>
        ) : (
          <p className="text-sm text-muted">ยังไม่ได้ใส่รายละเอียด</p>
        )}

        <dl className="mt-6 grid gap-4 border-t border-hair pt-5 sm:grid-cols-2">
          <Row label="รับสมัคร">
            <span className="num">
              {formatThaiDate(tournament.registerOpenAt)} –{" "}
              {formatThaiDate(tournament.registerCloseAt)}
            </span>
          </Row>
          <Row label="วันแข่ง">
            <span className="num">{formatThaiDate(tournament.startAt)}</span>
          </Row>
          <Row label="รูปแบบ">
            <span className="num">
              ทีมละ {tournament.teamSize} คน · รับ{" "}
              {tournament.maxTeams || "ไม่จำกัด"} ทีม
            </span>
          </Row>
          <Row label="สถานที่">{tournament.venue || "—"}</Row>
        </dl>
      </Panel>

      <div className="space-y-5">
        {tournament.prize.total > 0 && (
          <Panel className="p-6">
            <Panel.Header
              eyebrow="Prize pool"
              title="เงินรางวัล"
              count={formatMoney(tournament.prize.total, tournament.prize.currency)}
            />
            <ul className="space-y-2">
              {prize.breakdown.map((row) => (
                <li
                  key={row.slot.place}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-muted">{row.slot.label}</span>
                  <span className="num font-display text-ice">
                    {formatMoney(row.amount, tournament.prize.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {champName && (
          <Panel
            accent="169 155 255"
            interactive={false}
            className="relative overflow-hidden p-6 text-center"
          >
            <Corners len={14} o={0.45} />
            <p className="slug">Champion</p>
            <p className="fig mt-3 text-3xl">
              <span className="text-accent-grad">{champName}</span>
            </p>
          </Panel>
        )}

        {table.length > 0 && (
          <Panel className="p-6">
            <Panel.Header eyebrow="Standings" title="อันดับ" count={table.length} />
            <ol className="space-y-2 text-sm">
              {table.slice(0, 8).map((row) => (
                <li key={row.team.id} className="flex items-center gap-3">
                  <span className="num w-5 font-display text-muted">
                    {row.placement}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ice">
                    {row.team.name}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="slug slug-2">{label}</dt>
      <dd className="mt-1 text-sm text-ice/85">{children}</dd>
    </div>
  );
}
