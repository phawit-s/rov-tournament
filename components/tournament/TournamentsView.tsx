"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { emptyTournament, tournamentStore } from "@/lib/tournament/store";
import { decodeTournament } from "@/lib/tournament/share";
import type { Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Panel from "../ui/Panel";
import Reveal, { PageHeading } from "../ui/Reveal";
import { IconMore } from "../ui/icons";
import { toast } from "../ui/Toast";
import TournamentCard from "./TournamentCard";
import TournamentForm from "./TournamentForm";
import { ArtShield, EmptyState } from "./ui";

export default function TournamentsView() {
  const all = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );
  const [editing, setEditing] = useState<Tournament | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Tournament | null>(null);

  // เปิดมาจากลิงก์แชร์ -> ถามก่อนว่าจะบันทึกลงเครื่องไหม
  const sharedRaw = useHashParam("s");
  const shared = useMemo(
    () => (sharedRaw ? decodeTournament(sharedRaw) : null),
    [sharedRaw],
  );
  const incoming = dismissed ? null : shared;

  const list = all
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const running = list.filter((t) => t.status === "running").length;

  if (editing) {
    return (
      <TournamentForm
        tournament={editing}
        onClose={() => setEditing(null)}
        onSaved={() => toast("บันทึกแล้ว", "success")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Tournaments"
        title="ทัวร์นาเมนต์ทั้งหมด"
        description="สร้างทัวร์ รับสมัครทีม จัดสายแข่ง กรอกผล และแชร์ให้คนอื่นดู"
        meta={
          list.length > 0
            ? `${list.length} รายการ${running ? ` · กำลังแข่ง ${running}` : ""}`
            : undefined
        }
        action={
          <Button onClick={() => setEditing(emptyTournament(""))}>
            + สร้างทัวร์นาเมนต์
          </Button>
        }
      />

      {incoming && (
        <Panel accent="109 146 219" state="next" className="p-5">
          <p className="slug">มีทัวร์ที่ถูกแชร์มา</p>
          <p className="mt-2 text-sm text-ice/90">
            <span className="font-display text-champagne">{incoming.name}</span>{" "}
            <span className="num text-muted">({incoming.teams.length} ทีม)</span>
          </p>
          <p className="mt-1.5 text-xs text-muted">
            บันทึกลงเครื่องนี้เพื่อดูสายและประวัติ หรือปิดไปเฉยๆ ก็ได้
          </p>
          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button
              size="sm"
              onClick={() => {
                tournamentStore.upsert(incoming);
                setDismissed(true);
                toast("บันทึกทัวร์ที่แชร์มาแล้ว", "success");
              }}
            >
              บันทึกลงเครื่อง
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              ไม่ต้อง
            </Button>
          </div>
        </Panel>
      )}

      {list.length === 0 ? (
        <EmptyState
          no="03"
          art={<ArtShield />}
          title="ยังไม่มีทัวร์นาเมนต์"
          description="สร้างทัวร์แรกเพื่อเปิดรับสมัครทีม จัดสายแข่ง และแชร์ลิงก์ให้คนอื่นตามผล — ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์เครื่องนี้"
          action={
            <Button onClick={() => setEditing(emptyTournament(""))}>
              + สร้างทัวร์นาเมนต์
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {list.map((t, i) => (
              <Reveal key={t.id} index={i} from="scale">
                <TournamentCard
                  tournament={t}
                  href={`/tournament/#t=${t.id}`}
                  actions={
                    <CardActions
                      href={`/tournament/#t=${t.id}`}
                      onEdit={() => setEditing(t)}
                      onDuplicate={() => {
                        tournamentStore.duplicate(t.id);
                        toast("ทำสำเนาแล้ว", "success");
                      }}
                      onDelete={() => setPendingDelete(t)}
                    />
                  }
                />
              </Reveal>
            ))}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title={`ลบ "${pendingDelete?.name ?? ""}" ทิ้ง?`}
        description="ทีม สายแข่ง และผลที่กรอกไว้ทั้งหมดจะหายจากเครื่องนี้ กู้คืนไม่ได้"
        confirmText="ลบทิ้ง"
        onConfirm={() => {
          if (!pendingDelete) return;
          tournamentStore.remove(pendingDelete.id);
          toast("ลบแล้ว", "success");
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

/**
 * แถวปุ่มท้ายการ์ด — "เปิดดู" เป็นตัวเอกเดียว
 * ที่เหลือยุบไว้หลัง ⋯ แล้วกางลงในตัวการ์ด (ไม่ใช่ dropdown ลอย
 * เพราะการ์ดอยู่ใน TiltCard ที่มี transform ป๊อปอัปตำแหน่ง fixed จะเพี้ยน)
 */
function CardActions({
  href,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  href: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  return (
    <div>
      <div className="flex items-center gap-2">
        <Link
          href={href}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-[linear-gradient(180deg,#f2dcb0_0%,#d9b273_52%,#bd9350_100%)] px-4 py-2 font-display text-xs font-medium tracking-wide text-[#1b1509] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_34px_-18px_rgba(207,167,101,0.9)] transition-all duration-300 hover:-translate-y-px hover:brightness-105"
        >
          เปิดดู
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="ตัวเลือกอื่น"
          className={`tile hover-tile grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl transition-colors ${
            open ? "text-champagne" : "text-muted hover:text-ice"
          }`}
        >
          <motion.span
            className="inline-flex"
            animate={reduced ? undefined : { rotate: open ? 90 : 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <IconMore className="h-4 w-4" />
          </motion.span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 grid grid-cols-3 gap-1 border-t border-hair pt-2.5">
              <MoreItem onClick={onEdit}>แก้ไข</MoreItem>
              <MoreItem onClick={onDuplicate}>ทำสำเนา</MoreItem>
              <MoreItem onClick={onDelete} danger>
                ลบ
              </MoreItem>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MoreItem({
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
      className={`min-h-10 cursor-pointer rounded-lg px-2 text-xs transition-colors ${
        danger
          ? "text-muted hover:bg-[#e79a9a]/10 hover:text-[#e79a9a]"
          : "hover-tile text-ice/80 hover:text-ice"
      }`}
    >
      {children}
    </button>
  );
}
