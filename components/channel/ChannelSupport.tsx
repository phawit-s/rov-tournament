"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { AnimatePresence, motion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import {
  submitChannelDonation,
  watchChannelDonations,
  type ChannelDonation,
} from "@/lib/channel/donations";
import { findChannelByHandle, watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { compressImage } from "@/lib/image";
import { formatPromptPayId, promptPayPayload } from "@/lib/promptpay";
import { formatMoney } from "@/lib/tournament/prize";
import { safeImageSrc, safeUrl } from "@/lib/safe";
import type { MemberTier } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import GoldDust from "../fx/GoldDust";
import { EmptyNote, Input, Label, Textarea } from "../tournament/ui";

type Mode = "tip" | "member";
const MONTHS = [1, 3, 6, 12];

export default function ChannelSupport() {
  const idParam = useHashParam("ch");
  const handleParam = useHashParam("h");
  const tournamentId = useHashParam("t");

  const [channel, setChannel] = useState<Channel | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [mode, setMode] = useState<Mode>("tip");

  const [tier, setTier] = useState<MemberTier | null>(null);
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(0);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [slip, setSlip] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCache, setQrCache] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<ChannelDonation[]>([]);

  // หาช่องจาก id หรือ handle — setState อยู่ใน callback ทั้งหมด ไม่ใช่ในตัว effect
  useEffect(() => {
    if (idParam) {
      return watchChannel(idParam, (found) => {
        setChannel(found);
        setLookupDone(true);
      });
    }
    if (!handleParam) return;
    let alive = true;
    findChannelByHandle(handleParam)
      .then((found) => {
        if (!alive) return;
        setChannel(found);
        setLookupDone(true);
      })
      .catch(() => alive && setLookupDone(true));
    return () => {
      alive = false;
    };
  }, [idParam, handleParam]);

  const resolving = (idParam || handleParam) && !lookupDone;

  // รายชื่อสมาชิกปัจจุบัน
  useEffect(() => {
    if (!channel?.id || !channel.member.showMemberList) return;
    return watchChannelDonations(
      channel.id,
      (list) =>
        setMembers(
          list.filter(
            (d) =>
              d.kind === "member" &&
              (!d.expiresAt || new Date(d.expiresAt).getTime() > Date.now()),
          ),
        ),
      { onlyApproved: true },
    );
  }, [channel?.id, channel?.member.showMemberList]);

  const finalAmount = mode === "member" && tier ? tier.pricePerMonth * months : amount;
  const promptPayId = channel?.donate.promptPayId ?? "";

  const payload = useMemo(
    () => (promptPayId ? promptPayPayload(promptPayId, finalAmount || undefined) : null),
    [promptPayId, finalAmount],
  );

  useEffect(() => {
    if (!payload || qrCache[payload]) return;
    let alive = true;
    QRCode.toDataURL(payload, {
      margin: 1,
      width: 320,
      color: { dark: "#12100b", light: "#ffffff" },
    })
      .then((url) => alive && setQrCache((p) => ({ ...p, [payload]: url })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [payload, qrCache]);

  const qr = payload ? (qrCache[payload] ?? null) : null;

  if (resolving) return null;

  if (!hasBackend) {
    return <EmptyNote>ระบบสนับสนุนต้องเชื่อมหลังบ้านก่อน</EmptyNote>;
  }

  if (!channel) {
    return (
      <EmptyNote>
        ไม่พบช่องนี้ — ลิงก์ต้องมี <code>#h=ชื่อช่อง</code> หรือ <code>#ch=รหัส</code>{" "}
        และเจ้าของต้องกดเผยแพร่ช่องก่อน
      </EmptyNote>
    );
  }

  const tipOn = channel.donate.enabled;
  const memberOn = channel.member.enabled;
  if (!tipOn && !memberOn) {
    return <EmptyNote>ช่องนี้ยังไม่ได้เปิดรับการสนับสนุน</EmptyNote>;
  }

  const quick = channel.donate.quickAmounts?.length
    ? channel.donate.quickAmounts
    : [20, 50, 100, 300, 500];

  const canSubmit =
    !!name.trim() && finalAmount > 0 && (mode === "tip" || !!tier) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await authStore.ensureSignedIn();
      await submitChannelDonation(channel.id, {
        kind: mode,
        name: name.trim(),
        amount: finalAmount,
        message: message.trim() || undefined,
        slip: slip ?? undefined,
        tierId: tier?.id,
        tierName: tier?.name,
        months: mode === "member" ? months : undefined,
        tournamentId: tournamentId ?? undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <>
        <GoldDust count={22} />
        <Panel accent="207 167 101" className="mx-auto max-w-lg p-9 text-center">
          <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
            Thank you
          </p>
          <h2 className="mt-3 font-display text-3xl font-light">
            <span className="text-gold-grad">ส่งสลิปเรียบร้อย</span>
          </h2>
          <p className="mt-4 text-sm text-muted">
            รอเจ้าของช่องกดยืนยัน พอยืนยันแล้วชื่อจะเด้งขึ้นหน้าจอสตรีมทันที
          </p>
          <div className="mt-7">
            <Button
              variant="ghost"
              onClick={() => {
                setSent(false);
                setSlip(null);
                setMessage("");
              }}
            >
              ส่งอีกครั้ง
            </Button>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* หัวช่อง */}
      <Panel className="overflow-hidden p-0">
        {channel.cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(channel.cover) ?? ""}
            alt=""
            className="h-32 w-full object-cover opacity-90 sm:h-44"
          />
        )}
        <div className="flex flex-wrap items-center gap-5 p-6 sm:p-7">
          {channel.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeImageSrc(channel.avatar) ?? ""}
              alt=""
              className="h-16 w-16 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-champagne/35 font-display text-xl text-champagne">
              {channel.name.slice(0, 1) || "R"}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-2xl font-light text-ice">
              {channel.name || channel.handle}
            </h2>
            {channel.tagline && (
              <p className="mt-1 text-sm text-muted">{channel.tagline}</p>
            )}
          </div>
          {channel.live.isLive && safeUrl(channel.live.url) && (
            <a
              href={safeUrl(channel.live.url) ?? undefined}
              target="_blank"
              rel="noreferrer noopener"
              className="shrink-0 rounded-full bg-[#e0566b]/15 px-4 py-2 font-display text-xs text-[#e0566b]"
            >
              ● LIVE
            </a>
          )}
        </div>
      </Panel>

      {/* สลับโหมด */}
      {tipOn && memberOn && (
        <div className="flex gap-1 rounded-xl tile p-1">
          {(
            [
              { key: "tip", label: "สนับสนุนครั้งเดียว" },
              { key: "member", label: "สมัครสมาชิกรายเดือน" },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`relative flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors sm:text-sm ${
                mode === m.key ? "text-[#1b1509]" : "text-muted hover:text-ice"
              }`}
            >
              {mode === m.key && (
                <motion.span
                  layoutId="support-tab"
                  className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)]"
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                />
              )}
              <span className="relative z-10">{m.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,380px)]">
        <div className="space-y-5">
          {mode === "member" ? (
            <Panel className="p-6">
              <Label>เลือกแพ็กเกจ</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {channel.member.tiers.map((t) => {
                  const active = tier?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTier(t)}
                      className="cursor-pointer rounded-xl p-4 text-left transition-all"
                      style={{
                        background: active ? `rgb(${t.rgb} / 0.14)` : "transparent",
                        boxShadow: `inset 0 0 0 1px rgb(${t.rgb} / ${active ? 0.55 : 0.2})`,
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className="font-display text-base"
                          style={{ color: `rgb(${t.rgb})` }}
                        >
                          {t.badge ? `${t.badge} ` : ""}
                          {t.name}
                        </span>
                        <span className="font-display text-lg text-ice tabular-nums">
                          ฿{t.pricePerMonth.toLocaleString("th-TH")}
                          <span className="text-xs text-muted">/เดือน</span>
                        </span>
                      </div>
                      {t.perks.length > 0 && (
                        <ul className="mt-2.5 space-y-1">
                          {t.perks.map((perk, i) => (
                            <li key={i} className="text-xs text-muted">
                              · {perk}
                            </li>
                          ))}
                        </ul>
                      )}
                    </button>
                  );
                })}
              </div>

              {tier && (
                <div className="mt-5">
                  <Label>สมัครกี่เดือน</Label>
                  <div className="flex flex-wrap gap-2">
                    {MONTHS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMonths(m)}
                        className={`cursor-pointer rounded-lg px-4 py-2 font-display text-sm transition-colors ${
                          months === m
                            ? "bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)] text-[#1b1509]"
                            : "tile text-muted hover:text-ice"
                        }`}
                      >
                        {m} เดือน
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Panel>
          ) : (
            <Panel className="p-6">
              <Label>ยอดที่ต้องการสนับสนุน</Label>
              <div className="flex flex-wrap gap-2">
                {quick.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAmount(q)}
                    className={`cursor-pointer rounded-lg px-4 py-2 font-display text-sm transition-colors ${
                      amount === q
                        ? "bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)] text-[#1b1509]"
                        : "tile text-muted hover:text-ice"
                    }`}
                  >
                    ฿{q}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <Input
                  type="number"
                  min={1}
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  placeholder="หรือกรอกยอดเอง"
                />
              </div>
              {tournamentId && (
                <p className="mt-3 rounded-xl tile px-4 py-3 text-xs text-champagne">
                  ยอดนี้จะนับเป็นการสมทบทุนเงินรางวัลของทัวร์ที่คุณเปิดมา
                </p>
              )}
            </Panel>
          )}

          <Panel className="space-y-4 p-6">
            <div>
              <Label>ชื่อที่จะขึ้นจอ</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ชื่อเล่นหรือชื่อในเกม"
                maxLength={40}
              />
            </div>
            <div>
              <Label hint="ไม่เกิน 140 ตัวอักษร">ข้อความ</Label>
              <Textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="อยากบอกอะไรก็พิมพ์เลย"
                maxLength={140}
              />
            </div>
            <div>
              <Label hint="ระบบย่อรูปให้อัตโนมัติ">แนบสลิปโอนเงิน</Label>
              <div className="flex items-center gap-3">
                {slip ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={safeImageSrc(slip) ?? ""}
                    alt=""
                    className="h-24 w-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="grid h-24 w-20 place-items-center rounded-lg tile-dashed text-xs text-muted">
                    ยังไม่มี
                  </div>
                )}
                <label className="inline-block cursor-pointer rounded-lg tile px-3 py-2 text-xs text-ice/80 transition-colors hover-tile">
                  เลือกรูปสลิป
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        setSlip(await compressImage(file));
                      } catch {
                        setError("อ่านรูปไม่ได้ ลองรูปอื่น");
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            {error && <p className="text-xs text-[#e79a9a]">{error}</p>}

            <Button onClick={submit} disabled={!canSubmit} className="w-full py-3.5">
              {busy
                ? "กำลังส่ง…"
                : finalAmount > 0
                  ? `ส่งสลิป ${formatMoney(finalAmount)}`
                  : "ส่งสลิป"}
            </Button>
            <p className="text-xs text-muted">
              เจ้าของช่องจะตรวจสลิปเองก่อนอนุมัติ ระบบไม่ได้เช็คยอดกับธนาคารอัตโนมัติ
            </p>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel accent="207 167 101" className="p-6 text-center">
            <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
              PromptPay
            </p>
            {qr ? (
              <>
                <motion.img
                  key={qr}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  src={qr}
                  alt="QR พร้อมเพย์"
                  className="mx-auto mt-4 w-56 rounded-xl bg-white p-2"
                />
                <p className="mt-4 font-display text-2xl text-champagne">
                  {finalAmount > 0 ? formatMoney(finalAmount) : "ระบุยอดเอง"}
                </p>
                <p className="mt-1.5 text-sm text-ice/85">
                  {channel.donate.displayName || channel.name}
                </p>
                <p className="text-xs text-muted">{formatPromptPayId(promptPayId)}</p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">ยังไม่ได้ใส่เลขพร้อมเพย์</p>
            )}
          </Panel>

          {mode === "member" && channel.member.showMemberList && members.length > 0 && (
            <Panel className="p-6">
              <h3 className="font-display text-base text-ice">
                สมาชิกปัจจุบัน <span className="text-muted">({members.length})</span>
              </h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                <AnimatePresence initial={false}>
                  {members.map((m) => {
                    const t = channel.member.tiers.find((x) => x.id === m.tierId);
                    return (
                      <motion.li
                        key={m.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="rounded-lg px-2.5 py-1.5 text-xs"
                        style={{
                          color: t ? `rgb(${t.rgb})` : "var(--color-muted)",
                          background: t ? `rgb(${t.rgb} / 0.12)` : "transparent",
                          boxShadow: `inset 0 0 0 1px ${
                            t ? `rgb(${t.rgb} / 0.3)` : "rgb(var(--hair)/var(--hair-a))"
                          }`,
                        }}
                      >
                        {t?.badge ? `${t.badge} ` : ""}
                        {m.name}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
