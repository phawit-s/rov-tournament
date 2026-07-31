"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { AUDIT_META, watchAudit, type AuditEntry } from "@/lib/audit";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import {
  raisedForTournament,
  watchChannelDonations,
  type ChannelDonation,
} from "@/lib/channel/donations";
import { channelStore } from "@/lib/channel/store";
import { safeImageSrc } from "@/lib/safe";
import {
  cloudReady,
  pushTournament,
  registrationToSolo,
  registrationToTeam,
  setRegistrationStatus,
  watchRegistrations,
  type Registration,
} from "@/lib/tournament/cloud";
import { formatMoney } from "@/lib/tournament/prize";
import { formatThaiDate } from "@/lib/tournament/share";
import { tournamentStore } from "@/lib/tournament/store";
import type { Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { Badge, EmptyNote, RegStatusBadge } from "./ui";

type Props = { tournament: Tournament; isAdmin: boolean };

/**
 * แท็บคลาวด์ของทัวร์ — เผยแพร่ รับใบสมัครข้ามเครื่อง และดูยอดสมทบทุน
 * ส่วนตั้งค่าโดเนท/สมาชิกย้ายไปอยู่ที่ "ช่อง" แล้ว จะได้ตั้งครั้งเดียวใช้ได้ทุกทัวร์
 */
export default function CloudPanel({ tournament, isAdmin }: Props) {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const channel = useSyncExternalStore(
    channelStore.subscribe,
    channelStore.getSnapshot,
    channelStore.getServerSnapshot,
  );

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [donations, setDonations] = useState<ChannelDonation[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /**
   * ประวัติบนคลาวด์ — เริ่มที่ loading แล้วรอ onSnapshot เป็นคนเปลี่ยนสถานะ
   * ถ้ากติกาปฏิเสธ (ไม่ใช่ผู้ดูแล) จะเข้า onError แล้วกลายเป็น denied
   * แล้วเราซ่อนส่วนนี้ทิ้งไปเลย ไม่ต้องโชว์ error ให้คนดูงง
   */
  const [audit, setAudit] = useState<{
    status: "loading" | "ok" | "denied";
    items: AuditEntry[];
  }>({ status: "loading", items: [] });

  const live = cloudReady() && !!user && !user.anonymous;

  useEffect(() => {
    if (!live) return;
    return watchRegistrations(tournament.id, setRegistrations);
  }, [live, tournament.id]);

  useEffect(() => {
    if (!live) return;
    // setState อยู่ใน callback ของ onSnapshot เท่านั้น ไม่มีการ set ตอน effect ทำงาน
    return watchAudit((list) => setAudit({ status: "ok", items: list }), {
      max: 80,
      onError: () => setAudit({ status: "denied", items: [] }),
    });
  }, [live]);

  useEffect(() => {
    const channelId = tournament.channelId ?? user?.uid;
    if (!live || !channelId) return;
    return watchChannelDonations(channelId, setDonations, { onlyApproved: true });
  }, [live, tournament.channelId, user?.uid]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 2600);
    return () => window.clearTimeout(t);
  }, [note]);

  if (!hasBackend) {
    return (
      <EmptyNote>
        ยังไม่ได้เชื่อมหลังบ้าน — ทัวร์นี้อยู่ในเครื่องนี้เครื่องเดียว
      </EmptyNote>
    );
  }

  const raised = raisedForTournament(donations, tournament.id);
  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";
  const supportUrl = channel?.handle
    ? `${origin}/c/#h=${channel.handle}&t=${tournament.id}`
    : null;

  // ประวัติของทัวร์นี้เท่านั้น — watchAudit ดึงมาทั้งระบบ เลยต้องกรองเองที่นี่
  const history =
    audit.status === "ok"
      ? audit.items.filter((e) => e.targetId === tournament.id).slice(0, 8)
      : [];

  return (
    <div className="space-y-5">
      {/* เผยแพร่ */}
      <Panel accent="109 146 219" className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-medium text-ice">เผยแพร่ทัวร์</h3>
            <p className="mt-1 text-sm text-muted">
              {user && !user.anonymous
                ? `ล็อกอินเป็น ${user.name}`
                : "ต้องล็อกอินก่อนถึงจะเผยแพร่ได้"}
            </p>
          </div>

          {user && !user.anonymous && isAdmin && (
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await pushTournament(tournament, {
                    uid: user.uid,
                    name: user.name,
                    email: user.email,
                  });
                  tournamentStore.update(tournament.id, {
                    ownerUid: user.uid,
                    ownerEmail: user.email ?? undefined,
                    channelId: user.uid,
                  });
                  setNote("เผยแพร่ขึ้นคลาวด์แล้ว");
                  recordActivity(
                    "tournament.publish",
                    `เผยแพร่ "${tournament.name}" ขึ้นคลาวด์`,
                    {
                      tournamentId: tournament.id,
                      tournamentName: tournament.name,
                      actor: user.name,
                    },
                  );
                } catch (err) {
                  setNote(err instanceof Error ? err.message : "เผยแพร่ไม่สำเร็จ");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "กำลังส่ง…" : "เผยแพร่/อัปเดตขึ้นคลาวด์"}
            </Button>
          )}
        </div>

        {note && <p className="mt-3 text-xs text-champagne">{note}</p>}

        {live && (
          <div className="mt-5 space-y-2 border-t border-hair pt-4 text-sm">
            <LinkRow label="หน้าทัวร์ (คนดู)" url={`${origin}/tournament/#c=${tournament.id}`} />
            {supportUrl ? (
              <LinkRow label="สมทบทุนเงินรางวัล" url={supportUrl} />
            ) : (
              <p className="text-xs text-muted">
                ตั้งชื่อช่องที่{" "}
                <Link href="/channel/" className="text-champagne underline-offset-2 hover:underline">
                  หน้าช่อง
                </Link>{" "}
                ก่อน แล้วจะได้ลิงก์สมทบทุน
              </p>
            )}
          </div>
        )}

        {/* ประวัติการเผยแพร่ — ผู้ดูแลเท่านั้นที่อ่านได้ คนอื่นจะไม่เห็นบล็อกนี้เลย */}
        {audit.status === "ok" && history.length > 0 && (
          <div className="mt-5 border-t border-hair pt-4">
            <p className="font-display text-eyebrow tracking-luxe text-muted uppercase">
              ประวัติการเผยแพร่
            </p>
            <ul className="mt-3 space-y-2.5">
              {history.map((entry) => {
                const meta = AUDIT_META[entry.kind];
                return (
                  <li key={entry.id} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="num w-32 shrink-0 text-xs text-muted">
                      {formatThaiDate(entry.at)}
                    </span>
                    {meta ? (
                      <Badge rgb={meta.rgb}>{meta.label}</Badge>
                    ) : (
                      <Badge rgb="146 151 172">{entry.kind}</Badge>
                    )}
                    <span className="min-w-0 truncate text-xs text-ice/75">
                      {entry.actorName}
                      {entry.detail ? ` · ${entry.detail}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted">
              ประวัติบนคลาวด์แก้หรือลบย้อนหลังไม่ได้
            </p>
          </div>
        )}
      </Panel>

      {/* สมทบทุน */}
      <Panel accent="207 167 101" className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-eyebrow tracking-luxe text-champagne/70 uppercase">
              สมทบทุนเงินรางวัล
            </p>
            <p className="mt-2 font-display text-3xl font-light text-champagne">
              {formatMoney(raised, tournament.prize.currency)}
            </p>
            <p className="mt-1.5 text-sm text-muted">
              เงินรางวัลตั้งต้น{" "}
              {formatMoney(tournament.prize.total, tournament.prize.currency)} · รวมเป็น{" "}
              <span className="text-ice">
                {formatMoney(tournament.prize.total + raised, tournament.prize.currency)}
              </span>
            </p>
          </div>

          {isAdmin && raised > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                tournamentStore.mutate(tournament.id, (t) => ({
                  ...t,
                  prize: { ...t.prize, total: t.prize.total + raised },
                }));
                setNote("บวกยอดสมทบทุนเข้าเงินรางวัลแล้ว");
              }}
            >
              บวกเข้าเงินรางวัล
            </Button>
          )}
        </div>

        {donations.filter((d) => d.tournamentId === tournament.id).length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-hair pt-4">
            {donations
              .filter((d) => d.tournamentId === tournament.id)
              .map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-ice">{d.name}</span>
                  <span className="shrink-0 font-display text-champagne">
                    {formatMoney(d.amount, tournament.prize.currency)}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </Panel>

      {/* ใบสมัคร */}
      <Panel className="p-6">
        <h3 className="mb-4 font-display text-lg font-medium text-ice">
          ใบสมัครที่ส่งเข้ามา{" "}
          <span className="text-muted">
            ({registrations.filter((r) => r.status === "pending").length} รออนุมัติ)
          </span>
        </h3>

        {!live ? (
          <EmptyNote>ล็อกอินก่อนถึงจะเห็นใบสมัคร</EmptyNote>
        ) : registrations.length === 0 ? (
          <EmptyNote>ยังไม่มีใครสมัครผ่านคลาวด์</EmptyNote>
        ) : (
          <ul className="space-y-2.5">
            <AnimatePresence initial={false}>
              {registrations.map((reg) => (
                <motion.li
                  key={reg.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="flex flex-wrap items-center gap-3 rounded-xl tile px-4 py-3"
                >
                  {reg.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeImageSrc(reg.image) ?? ""}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ice">{reg.teamName}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[
                        reg.kind === "solo"
                          ? [reg.ign, reg.lane].filter(Boolean).join(" · ")
                          : reg.members.join(" · "),
                        `โดย ${reg.byName}`,
                        formatThaiDate(reg.createdAt),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {/* ช่องติดต่อกับข้อความถึงผู้จัดต้องอ่านได้ก่อนกดรับ ไม่ใช่ต้องไปหาทีหลัง */}
                    {(reg.contact || reg.note) && (
                      <p className="mt-1 truncate text-xs text-champagne/80">
                        {[reg.contact, reg.note].filter(Boolean).join(" — ")}
                      </p>
                    )}
                  </div>
                  <RegStatusBadge status={reg.status} />
                  {isAdmin && reg.status === "pending" && (
                    <div className="flex gap-1.5">
                      <MiniBtn
                        onClick={async () => {
                          /* โหมดเดี่ยวต้องลงกองผู้เล่น ไม่ใช่กองทีม
                             ไม่งั้นทีมที่ผู้จัดสุ่มแบ่งทีหลังจะถูกทับ */
                          const asSolo =
                            tournament.entryMode === "solo" || reg.kind === "solo";
                          tournamentStore.mutate(tournament.id, (t) =>
                            asSolo
                              ? {
                                  ...t,
                                  soloPlayers: [...t.soloPlayers, registrationToSolo(reg)],
                                }
                              : { ...t, teams: [...t.teams, registrationToTeam(reg)] },
                          );
                          await setRegistrationStatus(tournament.id, reg.id, "approved");
                          recordActivity(
                            "registration.approve",
                            `อนุมัติ "${reg.teamName}"`,
                            {
                              tournamentId: tournament.id,
                              tournamentName: tournament.name,
                            },
                          );
                        }}
                      >
                        รับเข้าทัวร์
                      </MiniBtn>
                      <MiniBtn
                        danger
                        onClick={() =>
                          void setRegistrationStatus(tournament.id, reg.id, "rejected")
                        }
                      >
                        ปฏิเสธ
                      </MiniBtn>
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Panel>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 text-xs text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate text-xs text-ice/75">{url}</code>
      <MiniBtn
        onClick={() => {
          void navigator.clipboard.writeText(url);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
      </MiniBtn>
    </div>
  );
}

function MiniBtn({
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
      className={`shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
        danger
          ? "border-[#e79a9a]/25 text-[#e79a9a]/90 hover:bg-[#e79a9a]/10"
          : "border-hair text-muted hover:text-champagne"
      }`}
    >
      {children}
    </button>
  );
}
