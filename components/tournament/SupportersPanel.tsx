"use client";

import { safeImageSrc } from "@/lib/safe";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { uid } from "@/lib/random";
import {
  cloudReady,
  expiryFrom,
  pushTournament,
  registrationToTeam,
  setDonationStatus,
  setRegistrationStatus,
  submitDonation,
  watchDonations,
  watchRegistrations,
  type Registration,
} from "@/lib/tournament/cloud";
import { formatMoney } from "@/lib/tournament/prize";
import { tournamentStore } from "@/lib/tournament/store";
import { formatThaiDate } from "@/lib/tournament/share";
import type { Donation, MemberTier, Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { EmptyNote, Input, Label, Textarea } from "./ui";

type Props = { tournament: Tournament; isAdmin: boolean };

const TIER_COLORS = ["221 175 100", "109 146 219", "160 121 216", "77 181 145"];

export default function SupportersPanel({ tournament, isAdmin }: Props) {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();

  const [donations, setDonations] = useState<Donation[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const owner = !!user;
  const live = cloudReady() && owner;

  useEffect(() => {
    if (!live) return;
    return watchDonations(tournament.id, setDonations);
  }, [live, tournament.id]);

  useEffect(() => {
    if (!live) return;
    return watchRegistrations(tournament.id, setRegistrations);
  }, [live, tournament.id]);

  const donate = tournament.donate ?? {
    enabled: false,
    promptPayId: "",
    displayName: "",
    note: "",
    quickAmounts: [20, 50, 100, 300, 500],
  };
  const member = tournament.member ?? {
    enabled: false,
    headline: "สมัครสมาชิก",
    description: "",
    tiers: [],
    showMemberList: true,
  };

  const patch = (value: Partial<Tournament>) =>
    tournamentStore.update(tournament.id, value);

  if (!hasBackend) {
    return (
      <EmptyNote>
        ระบบโดเนท/สมาชิกต้องเชื่อมหลังบ้านก่อน — ใส่ค่า Firebase ใน{" "}
        <code>.env.local</code> แล้วตั้ง secret ใน GitHub ตามที่เขียนไว้ใน README
      </EmptyNote>
    );
  }

  return (
    <div className="space-y-5">
      {/* ล็อกอิน + เผยแพร่ */}
      <Panel accent="109 146 219" className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg font-medium text-ice">
              เชื่อมคลาวด์
            </h3>
            <p className="mt-1 text-sm text-muted">
              {user
                ? `ล็อกอินเป็น ${user.name}`
                : "ล็อกอินก่อน ถึงจะเผยแพร่และรับสลิปได้"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {user ? (
              <>
                <Button
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await pushTournament(tournament, {
                        uid: user.uid,
                        name: user.name,
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
                      setNote(
                        err instanceof Error ? err.message : "เผยแพร่ไม่สำเร็จ",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  disabled={busy || !isAdmin}
                >
                  {busy ? "กำลังส่ง…" : "เผยแพร่/อัปเดตขึ้นคลาวด์"}
                </Button>
                <Button variant="ghost" onClick={() => void authStore.signOut()}>
                  ออกจากระบบ
                </Button>
              </>
            ) : (
              <Button onClick={() => void authStore.signIn()}>
                ล็อกอินด้วย Google
              </Button>
            )}
          </div>
        </div>

        {note && <p className="mt-3 text-xs text-champagne">{note}</p>}

        {user && (
          <div className="mt-5 grid gap-2 border-t border-hair pt-4 text-sm">
            <LinkRow label="หน้าโดเนท" path={`/donate/#c=${tournament.id}`} />
            <LinkRow label="หน้าสมัครสมาชิก" path={`/member/#c=${tournament.id}`} />
            <LinkRow label="หน้าทัวร์ (คนดู)" path={`/tournament/#c=${tournament.id}`} />
          </div>
        )}
      </Panel>

      {/* ตั้งค่าโดเนท */}
      {isAdmin && (
        <Panel className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-medium text-ice">ตั้งค่าโดเนท</h3>
            <Toggle
              checked={donate.enabled}
              onChange={(v) => patch({ donate: { ...donate, enabled: v } })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="เบอร์มือถือ / เลขบัตรประชาชน / e-wallet id">
                เลขพร้อมเพย์
              </Label>
              <Input
                value={donate.promptPayId ?? ""}
                onChange={(e) =>
                  patch({ donate: { ...donate, promptPayId: e.target.value } })
                }
                placeholder="0812345678"
              />
            </div>
            <div>
              <Label>ชื่อบัญชีที่จะโชว์</Label>
              <Input
                value={donate.displayName ?? ""}
                onChange={(e) =>
                  patch({ donate: { ...donate, displayName: e.target.value } })
                }
                placeholder="ชื่อผู้รับโอน"
              />
            </div>
          </div>

          <div>
            <Label>ข้อความบนหน้าโดเนท</Label>
            <Textarea
              rows={2}
              value={donate.note ?? ""}
              onChange={(e) => patch({ donate: { ...donate, note: e.target.value } })}
              placeholder="โอนแล้วแนบสลิป ชื่อจะขึ้นหน้าจอสตรีม"
            />
          </div>
        </Panel>
      )}

      {/* ตั้งค่าสมาชิก */}
      {isAdmin && (
        <Panel className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-medium text-ice">
              แพ็กเกจสมาชิก
            </h3>
            <Toggle
              checked={member.enabled}
              onChange={(v) => patch({ member: { ...member, enabled: v } })}
            />
          </div>

          <div className="space-y-3">
            {member.tiers.map((tier, index) => (
              <div key={tier.id} className="rounded-xl tile p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
                  <Input
                    value={tier.name}
                    onChange={(e) => updateTier(index, { name: e.target.value })}
                    placeholder="ชื่อแพ็กเกจ"
                  />
                  <div className="w-28">
                    <Input
                      type="number"
                      min={0}
                      value={tier.pricePerMonth}
                      onChange={(e) =>
                        updateTier(index, {
                          pricePerMonth: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        member: {
                          ...member,
                          tiers: member.tiers.filter((_, i) => i !== index),
                        },
                      })
                    }
                    className="cursor-pointer px-2 text-xs text-muted transition-colors hover:text-[#e79a9a]"
                  >
                    ลบ
                  </button>
                </div>
                <Textarea
                  rows={2}
                  className="mt-3"
                  value={tier.perks.join("\n")}
                  onChange={(e) =>
                    updateTier(index, {
                      perks: e.target.value.split("\n").filter(Boolean).slice(0, 6),
                    })
                  }
                  placeholder={"สิทธิพิเศษทีละบรรทัด\nเช่น ป้ายสมาชิกหน้าชื่อ"}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              patch({
                member: {
                  ...member,
                  tiers: [
                    ...member.tiers,
                    {
                      id: uid(),
                      name: `แพ็กเกจ ${member.tiers.length + 1}`,
                      pricePerMonth: 99,
                      rgb: TIER_COLORS[member.tiers.length % TIER_COLORS.length],
                      perks: [],
                      badge: "★",
                    } satisfies MemberTier,
                  ],
                },
              })
            }
            className="cursor-pointer rounded-lg tile px-3 py-2 text-xs text-muted transition-colors hover:text-champagne"
          >
            + เพิ่มแพ็กเกจ
          </button>
        </Panel>
      )}

      {/* ใบสมัครทีมจากคนอื่น */}
      {live && registrations.length > 0 && (
        <Panel className="p-6">
          <h3 className="mb-4 font-display text-lg font-medium text-ice">
            ใบสมัครที่ส่งเข้ามา{" "}
            <span className="text-muted">
              ({registrations.filter((r) => r.status === "pending").length} รออนุมัติ)
            </span>
          </h3>
          <ul className="space-y-2.5">
            {registrations.map((reg) => (
              <li
                key={reg.id}
                className="flex flex-wrap items-center gap-3 rounded-xl tile px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ice">{reg.teamName}</p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {reg.members.join(" · ")} · โดย {reg.byName}
                  </p>
                </div>
                <span className="font-display text-xs text-muted">{reg.status}</span>
                {reg.status === "pending" && (
                  <div className="flex gap-1.5">
                    <MiniBtn
                      onClick={async () => {
                        tournamentStore.mutate(tournament.id, (t) => ({
                          ...t,
                          teams: [...t.teams, registrationToTeam(reg)],
                        }));
                        await setRegistrationStatus(tournament.id, reg.id, "approved");
                      }}
                    >
                      อนุมัติ
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
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* สลิปที่รออนุมัติ */}
      <Panel className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-lg font-medium text-ice">
            สลิปที่ส่งเข้ามา{" "}
            <span className="text-muted">
              ({donations.filter((d) => d.status === "pending").length} รอตรวจ)
            </span>
          </h3>
          {live && isAdmin && (
            <MiniBtn
              onClick={() =>
                void submitDonation(tournament.id, {
                  kind: "tip",
                  name: "ทดสอบระบบ",
                  amount: 99,
                  message: "ลองยิง alert ดู",
                })
              }
            >
              ยิงตัวอย่างเทสต์
            </MiniBtn>
          )}
        </div>

        {!live ? (
          <EmptyNote>ล็อกอินก่อนถึงจะเห็นสลิปที่ส่งเข้ามา</EmptyNote>
        ) : donations.length === 0 ? (
          <EmptyNote>ยังไม่มีใครส่งสลิป</EmptyNote>
        ) : (
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {donations.map((d) => (
                <motion.li
                  key={d.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  className="flex flex-wrap items-start gap-4 rounded-xl tile p-4"
                >
                  {d.slip && (
                    <a href={safeImageSrc(d.slip) ?? undefined} target="_blank" rel="noreferrer noopener">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={safeImageSrc(d.slip) ?? ""}
                        alt="สลิป"
                        className="h-24 w-20 rounded-lg object-cover"
                      />
                    </a>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ice">
                      {d.name}
                      <span className="ml-2 font-display text-champagne">
                        {formatMoney(d.amount)}
                      </span>
                      {d.kind === "member" && (
                        <span className="ml-2 text-xs text-muted">
                          สมาชิก {d.tierName} · {d.months} เดือน
                        </span>
                      )}
                    </p>
                    {d.message && (
                      <p className="mt-1 text-xs text-muted">“{d.message}”</p>
                    )}
                    <p className="mt-1 text-xs text-muted/80">
                      {formatThaiDate(d.createdAt)} · {d.status}
                      {d.expiresAt && ` · หมดอายุ ${formatThaiDate(d.expiresAt)}`}
                    </p>
                  </div>

                  {isAdmin && d.status === "pending" && (
                    <div className="flex gap-1.5">
                      <MiniBtn
                        onClick={() =>
                          void setDonationStatus(tournament.id, d.id, "approved").then(
                            () => {
                              recordActivity(
                                d.kind === "member"
                                  ? "member.approve"
                                  : "donation.approve",
                                `${d.name} · ${formatMoney(d.amount)}${
                                  d.kind === "member" ? ` (${d.tierName})` : ""
                                }`,
                                {
                                  tournamentId: tournament.id,
                                  tournamentName: tournament.name,
                                  actor: user?.name,
                                },
                              );
                              if (d.kind === "member" && d.months) {
                                // ตั้งวันหมดอายุให้ตอนอนุมัติ
                                return setDonationStatusWithExpiry(
                                  tournament.id,
                                  d.id,
                                  expiryFrom(d.months),
                                );
                              }
                            },
                          )
                        }
                      >
                        อนุมัติ · เด้งขึ้นจอ
                      </MiniBtn>
                      <MiniBtn
                        danger
                        onClick={() =>
                          void setDonationStatus(tournament.id, d.id, "rejected")
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

  function updateTier(index: number, value: Partial<MemberTier>) {
    patch({
      member: {
        ...member,
        tiers: member.tiers.map((t, i) => (i === index ? { ...t, ...value } : t)),
      },
    });
  }
}

async function setDonationStatusWithExpiry(
  tournamentId: string,
  donationId: string,
  expiresAt: string,
) {
  const { getDb } = await import("@/lib/backend/firebase");
  const { doc, setDoc } = await import("firebase/firestore");
  const db = getDb();
  if (!db) return;
  await setDoc(
    doc(db, "tournaments", tournamentId, "donations", donationId),
    { expiresAt },
    { merge: true },
  );
}

function LinkRow({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`
      : path;

  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-xs text-muted">{label}</span>
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

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-300 ${
        checked ? "bg-[linear-gradient(90deg,#bd9350,#f0d8ab)]" : "rule"
      }`}
      aria-pressed={checked}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
        style={{ left: checked ? 22 : 2 }}
      />
    </button>
  );
}
