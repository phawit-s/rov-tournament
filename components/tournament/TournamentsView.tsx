"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { useAccess } from "@/hooks/useAdmin";
import { useMyChannels } from "@/hooks/useMyChannel";
import { watchAllChannels } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { authStore } from "@/lib/backend/firebase";
import {
  cloudReady,
  watchAllTournaments,
  watchMyTournaments,
  type CloudTournament,
} from "@/lib/tournament/cloud";
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

/** อ้างอิงคงที่ ไม่งั้น setCloud([]) ตอน error จะทำให้รีเรนเดอร์ไม่จบ */
const NO_CLOUD: CloudTournament[] = [];
const NO_CHANNELS: Channel[] = [];

/** ค่าตัวกรอง "ทุกช่อง" — แยกจากรหัสช่องจริงด้วยเครื่องหมายที่ใช้เป็น id ไม่ได้ */
const ALL = "*";

export default function TournamentsView() {
  const all = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );
  const [editing, setEditing] = useState<Tournament | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Tournament | null>(null);

  /* ---- ทัวร์จากคลาวด์ ---- */
  const access = useAccess();
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const [cloud, setCloud] = useState<CloudTournament[]>(NO_CLOUD);

  const uid = user && !user.anonymous ? user.uid : null;
  const seesAll = access === "verified";

  /*
    ช่องที่เอามาทำตัวกรอง — ผู้ดูแลเห็นทุกช่องในระบบ คนอื่นเห็นเฉพาะของตัวเอง
    ตรงกับชุดทัวร์ที่แต่ละคนดึงมาได้จริง ไม่งั้นตัวกรองจะมีตัวเลือกที่กดแล้วว่างเปล่า
  */
  const { channels: myChannels } = useMyChannels();
  const [allChannels, setAllChannels] = useState<Channel[]>(NO_CHANNELS);
  useEffect(() => {
    if (!seesAll) return;
    return watchAllChannels(setAllChannels, () => setAllChannels(NO_CHANNELS));
  }, [seesAll]);
  const scopeChannels = seesAll ? allChannels : myChannels;

  const [channelFilter, setChannelFilter] = useState<string>(ALL);
  const channelName = (id?: string) => {
    if (!id) return null;
    const hit = scopeChannels.find((c) => c.id === id);
    return hit?.name || (hit?.handle ? `@${hit.handle}` : null);
  };

  useEffect(() => {
    if (!cloudReady() || !uid) return;
    // ผู้ดูแลเห็นทุกอัน คนอื่นเห็นเฉพาะของตัวเอง (กติกาก็อนุญาตแค่นั้น)
    const stop = seesAll
      ? watchAllTournaments(setCloud, () => setCloud(NO_CLOUD))
      : watchMyTournaments(uid, setCloud, () => setCloud(NO_CLOUD));
    return stop;
  }, [uid, seesAll]);

  // เปิดมาจากลิงก์แชร์ -> ถามก่อนว่าจะบันทึกลงเครื่องไหม
  const sharedRaw = useHashParam("s");
  const shared = useMemo(
    () => (sharedRaw ? decodeTournament(sharedRaw) : null),
    [sharedRaw],
  );
  const incoming = dismissed ? null : shared;

  const sorted = all
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  /* "ยังไม่ผูกช่อง" ต้องเป็นตัวเลือกจริง ไม่ใช่ของที่หายไปเฉยๆ —
     ทัวร์ที่สร้างก่อนมีระบบช่องทั้งหมดอยู่ในกองนี้ */
  const unassigned = sorted.filter((t) => !t.channelId).length;
  const list =
    channelFilter === ALL
      ? sorted
      : channelFilter === ""
        ? sorted.filter((t) => !t.channelId)
        : sorted.filter((t) => t.channelId === channelFilter);

  const running = list.filter((t) => t.status === "running").length;

  /*
    ทัวร์อยู่ใน localStorage ของเครื่องคนสร้าง หน้านี้เลยเห็นแต่ของเครื่องตัวเอง
    ดึงจากคลาวด์มาเติมด้วย ไม่งั้นผู้ดูแลอีกคน (หรือคนเดิมแต่คนละเครื่อง)
    จะไม่เห็นทัวร์ที่จัดไว้เลย ทั้งที่เผยแพร่ขึ้นคลาวด์แล้ว
  */
  const onlyOnCloud = cloud.filter((c) => !all.some((t) => t.id === c.id));

  if (editing) {
    return (
      <TournamentForm
        tournament={editing}
        channels={scopeChannels}
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
          <Button
            onClick={() =>
              setEditing({
                ...emptyTournament(""),
                /* กรองอยู่ที่ช่องไหน ก็สร้างทัวร์ให้ช่องนั้นเลย —
                   คนที่กำลังดูช่องหนึ่งอยู่แล้วกดสร้าง ตั้งใจสร้างให้ช่องนั้นแทบทุกครั้ง */
                channelId:
                  channelFilter !== ALL && channelFilter !== ""
                    ? channelFilter
                    : undefined,
              })
            }
          >
            + สร้างทัวร์นาเมนต์
          </Button>
        }
      />

      {/*
        ตัวกรองตามช่อง — โผล่เมื่อมีอะไรให้แยกจริงเท่านั้น

        ถ้ามีช่องเดียวและไม่มีทัวร์ที่ยังไม่ผูกช่อง แถบนี้จะมีปุ่มเดียว
        ซึ่งไม่ได้ช่วยอะไรนอกจากกินที่ — ซ่อนไปเลยดีกว่า
      */}
      {scopeChannels.length + (unassigned > 0 ? 1 : 0) > 1 && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <FilterChip
            active={channelFilter === ALL}
            onClick={() => setChannelFilter(ALL)}
          >
            ทุกช่อง
          </FilterChip>
          {scopeChannels.map((c) => (
            <FilterChip
              key={c.id}
              active={channelFilter === c.id}
              onClick={() => setChannelFilter(c.id)}
            >
              {c.name || (c.handle ? `@${c.handle}` : c.id.slice(0, 8))}
            </FilterChip>
          ))}
          {unassigned > 0 && (
            <FilterChip
              active={channelFilter === ""}
              onClick={() => setChannelFilter("")}
            >
              ยังไม่ผูกช่อง
              <span className="num ml-1.5 opacity-60">{unassigned}</span>
            </FilterChip>
          )}
        </div>
      )}

      {incoming && (
        <Panel accent="110 155 240" state="next" className="p-5">
          <p className="slug">มีทัวร์ที่ถูกแชร์มา</p>
          <p className="mt-2 text-sm text-ice/90">
            <span className="font-display text-iris">{incoming.name}</span>{" "}
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

      {list.length === 0 && onlyOnCloud.length === 0 ? (
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
                  /* โชว์ชื่อช่องเฉพาะตอนที่มีหลายช่องปนกันจริง มีช่องเดียวก็รู้อยู่แล้ว */
                  channelName={
                    scopeChannels.length > 1 ? channelName(t.channelId) : null
                  }
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

      {/* ทัวร์ที่อยู่บนคลาวด์แต่ไม่มีในเครื่องนี้ — เปิดดูได้ แต่จะแก้ต้องบันทึกลงเครื่องก่อน */}
      {onlyOnCloud.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex items-baseline justify-between gap-4 border-t border-hair pt-4">
            <p className="slug">
              {seesAll ? "บนคลาวด์ · ทุกผู้จัด" : "บนคลาวด์ · ของคุณ"}
            </p>
            <p className="slug slug-2 num">{onlyOnCloud.length} รายการ</p>
          </div>
          <p className="text-sm text-muted">
            ทัวร์เหล่านี้ถูกเผยแพร่ไว้แต่ยังไม่มีสำเนาในเครื่องนี้ —
            กดเปิดดูได้ ถ้าจะแก้ให้กด &ldquo;บันทึกลงเครื่อง&rdquo; ในหน้าทัวร์ก่อน
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {onlyOnCloud.map((t, i) => (
              <Reveal key={t.id} index={i} from="scale">
                <TournamentCard
                  tournament={t}
                  href={`/tournament/#t=${t.id}`}
                  actions={
                    <Link
                      href={`/tournament/#t=${t.id}`}
                      className="font-display text-xs text-iris hover:underline"
                    >
                      เปิดดู →
                    </Link>
                  }
                />
              </Reveal>
            ))}
          </div>
        </section>
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
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl accent-fill px-4 py-2 font-display text-xs font-medium tracking-wide text-onaccent shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_34px_-18px_rgba(169,155,255,0.9)] transition-all duration-300 hover:-translate-y-px hover:brightness-105"
        >
          เปิดดู
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="ตัวเลือกอื่น"
          className={`tile hover-tile grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-xl transition-colors ${
            open ? "text-iris" : "text-muted hover:text-ice"
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
          ? "text-muted hover:bg-danger/10 hover:text-danger"
          : "hover-tile text-ice/80 hover:text-ice"
      }`}
    >
      {children}
    </button>
  );
}

/** ปุ่มกรองหนึ่งเม็ด — ทรงเดียวกับเม็ดยาเมนูของทั้งเว็บ */
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 shrink-0 cursor-pointer rounded-xl px-4 font-display text-xs whitespace-nowrap transition-colors ${
        active ? "accent-fill text-onaccent" : "tile text-muted hover:text-ice"
      }`}
    >
      {children}
    </button>
  );
}
