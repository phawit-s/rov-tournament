"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { safeImageSrc } from "@/lib/safe";
import {
  cloudReady,
  registrationToSolo,
  registrationToTeam,
  setRegistrationStatus,
  watchRegistrations,
  type Registration,
} from "@/lib/tournament/cloud";
import { formatThaiDate } from "@/lib/tournament/share";
import { tournamentStore } from "@/lib/tournament/store";
import type { Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import MiniBtn from "../ui/MiniBtn";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { IconSearch } from "../ui/icons";
import { ArtShield, EmptyState, RegStatusBadge } from "./ui";

const NO_REGS: Registration[] = [];

type Filter = "pending" | "approved" | "rejected" | "all";

const FILTER_LABEL: Record<Filter, string> = {
  pending: "รออนุมัติ",
  approved: "รับแล้ว",
  rejected: "ปฏิเสธ",
  all: "ทั้งหมด",
};

/**
 * กล่องใบสมัคร — แท็บของตัวเอง ไม่ได้ซ่อนอยู่ใต้ "คลาวด์ / สมทบทุน" อีกแล้ว
 *
 * นี่คืองานที่ผู้จัดต้องกดถี่ที่สุดในช่วงเปิดรับสมัคร แต่ของเดิมมันอยู่ท้าย
 * แท็บที่ชื่อว่า "คลาวด์ / สมทบทุน" ต่อจากกล่องเผยแพร่ กล่องยอดโดเนท
 * และกล่องประวัติ — ต้องเลื่อนผ่านสามการ์ดทุกครั้งที่จะรับทีมเข้าสักทีม
 * และไม่มีอะไรบนหน้าทัวร์บอกเลยว่ามีใบรออยู่กี่ใบ
 *
 * ที่นี่มีตัวกรองตามสถานะ ช่องค้นหา และปุ่ม "รับทั้งหมดที่รออยู่"
 * สำหรับตอนปิดรับสมัครแล้วต้องเคลียร์คิวทีเดียว
 */
export default function EntriesPanel({
  tournament,
  isAdmin,
}: {
  tournament: Tournament;
  isAdmin: boolean;
}) {
  const [regs, setRegs] = useState<Registration[]>(NO_REGS);
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const live = cloudReady() && !!authStore.user();

  useEffect(() => {
    if (!live) return;
    return watchRegistrations(
      tournament.id,
      (list) => setRegs(list),
      () => setRegs(NO_REGS),
    );
  }, [live, tournament.id]);

  const counts = useMemo(() => {
    const base: Record<Filter, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      all: regs.length,
    };
    for (const r of regs) base[r.status] += 1;
    return base;
  }, [regs]);

  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("th");
    return regs.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!needle) return true;
      return [r.teamName, r.byName, r.ign ?? "", r.contact ?? "", ...r.members]
        .join(" ")
        .toLocaleLowerCase("th")
        .includes(needle);
    });
  }, [regs, filter, q]);

  /**
   * รับใบเข้าทัวร์
   *
   * โหมดเดี่ยวต้องลงกองผู้เล่น ไม่ใช่กองทีม ไม่งั้นทีมที่ผู้จัดสุ่มแบ่งทีหลัง
   * จะถูกทับ · กันรับซ้ำด้วยการเช็คว่ามี id ใบนี้อยู่ในกองปลายทางแล้วหรือยัง
   * (onSnapshot กับปุ่มที่กดรัวๆ ทำให้เกิดได้จริง)
   */
  const accept = async (reg: Registration) => {
    const asSolo = tournament.entryMode === "solo" || reg.kind === "solo";
    tournamentStore.mutate(tournament.id, (t) => {
      if (asSolo) {
        if (t.soloPlayers.some((p) => p.id === reg.id)) return t;
        return { ...t, soloPlayers: [...t.soloPlayers, registrationToSolo(reg)] };
      }
      if (t.teams.some((x) => x.id === reg.id)) return t;
      return { ...t, teams: [...t.teams, registrationToTeam(reg)] };
    });
    await setRegistrationStatus(tournament.id, reg.id, "approved");
    recordActivity("registration.approve", `อนุมัติ "${reg.teamName}"`, {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
    });
  };

  const acceptAll = async () => {
    const queue = regs.filter((r) => r.status === "pending");
    if (!queue.length) return;
    setBusy(true);
    try {
      for (const reg of queue) await accept(reg);
      toast(`รับเข้าทัวร์ ${queue.length} ใบแล้ว`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "รับใบไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  };

  /* EmptyState มีกรอบของตัวเองอยู่แล้ว ห้ามครอบ Panel ทับ
     ไม่งั้นได้กล่องซ้อนกล่องซึ่งอ่านเป็น "การ์ดที่โหลดไม่ขึ้น" */
  if (!hasBackend) {
    return (
      <EmptyState
        art={<ArtShield />}
        title="ยังไม่ได้เชื่อมคลาวด์"
        description="ทัวร์นี้อยู่ในเครื่องนี้เครื่องเดียว จึงยังไม่มีใบสมัครออนไลน์ — เพิ่มทีมเองได้ที่แท็บทีม"
      />
    );
  }

  if (!tournament.ownerUid) {
    return (
      <EmptyState
        art={<ArtShield />}
        title="ยังไม่ได้เผยแพร่ทัวร์นี้"
        description="ใบสมัครส่งเข้ามาได้ก็ต่อเมื่อทัวร์อยู่บนคลาวด์แล้ว — กดเผยแพร่ที่แท็บคลาวด์ก่อน แล้วแชร์ลิงก์ให้คนสมัคร"
      />
    );
  }

  return (
    <div className="space-y-4">
      <Panel className="p-5 sm:p-6">
        <Panel.Header
          eyebrow="Entries"
          title="ใบสมัครที่ส่งเข้ามา"
          count={counts.all || null}
          action={
            isAdmin && counts.pending > 0 ? (
              <Button size="sm" loading={busy} onClick={acceptAll}>
                รับทั้งหมด {counts.pending} ใบ
              </Button>
            ) : undefined
          }
        />

        <div className="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
          {(["pending", "approved", "rejected", "all"] as Filter[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`min-h-10 shrink-0 cursor-pointer rounded-xl px-4 font-display text-xs whitespace-nowrap transition-colors ${
                filter === key
                  ? "accent-fill text-onaccent"
                  : "tile text-muted hover:text-ice"
              }`}
            >
              {FILTER_LABEL[key]}
              {counts[key] > 0 && (
                <span className="num ml-1.5 opacity-60">{counts[key]}</span>
              )}
            </button>
          ))}
        </div>

        {regs.length > 6 && (
          <div className="field mb-4 flex min-h-11 items-center gap-2.5 rounded-xl px-3.5">
            <IconSearch className="h-4 w-4 shrink-0 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นชื่อทีม ชื่อในเกม หรือคนส่งใบ"
              className="min-w-0 grow bg-transparent text-sm text-ice outline-none placeholder:text-muted/70"
            />
          </div>
        )}

        {!live ? (
          <EmptyState
            title="ล็อกอินก่อนถึงจะเห็นใบสมัคร"
            description="กติกาฝั่งเซิร์ฟเวอร์เปิดให้เฉพาะเจ้าของทัวร์กับทีมงานอ่านใบสมัคร"
          />
        ) : shown.length === 0 ? (
          <EmptyState
            title={
              counts.all === 0
                ? "ยังไม่มีใครสมัครเข้ามา"
                : `ไม่มีใบในกลุ่ม "${FILTER_LABEL[filter]}"`
            }
            description={
              counts.all === 0
                ? "แชร์ลิงก์ทัวร์ให้คนสมัคร ใบที่ส่งเข้ามาจะโผล่ที่นี่ทันทีโดยไม่ต้องรีเฟรช"
                : "ลองเลือกกลุ่มอื่นดู"
            }
          />
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {shown.map((reg) => (
                <EntryRow
                  key={reg.id}
                  reg={reg}
                  isAdmin={isAdmin}
                  onAccept={() =>
                    void accept(reg)
                      .then(() => toast(`รับ "${reg.teamName}" เข้าทัวร์แล้ว`, "success"))
                      .catch(() => toast("รับใบไม่สำเร็จ", "error"))
                  }
                  onReject={() =>
                    void setRegistrationStatus(tournament.id, reg.id, "rejected")
                      .then(() => toast(`ปฏิเสธ "${reg.teamName}" แล้ว`, "info"))
                      .catch(() => toast("ทำรายการไม่สำเร็จ", "error"))
                  }
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Panel>
    </div>
  );
}

function EntryRow({
  reg,
  isAdmin,
  onAccept,
  onReject,
}: {
  reg: Registration;
  isAdmin: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const image = reg.image ? safeImageSrc(reg.image) : null;
  const line = [
    reg.kind === "solo"
      ? [reg.ign, reg.lane].filter(Boolean).join(" · ")
      : reg.members.join(" · "),
    `โดย ${reg.byName}`,
    formatThaiDate(reg.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="tile flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="sunken grid h-10 w-10 shrink-0 place-items-center rounded-lg font-display text-sm text-iris">
          {reg.teamName.slice(0, 1).toUpperCase()}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ice">{reg.teamName}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{line}</p>
        {/* ช่องติดต่อกับข้อความถึงผู้จัดต้องอ่านได้ก่อนกดรับ ไม่ใช่ต้องไปหาทีหลัง */}
        {(reg.contact || reg.note) && (
          <p className="mt-1 truncate text-xs text-iris/80">
            {[reg.contact, reg.note].filter(Boolean).join(" — ")}
          </p>
        )}
      </div>

      <RegStatusBadge status={reg.status} />

      {isAdmin && reg.status === "pending" && (
        <div className="flex gap-1.5">
          <MiniBtn onClick={onAccept}>รับเข้าทัวร์</MiniBtn>
          <MiniBtn danger onClick={onReject}>
            ปฏิเสธ
          </MiniBtn>
        </div>
      )}
    </motion.li>
  );
}
