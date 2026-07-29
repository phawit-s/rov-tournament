"use client";

import { safeImageSrc } from "@/lib/safe";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useHashParam, useHydrated } from "@/hooks/useClient";
import { adminStore } from "@/lib/tournament/admin";
import { authStore } from "@/lib/backend/firebase";
import { CAN, ROLE_META, roleFor } from "@/lib/tournament/roles";
import { cloudReady, watchTournament } from "@/lib/tournament/cloud";
import { championId, standings } from "@/lib/tournament/bracket";
import { calcPrizes, formatMoney } from "@/lib/tournament/prize";
import { tournamentStore } from "@/lib/tournament/store";
import {
  decodeTournament,
  formatThaiDate,
  tournamentShareUrl,
  tournamentSummaryText,
} from "@/lib/tournament/share";
import type { Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import BracketPanel from "./BracketPanel";
import PrizePanel from "./PrizePanel";
import SchedulePanel from "./SchedulePanel";
import AccessPanel from "./AccessPanel";
import SupportersPanel from "./SupportersPanel";
import TeamsPanel from "./TeamsPanel";
import TournamentForm from "./TournamentForm";
import { EmptyNote, Input, LiveBadge, Stat, StatusBadge } from "./ui";

/** manage = true คือแท็บที่เปิดให้เฉพาะเจ้าของกับทีมงาน */
const TABS = [
  { key: "overview", label: "ภาพรวม", manage: false },
  { key: "teams", label: "ทีม / สมัคร", manage: false },
  { key: "bracket", label: "สายแข่ง", manage: false },
  { key: "schedule", label: "ตารางแข่ง", manage: false },
  { key: "prize", label: "เงินรางวัล", manage: false },
  { key: "support", label: "โดเนท / สมาชิก", manage: true },
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

  const [tab, setTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // อ่าน id จาก hash — รองรับทั้ง #t=<id> และลิงก์แชร์ #s=<data>
  const hydrated = useHydrated();
  const sharedRaw = useHashParam("s");
  const hashId = useHashParam("t");
  const cloudId = useHashParam("c");
  const shared = useMemo(
    () => (sharedRaw ? decodeTournament(sharedRaw) : null),
    [sharedRaw],
  );
  const id = shared?.id ?? cloudId ?? hashId;

  // เปิดจากลิงก์แชร์ = บันทึกลงเครื่องให้เลย จะได้ดูสายและกรอกผลต่อได้
  useEffect(() => {
    if (shared) tournamentStore.upsert(shared);
  }, [shared]);

  // เปิดจากคลาวด์ = ฟังสด ผลอัปเดตเองไม่ต้องรีเฟรช
  useEffect(() => {
    if (!cloudId || !cloudReady()) return;
    return watchTournament(cloudId, (data) => {
      if (data) tournamentStore.upsert(data);
    });
  }, [cloudId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const tournament = all.find((t) => t.id === id) ?? null;

  if (!hydrated) return null;

  if (!tournament) {
    return (
      <EmptyNote>
        ไม่พบทัวร์นาเมนต์นี้ในเครื่อง —{" "}
        <Link href="/tournaments/" className="text-champagne underline-offset-2 hover:underline">
          กลับไปหน้ารายการ
        </Link>
      </EmptyNote>
    );
  }

  // สิทธิ์จริงมาจากบัญชีที่ล็อกอิน ส่วน PIN เป็นแค่ชั้นกันมือลั่นของทัวร์ในเครื่อง
  const role = roleFor(tournament, {
    uid: user?.uid,
    email: user?.email,
    anonymous: user?.anonymous,
  });
  const pinOk = adminStore.isUnlocked(tournament.id, tournament.adminPin);
  const isAdmin = CAN.manage(role) && pinOk;
  const locked = CAN.manage(role) && !!tournament.adminPin && !pinOk;
  const visibleTabs = TABS.filter((t) => !t.manage || CAN.manage(role));

  if (editing) {
    return (
      <TournamentForm
        tournament={tournament}
        onClose={() => setEditing(false)}
        onSaved={() => setToast("บันทึกแล้ว")}
      />
    );
  }

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(message);
    } catch {
      setToast("คัดลอกไม่สำเร็จ");
    }
  };

  const champ = championId(tournament.bracket);
  const champName = champ
    ? (tournament.teams.find((t) => t.id === champ)?.name ?? null)
    : null;

  return (
    <div className="space-y-6">
      {/* หัวเรื่อง */}
      <Panel className="overflow-hidden p-0">
        {tournament.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(tournament.cover) ?? ""}
            alt=""
            className="h-40 w-full object-cover opacity-90 sm:h-52"
          />
        )}
        <div className="p-6 sm:p-7">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/tournaments/"
              className="text-xs text-muted transition-colors hover:text-ice"
            >
              ← ทัวร์นาเมนต์ทั้งหมด
            </Link>
            <span className="text-muted/40">·</span>
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
          </div>

          <h2 className="mt-3 font-display text-2xl font-medium text-ice sm:text-4xl">
            {tournament.name}
          </h2>
          {tournament.tagline && (
            <p className="mt-2 text-sm text-muted">{tournament.tagline}</p>
          )}

          <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="ทีม" value={`${tournament.teams.length}`} />
            <Stat
              label="เงินรางวัล"
              accent
              value={
                tournament.prize.total > 0
                  ? formatMoney(tournament.prize.total, tournament.prize.currency)
                  : "—"
              }
            />
            <Stat label="วันแข่ง" value={formatThaiDate(tournament.startAt)} />
            <Stat label="แชมป์" accent value={champName ?? "—"} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button
              onClick={() =>
                copy(tournamentShareUrl(tournament), "คัดลอกลิงก์แชร์แล้ว")
              }
            >
              คัดลอกลิงก์แชร์
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                copy(tournamentSummaryText(tournament), "คัดลอกข้อความแล้ว")
              }
            >
              คัดลอกข้อความ
            </Button>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <Button
                variant="ghost"
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
            {isAdmin && (
              <Button variant="ghost" onClick={() => setEditing(true)}>
                แก้ไขข้อมูล
              </Button>
            )}
          </div>

          {locked && (
            <div className="mt-5 flex flex-wrap items-end gap-2.5 rounded-xl tile p-4">
              <div>
                <p className="text-sm text-ice/85">โหมดผู้จัด</p>
                <p className="mt-0.5 text-xs text-muted">
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
                variant="outline"
                onClick={() => {
                  const ok = adminStore.tryUnlock(
                    tournament.id,
                    tournament.adminPin ?? "",
                    pinInput,
                  );
                  if (ok) {
                    setPinInput("");
                    setToast("เข้าโหมดผู้จัดแล้ว");
                  } else {
                    setPinError(true);
                  }
                }}
              >
                ปลดล็อก
              </Button>
              {pinError && <p className="text-xs text-[#e79a9a]">PIN ไม่ถูก</p>}
            </div>
          )}

          {isAdmin && tournament.adminPin && (
            <button
              type="button"
              onClick={() => adminStore.lock(tournament.id)}
              className="mt-4 cursor-pointer text-xs text-muted transition-colors hover:text-ice"
            >
              ออกจากโหมดผู้จัด
            </button>
          )}
        </div>
      </Panel>

      {/* แท็บ */}
      <div className="flex flex-wrap gap-1 rounded-xl tile p-1">
        {visibleTabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`relative flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors duration-300 sm:text-sm ${
              tab === item.key ? "text-[#1b1509]" : "text-muted hover:text-ice"
            }`}
          >
            {tab === item.key && (
              <motion.span
                layoutId="tournament-tab"
                className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)]"
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
              />
            )}
            <span className="relative z-10">{item.label}</span>
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Overview tournament={tournament} champName={champName} />
      )}
      {tab === "teams" && <TeamsPanel tournament={tournament} isAdmin={isAdmin} />}
      {tab === "bracket" && (
        <BracketPanel tournament={tournament} isAdmin={isAdmin} />
      )}
      {tab === "schedule" && (
        <SchedulePanel tournament={tournament} isAdmin={isAdmin} />
      )}
      {tab === "prize" && <PrizePanel tournament={tournament} isAdmin={isAdmin} />}
      {tab === "support" && CAN.manage(role) && (
        <SupportersPanel tournament={tournament} isAdmin={isAdmin} />
      )}
      {tab === "access" && CAN.manage(role) && (
        <AccessPanel tournament={tournament} role={role} />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="fixed inset-x-0 bottom-[calc(1.75rem+var(--sab))] z-50 mx-auto w-fit rounded-xl border border-champagne/25 bg-ink-2/95 px-6 py-3 text-sm text-ice backdrop-blur"
          >
            {toast}
          </motion.div>
        )}
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
        <h3 className="font-display text-lg font-medium text-ice">รายละเอียด</h3>
        {tournament.description ? (
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-ice/85">
            {tournament.description}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted">ยังไม่ได้ใส่รายละเอียด</p>
        )}

        <dl className="mt-6 grid gap-4 border-t border-hair pt-5 sm:grid-cols-2">
          <Row label="รับสมัคร">
            {formatThaiDate(tournament.registerOpenAt)} –{" "}
            {formatThaiDate(tournament.registerCloseAt)}
          </Row>
          <Row label="วันแข่ง">{formatThaiDate(tournament.startAt)}</Row>
          <Row label="รูปแบบ">
            ทีมละ {tournament.teamSize} คน · รับ{" "}
            {tournament.maxTeams || "ไม่จำกัด"} ทีม
          </Row>
          <Row label="สถานที่">{tournament.venue || "—"}</Row>
        </dl>
      </Panel>

      <div className="space-y-5">
        {tournament.prize.total > 0 && (
          <Panel className="p-6">
            <h3 className="font-display text-lg font-medium text-ice">เงินรางวัล</h3>
            <ul className="mt-4 space-y-2">
              {prize.breakdown.map((row) => (
                <li
                  key={row.slot.place}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-muted">{row.slot.label}</span>
                  <span className="font-display text-ice">
                    {formatMoney(row.amount, tournament.prize.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {champName && (
          <Panel accent="207 167 101" className="p-6 text-center">
            <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
              Champion
            </p>
            <p className="mt-2.5 font-display text-2xl">
              <span className="text-gold-grad">{champName}</span>
            </p>
          </Panel>
        )}

        {table.length > 0 && (
          <Panel className="p-6">
            <h3 className="font-display text-lg font-medium text-ice">อันดับ</h3>
            <ol className="mt-4 space-y-2 text-sm">
              {table.slice(0, 8).map((row) => (
                <li key={row.team.id} className="flex items-center gap-3">
                  <span className="w-5 font-display text-muted tabular-nums">
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
      <dt className="font-display text-[10px] tracking-luxe text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ice/85">{children}</dd>
    </div>
  );
}
