"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { authStore } from "@/lib/backend/firebase";
import {
  setChannelDonationStatus,
  expiryFrom,
  watchChannelDonations,
  type ChannelDonation,
} from "@/lib/channel/donations";
import { channelStore, emptyChannel, pushChannel } from "@/lib/channel/store";
import { normalizeHandle, type Channel } from "@/lib/channel/types";
import { compressImage } from "@/lib/image";
import { uid } from "@/lib/random";
import { safeImageSrc } from "@/lib/safe";

import { formatMoney } from "@/lib/tournament/prize";
import { formatThaiDate } from "@/lib/tournament/share";
import type { MemberTier } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import Reveal, { PageHeading } from "../ui/Reveal";
import { EmptyNote, Input, Label, NumberInput, Textarea } from "../tournament/ui";

const TIER_COLORS = ["221 175 100", "109 146 219", "160 121 216", "77 181 145"];

export default function ChannelSettings() {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();

  const stored = useSyncExternalStore(
    channelStore.subscribe,
    channelStore.getSnapshot,
    channelStore.getServerSnapshot,
  );

  const [donations, setDonations] = useState<ChannelDonation[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // ยังไม่มีช่องในเครื่อง = สร้างโครงว่างให้จากบัญชีที่ล็อกอิน
  useEffect(() => {
    if (!user || stored) return;
    channelStore.set(emptyChannel({ uid: user.uid, email: user.email }));
  }, [user, stored]);

  useEffect(() => {
    if (!user) return;
    return watchChannelDonations(user.uid, setDonations);
  }, [user]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 2600);
    return () => window.clearTimeout(t);
  }, [note]);

  if (!user) return null;
  const channel = stored;
  if (!channel) return null;

  const set = <K extends keyof Channel>(key: K, value: Channel[K]) =>
    channelStore.update({ [key]: value } as Partial<Channel>);

  const publish = async () => {
    if (!channel.handle) {
      setNote("ตั้งชื่อช่อง (handle) ก่อนถึงจะเผยแพร่ได้");
      return;
    }
    setBusy(true);
    try {
      await pushChannel({ ...channel, ownerEmail: user.email ?? undefined });
      setNote("เผยแพร่ช่องแล้ว");
      recordActivity("tournament.publish", `เผยแพร่ช่อง "${channel.name || channel.handle}"`, {
        actor: user.name,
      });
    } catch (err) {
      setNote(err instanceof Error ? err.message : "เผยแพร่ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";
  const supportUrl = `${origin}/c/#h=${channel.handle || channel.id}`;
  const alertUrl = `${origin}/widget/alert/#ch=${channel.id}`;

  const pending = donations.filter((d) => d.status === "pending");

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Channel"
        title="ช่องของคุณ"
        description="ตั้งพร้อมเพย์ แพ็กเกจสมาชิก และลิงก์สำหรับสตรีมที่เดียว ใช้ได้กับทุกทัวร์"
        action={
          <Button onClick={publish} disabled={busy}>
            {busy ? "กำลังเผยแพร่…" : "เผยแพร่ช่อง"}
          </Button>
        }
      />

      {note && <p className="text-sm text-champagne">{note}</p>}

      {/* ลิงก์ */}
      <Reveal>
        <Panel accent="109 146 219" className="p-6">
          <h3 className="font-display text-lg font-medium text-ice">ลิงก์ของช่อง</h3>
          <div className="mt-4 space-y-2.5">
            <LinkRow label="หน้าสนับสนุน" url={supportUrl} />
            <LinkRow label="Widget แจ้งเตือน (OBS)" url={alertUrl} />
          </div>
          <p className="mt-4 text-xs text-muted">
            ลิงก์ widget ใช้ได้ตลอด ไม่ต้องเปลี่ยนทุกครั้งที่จัดทัวร์ใหม่
            แก้อะไรในหน้านี้แล้วอย่าลืมกด &ldquo;เผยแพร่ช่อง&rdquo;
          </p>
        </Panel>
      </Reveal>

      {/* โปรไฟล์ */}
      <Reveal index={1}>
        <Panel className="p-6">
          <h3 className="font-display text-lg font-medium text-ice">โปรไฟล์</h3>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <Label hint="ใช้ในลิงก์ เช่น /c/#h=affarain — a-z 0-9 - _ เท่านั้น">
                  ชื่อช่อง (handle)
                </Label>
                <Input
                  value={channel.handle}
                  onChange={(e) => set("handle", normalizeHandle(e.target.value))}
                  placeholder="affarain"
                  maxLength={24}
                />
              </div>
              <div>
                <Label>ชื่อที่แสดง</Label>
                <Input
                  value={channel.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="AFFA RAIN"
                  maxLength={40}
                />
              </div>
              <div>
                <Label>คำโปรย</Label>
                <Input
                  value={channel.tagline ?? ""}
                  onChange={(e) => set("tagline", e.target.value)}
                  placeholder="ช่องแข่ง RoV สายฝนต้องมา"
                  maxLength={80}
                />
              </div>
              <div>
                <Label>ลิงก์ไลฟ์</Label>
                <Input
                  value={channel.live.url}
                  onChange={(e) =>
                    set("live", { ...channel.live, url: e.target.value.trim() })
                  }
                  placeholder="https://www.tiktok.com/@affarain/live"
                />
                <label className="mt-2.5 flex cursor-pointer items-center gap-2.5 text-sm text-ice/85">
                  <input
                    type="checkbox"
                    checked={channel.live.isLive}
                    onChange={(e) =>
                      set("live", { ...channel.live, isLive: e.target.checked })
                    }
                    className="h-4 w-4 accent-[#e0566b]"
                  />
                  ตอนนี้กำลังไลฟ์อยู่
                </label>
              </div>
            </div>

            <div className="space-y-4">
              <ImagePicker
                label="รูปโปรไฟล์"
                value={channel.avatar}
                onChange={(v) => set("avatar", v)}
                round
              />
              <ImagePicker
                label="รูปปก"
                value={channel.cover}
                onChange={(v) => set("cover", v)}
              />
            </div>
          </div>
        </Panel>
      </Reveal>

      {/* โดเนท */}
      <Reveal index={2}>
        <Panel className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-medium text-ice">รับโดเนท</h3>
            <Switch
              checked={channel.donate.enabled}
              onChange={(v) => set("donate", { ...channel.donate, enabled: v })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label hint="เบอร์มือถือ / เลขบัตรประชาชน / e-wallet id">
                เลขพร้อมเพย์
              </Label>
              <Input
                value={channel.donate.promptPayId ?? ""}
                onChange={(e) =>
                  set("donate", { ...channel.donate, promptPayId: e.target.value })
                }
                placeholder="0812345678"
              />
            </div>
            <div>
              <Label>ชื่อบัญชีที่จะโชว์</Label>
              <Input
                value={channel.donate.displayName ?? ""}
                onChange={(e) =>
                  set("donate", { ...channel.donate, displayName: e.target.value })
                }
                placeholder="ชื่อผู้รับโอน"
              />
            </div>
          </div>

          <div>
            <Label>ข้อความบนหน้าสนับสนุน</Label>
            <Textarea
              rows={2}
              value={channel.donate.note ?? ""}
              onChange={(e) => set("donate", { ...channel.donate, note: e.target.value })}
            />
          </div>
        </Panel>
      </Reveal>

      {/* สมาชิก */}
      <Reveal index={3}>
        <Panel className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-medium text-ice">แพ็กเกจสมาชิก</h3>
            <Switch
              checked={channel.member.enabled}
              onChange={(v) => set("member", { ...channel.member, enabled: v })}
            />
          </div>

          <div className="space-y-3">
            {channel.member.tiers.map((tier, index) => (
              <div key={tier.id} className="rounded-xl tile p-4">
                <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto_auto]">
                  <Input
                    value={tier.badge ?? ""}
                    onChange={(e) => updateTier(index, { badge: e.target.value })}
                    className="w-14 text-center"
                    maxLength={2}
                    placeholder="★"
                  />
                  <Input
                    value={tier.name}
                    onChange={(e) => updateTier(index, { name: e.target.value })}
                    placeholder="ชื่อแพ็กเกจ"
                  />
                  <NumberInput
                    value={tier.pricePerMonth}
                    onChange={(pricePerMonth) => updateTier(index, { pricePerMonth })}
                    className="w-28"
                    placeholder="ราคา"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      set("member", {
                        ...channel.member,
                        tiers: channel.member.tiers.filter((_, i) => i !== index),
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
                  placeholder={"สิทธิพิเศษทีละบรรทัด"}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() =>
              set("member", {
                ...channel.member,
                tiers: [
                  ...channel.member.tiers,
                  {
                    id: uid(),
                    name: `แพ็กเกจ ${channel.member.tiers.length + 1}`,
                    pricePerMonth: 99,
                    rgb: TIER_COLORS[channel.member.tiers.length % TIER_COLORS.length],
                    perks: [],
                    badge: "★",
                  } satisfies MemberTier,
                ],
              })
            }
            className="cursor-pointer rounded-lg tile px-3 py-2 text-xs text-muted transition-colors hover:text-champagne"
          >
            + เพิ่มแพ็กเกจ
          </button>
        </Panel>
      </Reveal>

      {/* กล่องสลิป */}
      <Reveal index={4}>
        <Panel className="p-6">
          <h3 className="mb-4 font-display text-lg font-medium text-ice">
            สลิปที่ส่งเข้ามา{" "}
            <span className="text-muted">({pending.length} รอตรวจ)</span>
          </h3>

          {donations.length === 0 ? (
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
                        {d.tournamentName && ` · สมทบทุน ${d.tournamentName}`}
                      </p>
                    </div>

                    {d.status === "pending" && (
                      <div className="flex gap-1.5">
                        <MiniBtn
                          onClick={() =>
                            void setChannelDonationStatus(user.uid, d.id, "approved", {
                              expiresAt:
                                d.kind === "member" && d.months
                                  ? expiryFrom(d.months)
                                  : undefined,
                            }).then(() =>
                              recordActivity(
                                d.kind === "member" ? "member.approve" : "donation.approve",
                                `${d.name} · ${formatMoney(d.amount)}`,
                                { actor: user.name },
                              ),
                            )
                          }
                        >
                          อนุมัติ · เด้งขึ้นจอ
                        </MiniBtn>
                        <MiniBtn
                          danger
                          onClick={() =>
                            void setChannelDonationStatus(user.uid, d.id, "rejected")
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
      </Reveal>
    </div>
  );

  function updateTier(index: number, value: Partial<MemberTier>) {
    if (!channel) return;
    channelStore.update({
      member: {
        ...channel.member,
        tiers: channel.member.tiers.map((t, i) =>
          i === index ? { ...t, ...value } : t,
        ),
      },
    });
  }
}

function ImagePicker({
  label,
  value,
  onChange,
  round,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
  round?: boolean;
}) {
  return (
    <div>
      <Label hint="ไม่ใส่ก็ได้">{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(value) ?? ""}
            alt=""
            className={`h-16 object-cover ${round ? "w-16 rounded-full" : "w-28 rounded-lg"}`}
          />
        ) : (
          <div
            className={`grid h-16 place-items-center tile-dashed text-xs text-muted ${
              round ? "w-16 rounded-full" : "w-28 rounded-lg"
            }`}
          >
            —
          </div>
        )}
        <div className="space-y-1.5">
          <label className="inline-block cursor-pointer rounded-lg tile px-3 py-2 text-xs text-ice/80 transition-colors hover-tile">
            เลือกรูป
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                onChange(
                  await compressImage(file, {
                    maxWidth: round ? 300 : 900,
                    maxBytes: round ? 70_000 : 300_000,
                  }),
                );
              }}
            />
          </label>
          {value && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="block cursor-pointer text-xs text-muted transition-colors hover:text-[#e79a9a]"
            >
              เอาออก
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-xs text-muted">{label}</span>
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

function Switch({
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
