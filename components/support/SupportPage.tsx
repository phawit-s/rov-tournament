"use client";

import { safeImageSrc } from "@/lib/safe";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { AnimatePresence, motion } from "motion/react";
import { useLiveTournament } from "@/hooks/useLiveTournament";
import { authStore } from "@/lib/backend/firebase";
import { compressImage } from "@/lib/image";
import { formatPromptPayId, promptPayPayload } from "@/lib/promptpay";
import { activeMembers, cloudReady, submitDonation, watchDonations } from "@/lib/tournament/cloud";
import { formatMoney } from "@/lib/tournament/prize";
import type { Donation, MemberTier } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import GoldDust from "../fx/GoldDust";
import { EmptyNote, Input, Label, Textarea } from "../tournament/ui";

type Props = { mode: "tip" | "member" };

const MONTH_OPTIONS = [1, 3, 6, 12];

export default function SupportPage({ mode }: Props) {
  const { tournament } = useLiveTournament();
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
  const [members, setMembers] = useState<Donation[]>([]);

  const donate = tournament?.donate;
  const memberCfg = tournament?.member;
  const promptPayId = donate?.promptPayId ?? "";

  const finalAmount = mode === "member" && tier ? tier.pricePerMonth * months : amount;

  // payload เปลี่ยนตามยอด — คำนวณตอน render แล้วค่อยเรนเดอร์ QR แบบ async
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
      .then((url) => {
        if (alive) setQrCache((prev) => ({ ...prev, [payload]: url }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [payload, qrCache]);

  const qr = payload ? (qrCache[payload] ?? null) : null;

  // รายชื่อสมาชิกปัจจุบัน
  useEffect(() => {
    if (mode !== "member" || !tournament?.id || !cloudReady()) return;
    if (!memberCfg?.showMemberList) return;
    return watchDonations(tournament.id, (list) => setMembers(activeMembers(list)), {
      onlyApproved: true,
    });
  }, [mode, tournament?.id, memberCfg?.showMemberList]);

  const quick = donate?.quickAmounts?.length
    ? donate.quickAmounts
    : [20, 50, 100, 300, 500];

  if (!tournament) {
    return (
      <EmptyNote>
        ไม่พบรายการ — ลิงก์ต้องมี <code>#c=รหัสทัวร์</code> และผู้จัดต้องเผยแพร่ขึ้นคลาวด์ก่อน
      </EmptyNote>
    );
  }

  const enabled = mode === "tip" ? donate?.enabled : memberCfg?.enabled;
  if (!enabled) {
    return (
      <EmptyNote>
        {mode === "tip"
          ? "ผู้จัดยังไม่ได้เปิดรับโดเนทสำหรับรายการนี้"
          : "ผู้จัดยังไม่ได้เปิดระบบสมาชิกสำหรับรายการนี้"}
      </EmptyNote>
    );
  }

  const canSubmit =
    !!name.trim() && finalAmount > 0 && (mode === "tip" || !!tier) && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    if (!cloudReady()) {
      setError("ยังไม่ได้ตั้งค่าหลังบ้าน เลยส่งสลิปไม่ได้ — บอกผู้จัดให้เชื่อม Firebase ก่อน");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // ล็อกอินแบบไม่ระบุตัวตนให้เงียบๆ เพื่อให้ผ่านกติกาความปลอดภัย
      await authStore.ensureSignedIn();
      await submitDonation(tournament.id, {
        kind: mode,
        name: name.trim(),
        amount: finalAmount,
        message: message.trim() || undefined,
        slip: slip ?? undefined,
        tierId: tier?.id,
        tierName: tier?.name,
        months: mode === "member" ? months : undefined,
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
        <Panel accent="207 167 101" className="p-8 text-center sm:p-10">
          <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
            Thank you
          </p>
          <h2 className="mt-3 font-display text-3xl font-light">
            <span className="text-gold-grad">ส่งสลิปเรียบร้อย</span>
          </h2>
          <p className="mt-4 text-sm text-muted">
            รอผู้จัดกดยืนยัน พอยืนยันแล้วชื่อจะเด้งขึ้นหน้าจอสตรีมทันที
          </p>
          <div className="mt-7">
            <Button variant="ghost" onClick={() => { setSent(false); setSlip(null); setMessage(""); }}>
              ส่งอีกครั้ง
            </Button>
          </div>
        </Panel>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
          {mode === "tip" ? "Support" : "Membership"}
        </p>
        <h2 className="mt-2 font-display text-2xl font-medium text-ice sm:text-3xl">
          {mode === "tip"
            ? `สนับสนุน ${tournament.name}`
            : (memberCfg?.headline ?? "สมัครสมาชิก")}
        </h2>
        <p className="mt-2 text-sm text-muted">
          {mode === "tip"
            ? (donate?.note ?? "โอนแล้วแนบสลิป ชื่อจะขึ้นหน้าจอสตรีม")
            : (memberCfg?.description ??
              "สมัครรายเดือน รับป้ายสมาชิกและสิทธิพิเศษ")}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(320px,380px)]">
        <div className="space-y-5">
          {mode === "member" ? (
            <Panel className="p-6">
              <Label>เลือกแพ็กเกจ</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                {(memberCfg?.tiers ?? []).map((t) => {
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
                    {MONTH_OPTIONS.map((m) => (
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
              <Label>ยอดที่ต้องการโดเนท</Label>
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
                  min={donate?.minAmount ?? 1}
                  value={amount || ""}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  placeholder="หรือกรอกยอดเอง"
                />
              </div>
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
                  <img src={safeImageSrc(slip) ?? ""} alt="สลิป" className="h-24 w-20 rounded-lg object-cover" />
                ) : (
                  <div className="grid h-24 w-20 place-items-center rounded-lg tile-dashed text-xs text-muted">
                    ยังไม่มี
                  </div>
                )}
                <div className="space-y-2">
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
                  {slip && (
                    <button
                      type="button"
                      onClick={() => setSlip(null)}
                      className="block cursor-pointer text-xs text-muted transition-colors hover:text-[#e79a9a]"
                    >
                      เอาออก
                    </button>
                  )}
                </div>
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
              ผู้จัดจะตรวจสลิปเองก่อนอนุมัติ ระบบไม่ได้เช็คยอดกับธนาคารอัตโนมัติ
            </p>
          </Panel>
        </div>

        {/* QR */}
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
                  {donate?.displayName ?? tournament.name}
                </p>
                <p className="text-xs text-muted">{formatPromptPayId(promptPayId)}</p>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted">
                ผู้จัดยังไม่ได้ใส่เลขพร้อมเพย์
              </p>
            )}
          </Panel>

          {mode === "member" && memberCfg?.showMemberList && members.length > 0 && (
            <Panel className="p-6">
              <h3 className="font-display text-base text-ice">
                สมาชิกปัจจุบัน{" "}
                <span className="text-muted">({members.length})</span>
              </h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                <AnimatePresence initial={false}>
                  {members.map((m) => {
                    const t = memberCfg.tiers.find((x) => x.id === m.tierId);
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
                          boxShadow: `inset 0 0 0 1px ${t ? `rgb(${t.rgb} / 0.3)` : "rgb(var(--hair)/var(--hair-a))"}`,
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
