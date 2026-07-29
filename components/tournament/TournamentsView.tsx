"use client";

import { safeImageSrc } from "@/lib/safe";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { emptyTournament, tournamentStore } from "@/lib/tournament/store";
import { decodeTournament, formatThaiDate } from "@/lib/tournament/share";
import { calcPrizes, formatMoney } from "@/lib/tournament/prize";
import type { Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import TournamentForm from "./TournamentForm";
import { EmptyNote, LiveBadge, StatusBadge } from "./ui";

export default function TournamentsView() {
  const all = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );
  const [editing, setEditing] = useState<Tournament | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // เปิดมาจากลิงก์แชร์ -> ถามก่อนว่าจะบันทึกลงเครื่องไหม
  const sharedRaw = useHashParam("s");
  const shared = useMemo(
    () => (sharedRaw ? decodeTournament(sharedRaw) : null),
    [sharedRaw],
  );
  const incoming = dismissed ? null : shared;

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  const list = all
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (editing) {
    return (
      <TournamentForm
        tournament={editing}
        onClose={() => setEditing(null)}
        onSaved={() => setToast("บันทึกแล้ว")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
            Tournaments
          </p>
          <h2 className="mt-1.5 font-display text-2xl font-medium text-ice sm:text-3xl">
            ทัวร์นาเมนต์ทั้งหมด
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            สร้างทัวร์ รับสมัครทีม จัดสายแข่ง กรอกผล และแชร์ให้คนอื่นดู
          </p>
        </div>
        <Button onClick={() => setEditing(emptyTournament(""))}>
          + สร้างทัวร์นาเมนต์
        </Button>
      </div>

      {incoming && (
        <Panel accent="109 146 219" className="p-5">
          <p className="text-sm text-ice/90">
            มีทัวร์นาเมนต์ที่ถูกแชร์มา:{" "}
            <span className="font-display text-champagne">{incoming.name}</span> (
            {incoming.teams.length} ทีม)
          </p>
          <p className="mt-1.5 text-xs text-muted">
            บันทึกลงเครื่องนี้เพื่อดูสายและประวัติ หรือปิดไปเฉยๆ ก็ได้
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button
              onClick={() => {
                tournamentStore.upsert(incoming);
                setDismissed(true);
                setToast("บันทึกทัวร์ที่แชร์มาแล้ว");
              }}
            >
              บันทึกลงเครื่อง
            </Button>
            <Button variant="ghost" onClick={() => setDismissed(true)}>
              ไม่ต้อง
            </Button>
          </div>
        </Panel>
      )}

      {list.length === 0 ? (
        <EmptyNote>
          ยังไม่มีทัวร์นาเมนต์ — กด &ldquo;สร้างทัวร์นาเมนต์&rdquo; เพื่อเริ่ม
        </EmptyNote>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 260, damping: 28 }}
              >
                <Card
                  tournament={t}
                  onEdit={() => setEditing(t)}
                  onDuplicate={() => {
                    tournamentStore.duplicate(t.id);
                    setToast("ทำสำเนาแล้ว");
                  }}
                  onDelete={() => {
                    if (!confirm(`ลบ "${t.name}" ทิ้ง?`)) return;
                    tournamentStore.remove(t.id);
                    setToast("ลบแล้ว");
                  }}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
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

function Card({
  tournament,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  tournament: Tournament;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const prize = calcPrizes(tournament.prize);
  const top = prize.breakdown[0];

  return (
    <Panel className="flex h-full flex-col overflow-hidden p-0">
      <Link href={`/tournament/#t=${tournament.id}`} className="block">
        {tournament.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(tournament.cover) ?? ""}
            alt=""
            className="h-32 w-full object-cover opacity-90"
          />
        ) : (
          <div className="h-20 w-full bg-[linear-gradient(120deg,rgba(207,167,101,0.16),transparent_70%)]" />
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={tournament.status} />
          {tournament.live.isLive && tournament.live.url && (
            <LiveBadge url={tournament.live.url} />
          )}
        </div>

        <Link href={`/tournament/#t=${tournament.id}`}>
          <h3 className="font-display text-lg font-medium text-ice transition-colors hover:text-champagne">
            {tournament.name}
          </h3>
        </Link>
        {tournament.tagline && (
          <p className="mt-1 line-clamp-2 text-sm text-muted">{tournament.tagline}</p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">ทีม</dt>
            <dd className="font-display text-ice">
              {tournament.teams.length}
              {tournament.maxTeams > 0 && (
                <span className="text-muted">/{tournament.maxTeams}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">เงินรางวัล</dt>
            <dd className="font-display text-champagne">
              {tournament.prize.total > 0
                ? formatMoney(tournament.prize.total, tournament.prize.currency)
                : "—"}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted">วันแข่ง</dt>
            <dd className="text-ice/85">{formatThaiDate(tournament.startAt)}</dd>
          </div>
          {top && tournament.prize.total > 0 && (
            <div className="col-span-2">
              <dt className="text-xs text-muted">รางวัลชนะเลิศ</dt>
              <dd className="font-display text-champagne">
                {formatMoney(top.amount, tournament.prize.currency)}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-auto flex flex-wrap items-center gap-1 pt-5">
          <Link
            href={`/tournament/#t=${tournament.id}`}
            className="rounded-lg bg-[linear-gradient(180deg,#f2dcb0_0%,#d9b273_52%,#bd9350_100%)] px-4 py-2 font-display text-xs text-[#1b1509] transition-all hover:brightness-105"
          >
            เปิดดู
          </Link>
          <TextAction onClick={onEdit}>แก้ไข</TextAction>
          <TextAction onClick={onDuplicate}>ทำสำเนา</TextAction>
          <TextAction onClick={onDelete} danger>
            ลบ
          </TextAction>
        </div>
      </div>
    </Panel>
  );
}

function TextAction({
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
      onClick={onClick}
      className={`cursor-pointer rounded-lg px-2.5 py-2 text-xs transition-colors ${
        danger ? "text-muted hover:text-[#e79a9a]" : "text-muted hover:text-ice"
      }`}
    >
      {children}
    </button>
  );
}
