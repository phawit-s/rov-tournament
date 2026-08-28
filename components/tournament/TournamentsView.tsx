"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { useManageableChannels } from "@/hooks/useChannels";
import { useSiteRole } from "@/hooks/useRole";
import { useTournamentScope, type ScopedTournament } from "@/hooks/useTournamentScope";
import { emptyTournament, tournamentStore } from "@/lib/tournament/store";
import { decodeTournament } from "@/lib/tournament/share";
import type { Tournament, TournamentStatus } from "@/lib/tournament/types";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Panel from "../ui/Panel";
import Reveal from "../ui/Reveal";
import PageHead from "../studio/PageHead";
import { IconMore, IconSearch } from "../ui/icons";
import { toast } from "../ui/Toast";
import TournamentCard from "./TournamentCard";
import TournamentForm from "./TournamentForm";
import { ArtShield, Badge, EmptyState, STATUS_META, Skeleton } from "./ui";

/** ค่าตัวกรอง "ทั้งหมด" — แยกจากรหัสจริงด้วยเครื่องหมายที่ใช้เป็น id ไม่ได้ */
const ALL = "*";

const STATUS_ORDER: TournamentStatus[] = [
  "registration",
  "running",
  "ready",
  "draft",
  "finished",
];

/**
 * รายการทัวร์ในหลังบ้าน — รายการเดียว ไม่ใช่สองกอง
 *
 * ★ นี่คือหน้าที่ทำให้รู้สึกว่า "เป็นแอดมินแล้วเห็นไม่ครบ" ★
 * ของเดิมเอาทัวร์ที่อยู่ใน localStorage ของเครื่องนี้ขึ้นเป็นรายการหลัก
 * แล้วผลักทัวร์บนคลาวด์ที่ไม่มีสำเนาในเครื่องไปกองท้ายหน้าในหัวข้อ
 * "บนคลาวด์ · ทุกผู้จัด" ซึ่งกดได้แค่ "เปิดดู" — ผลคือ
 *
 *   · ตัวเลขนับบนหัวหน้านับแต่ของในเครื่อง
 *   · ตัวกรองตามช่องกรองแต่ของในเครื่อง กองล่างไม่ถูกกรองเลย
 *   · ผู้ดูแลที่เปิดจากอีกเครื่องเห็นทัวร์ของตัวเองไปอยู่กองล่างปนกับของคนอื่น
 *
 * ตอนนี้รวมเป็นรายการเดียว เรียงตามเวลาแก้ล่าสุด แล้วบอกด้วยป้ายว่าใบไหน
 * อยู่ที่ไหนบ้าง (ดู hooks/useTournamentScope.ts)
 */
export default function TournamentsView() {
  const { admin, uid } = useSiteRole();
  const { list, cloudLoaded } = useTournamentScope(admin, uid);
  const { channels } = useManageableChannels(admin, uid);

  const [editing, setEditing] = useState<Tournament | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ScopedTournament | null>(null);

  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<TournamentStatus | typeof ALL>(ALL);
  /** ผู้ดูแลเห็นของทุกคน จึงต้องมีปุ่มสลับกลับมาดูเฉพาะของตัวเองเร็วๆ */
  const [mineOnly, setMineOnly] = useState(false);

  // เปิดมาจากลิงก์แชร์ -> ถามก่อนว่าจะบันทึกลงเครื่องไหม
  const sharedRaw = useHashParam("s");
  const shared = useMemo(
    () => (sharedRaw ? decodeTournament(sharedRaw) : null),
    [sharedRaw],
  );
  const incoming = dismissed ? null : shared;

  const channelName = (id?: string) => {
    if (!id) return null;
    const hit = channels.find((c) => c.id === id);
    return hit?.name || (hit?.handle ? `@${hit.handle}` : null);
  };

  const unassigned = list.filter((t) => !t.data.channelId).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("th");
    return list.filter((row) => {
      if (mineOnly && !row.mine) return false;
      if (statusFilter !== ALL && row.data.status !== statusFilter) return false;
      if (channelFilter === "" && row.data.channelId) return false;
      if (channelFilter !== ALL && channelFilter !== "" && row.data.channelId !== channelFilter) {
        return false;
      }
      if (!needle) return true;
      return [row.data.name, row.data.tagline ?? "", row.ownerName ?? ""]
        .join(" ")
        .toLocaleLowerCase("th")
        .includes(needle);
    });
  }, [list, q, mineOnly, statusFilter, channelFilter]);

  /** จำนวนต่อสถานะ ใช้ทำตัวเลขบนปุ่มกรอง — นับจากทุกใบที่เห็น ไม่ใช่หลังกรอง */
  const statusCount = useMemo(() => {
    const map = new Map<TournamentStatus, number>();
    for (const row of list) {
      map.set(row.data.status, (map.get(row.data.status) ?? 0) + 1);
    }
    return map;
  }, [list]);

  const running = list.filter((t) => t.data.status === "running").length;
  const loading = !cloudLoaded && list.length === 0;

  if (editing) {
    return (
      <TournamentForm
        tournament={editing}
        channels={channels}
        onClose={() => setEditing(null)}
        onSaved={() => toast("บันทึกแล้ว", "success")}
      />
    );
  }

  const startNew = () =>
    setEditing({
      ...emptyTournament(""),
      /* กรองอยู่ที่ช่องไหน ก็สร้างทัวร์ให้ช่องนั้นเลย —
         คนที่กำลังดูช่องหนึ่งอยู่แล้วกดสร้าง ตั้งใจสร้างให้ช่องนั้นแทบทุกครั้ง */
      channelId:
        channelFilter !== ALL && channelFilter !== "" ? channelFilter : undefined,
    });

  const anyFilter =
    q.trim() !== "" || channelFilter !== ALL || statusFilter !== ALL || mineOnly;

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Tournaments"
        title="ทัวร์นาเมนต์ทั้งหมด"
        description="สร้างทัวร์ รับสมัคร สุ่มทีม จัดสายแข่ง กรอกผล และแชร์ให้คนอื่นดู"
        meta={
          list.length > 0
            ? `${list.length} รายการ${running ? ` · กำลังแข่ง ${running}` : ""}`
            : undefined
        }
        action={<Button onClick={startNew}>+ สร้างทัวร์นาเมนต์</Button>}
      />

      {/* ---------- แถบค้นหา + ตัวกรอง ---------- */}
      {(list.length > 3 || anyFilter) && (
        <div className="space-y-3">
          <div className="field flex min-h-11 items-center gap-2.5 rounded-xl px-3.5">
            <IconSearch className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นชื่อทัวร์ คำโปรย หรือชื่อผู้จัด"
              className="min-w-0 grow bg-transparent text-sm text-ice outline-none placeholder:text-muted/70"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                className="cursor-pointer text-xs text-muted transition-colors hover:text-ice"
              >
                ล้าง
              </button>
            )}
          </div>

          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <FilterChip active={statusFilter === ALL} onClick={() => setStatusFilter(ALL)}>
              ทุกสถานะ
            </FilterChip>
            {STATUS_ORDER.filter((st) => statusCount.get(st)).map((st) => (
              <FilterChip
                key={st}
                active={statusFilter === st}
                onClick={() => setStatusFilter(st)}
              >
                {STATUS_META[st].label}
                <span className="num ml-1.5 opacity-60">{statusCount.get(st)}</span>
              </FilterChip>
            ))}
            {admin && (
              <FilterChip active={mineOnly} onClick={() => setMineOnly((v) => !v)}>
                เฉพาะของฉัน
              </FilterChip>
            )}
          </div>

          {/*
            ตัวกรองตามช่อง — โผล่เมื่อมีอะไรให้แยกจริงเท่านั้น
            ถ้ามีช่องเดียวและไม่มีทัวร์ที่ยังไม่ผูกช่อง แถบนี้จะมีปุ่มเดียว
            ซึ่งไม่ได้ช่วยอะไรนอกจากกินที่
          */}
          {channels.length + (unassigned > 0 ? 1 : 0) > 1 && (
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <FilterChip
                active={channelFilter === ALL}
                onClick={() => setChannelFilter(ALL)}
              >
                ทุกช่อง
              </FilterChip>
              {channels.map((c) => (
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

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        anyFilter ? (
          <EmptyState
            title="ไม่เจอทัวร์ที่ตรงกับตัวกรอง"
            description="ลองล้างคำค้นหรือเลือกสถานะอื่นดู"
            action={
              <Button
                variant="ghost"
                onClick={() => {
                  setQ("");
                  setChannelFilter(ALL);
                  setStatusFilter(ALL);
                  setMineOnly(false);
                }}
              >
                ล้างตัวกรองทั้งหมด
              </Button>
            }
          />
        ) : (
          <EmptyState
            no="03"
            art={<ArtShield />}
            title="ยังไม่มีทัวร์นาเมนต์"
            description="สร้างทัวร์แรกเพื่อเปิดรับสมัคร สุ่มแบ่งทีม จัดสายแข่ง และแชร์ลิงก์ให้คนอื่นตามผล"
            action={<Button onClick={startNew}>+ สร้างทัวร์นาเมนต์</Button>}
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {filtered.map((row, i) => (
              <Reveal key={row.id} index={Math.min(i, 6)} from="scale">
                <TournamentCard
                  tournament={row.data}
                  /* โชว์ชื่อช่องเฉพาะตอนที่มีหลายช่องปนกันจริง มีช่องเดียวก็รู้อยู่แล้ว */
                  channelName={
                    channels.length > 1 ? channelName(row.data.channelId) : null
                  }
                  tags={<SourceTags row={row} showOwner={admin} />}
                  href={hrefFor(row)}
                  actions={
                    <CardActions
                      href={hrefFor(row)}
                      row={row}
                      onEdit={() => setEditing(row.data)}
                      onDuplicate={() => {
                        tournamentStore.duplicate(row.id);
                        toast("ทำสำเนาแล้ว", "success");
                      }}
                      onSaveLocal={() => {
                        tournamentStore.adopt(row.data);
                        toast("บันทึกลงเครื่องนี้แล้ว — แก้ได้เลย", "success");
                      }}
                      onDelete={() => setPendingDelete(row)}
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
        title={`ลบ "${pendingDelete?.data.name ?? ""}" ออกจากเครื่องนี้?`}
        description={
          pendingDelete?.onCloud
            ? "สำเนาในเครื่องนี้จะหาย แต่ใบบนคลาวด์ยังอยู่ — เปิดจากรายการนี้ได้เหมือนเดิม"
            : "ทีม สายแข่ง และผลที่กรอกไว้ทั้งหมดจะหายจากเครื่องนี้ กู้คืนไม่ได้"
        }
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

/*
  เปิดในสตูดิโอ ไม่ใช่เด้งออกไปหน้าสาธารณะ

  ของเดิมลิงก์ไป /tournament/ ซึ่งใช้เปลือกของหน้าคนดู — แถบข้างหาย
  เมนูบนกลายเป็นเมนูสาธารณะ แล้วทางกลับเหลือลิงก์เล็กๆ บนโปสเตอร์
  ทั้งที่คนกดจากหลังบ้านกำลังจะทำงานกับทัวร์นั้นต่อ

  ทัวร์ที่มีสำเนาในเครื่องเปิดด้วย #t= (แก้ได้ทันที)
  ที่มีแต่บนคลาวด์เปิดด้วย #c= เพื่อให้หน้าทัวร์ไปฟังสดจากคลาวด์ให้
*/
function hrefFor(row: ScopedTournament): string {
  return row.onDevice
    ? `/studio/tournament/#t=${row.id}`
    : `/studio/tournament/#c=${row.id}`;
}

/** ป้ายบอกว่าใบนี้อยู่ที่ไหน และของใคร */
function SourceTags({
  row,
  showOwner,
}: {
  row: ScopedTournament;
  showOwner: boolean;
}) {
  return (
    <>
      {!row.onCloud && <Badge rgb="138 142 168">ยังไม่เผยแพร่</Badge>}
      {!row.onDevice && <Badge rgb="110 155 240">บนคลาวด์</Badge>}
      {row.cloudNewer && <Badge rgb="255 91 122">คลาวด์ใหม่กว่าเครื่องนี้</Badge>}
      {showOwner && !row.mine && row.ownerName && (
        <Badge rgb="196 130 255">{row.ownerName}</Badge>
      )}
    </>
  );
}

/**
 * แถวปุ่มท้ายการ์ด — "เปิดดู" เป็นตัวเอกเดียว
 * ที่เหลือยุบไว้หลัง ⋯ แล้วกางลงในตัวการ์ด ไม่ใช่ dropdown ลอย —
 * เมนูลอยในกริดที่เลื่อนได้ต้องคอยคำนวณตำแหน่งใหม่ตอนเลื่อน ส่วนแบบกางลง
 * ดันการ์ดใบล่างลงไปเองตามธรรมชาติของเลย์เอาต์
 */
function CardActions({
  href,
  row,
  onEdit,
  onDuplicate,
  onSaveLocal,
  onDelete,
}: {
  href: string;
  row: ScopedTournament;
  onEdit: () => void;
  onDuplicate: () => void;
  onSaveLocal: () => void;
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
              {/* ยังไม่มีสำเนาในเครื่อง = แก้ไม่ได้ ต้องดึงลงมาก่อน
                  ของเดิมเขียนบอกไว้เป็นข้อความท้ายหน้า แต่ไม่มีปุ่มให้กดตรงนั้น */}
              {row.onDevice ? (
                <MoreItem onClick={onEdit}>แก้ไข</MoreItem>
              ) : (
                <MoreItem onClick={onSaveLocal}>ดึงลงเครื่อง</MoreItem>
              )}
              <MoreItem onClick={onDuplicate} disabled={!row.onDevice}>
                ทำสำเนา
              </MoreItem>
              <MoreItem onClick={onDelete} danger disabled={!row.onDevice}>
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
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-10 cursor-pointer rounded-lg px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
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
