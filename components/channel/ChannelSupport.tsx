"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
import { authStore, getAuthClient, hasBackend } from "@/lib/backend/firebase";
import {
  claimSlipRef,
  submitChannelDonation,
  verifySlipRemote,
  watchChannelDonations,
  type ChannelDonation,
} from "@/lib/channel/donations";
import { findChannelByHandle, watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { compressImage } from "@/lib/image";
import { formatPromptPayId, promptPayPayload } from "@/lib/promptpay";
import { inspectSlip } from "@/lib/slip";
import { formatMoney } from "@/lib/tournament/prize";
import { safeImageSrc, safeUrl } from "@/lib/safe";
import type { Donation, MemberTier } from "@/lib/tournament/types";
import Link from "next/link";
import Button from "../ui/Button";
import Corners from "../ui/Corners";
import Panel from "../ui/Panel";
import GoldDust from "../fx/GoldDust";
import { toast } from "../ui/Toast";
import { IconCheck } from "../ui/icons";
import {
  ArtShield,
  Badge,
  EmptyNote,
  EmptyState,
  Input,
  Label,
  Skeleton,
  Textarea,
} from "../tournament/ui";

type Mode = "tip" | "member";
const MONTHS = [1, 3, 6, 12];

/** ลองใหม่อีกครั้งหลังเว้นจังหวะสั้นๆ ใช้กับงานที่ล้มแล้วย้อนคืนไม่ได้ */
async function retryOnce<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return run();
  }
}

/**
 * ผลอ่าน QR บนสลิปที่ผู้ใช้เพิ่งเลือก
 * เก็บ payload ไว้ด้วยเพราะตอนกดส่งต้องใช้ทั้งลายนิ้วมือ (กันซ้ำ) และตัว payload (ส่งไปตรวจ)
 */
type SlipScan =
  | { state: "none" }
  | { state: "reading" }
  | { state: "no-qr" }
  | { state: "ok"; payload: string; fingerprint: string };

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
  const [slipScan, setSlipScan] = useState<SlipScan>({ state: "none" });
  const [busy, setBusy] = useState(false);
  /** ข้อความบอกว่าปุ่มกำลังทำอะไรอยู่ ตอนตรวจสลิปมันรอนานพอที่คนกดจะสงสัย */
  const [phase, setPhase] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  /** ระบบยืนยันสลิปแล้วอนุมัติให้เอง — บอกคนโอนว่าไม่ต้องรอผู้จัดกด */
  const [autoApproved, setAutoApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrCache, setQrCache] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<ChannelDonation[]>([]);
  // ป้ายสถานะสลิปสลับบ่อยกว่าอย่างอื่นในหน้านี้ คนที่ปิดแอนิเมชันไว้ให้เปลี่ยนแบบนิ่งๆ
  const calm = useReducedMotion();

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

  // แพ็กเกจแพงสุดได้เป็นตัวเอกของหน้า (Panel feature ใบเดียวในหน้านี้)
  const topTierId = channel.member.tiers.reduce<MemberTier | null>(
    (best, t) => (!best || t.pricePerMonth > best.pricePerMonth ? t : best),
    null,
  )?.id;

  // กันกดส่งตอน QR ยังอ่านไม่เสร็จ ไม่งั้นใบจะกลายเป็น "ไม่มี QR" ทั้งที่มี
  const canSubmit =
    !!name.trim() &&
    finalAmount > 0 &&
    (mode === "tip" || !!tier) &&
    !busy &&
    slipScan.state !== "reading";

  const verifyEndpoint = channel.donate.verifyEndpoint?.trim() ?? "";

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);

    /*
      ไม่มี QR ก็ส่งได้ตามปกติ แค่ติดป้ายไว้ว่าผู้จัดต้องตรวจด้วยตา
      ใบที่สร้างจากตรงนี้ยังไม่มีผลตรวจจากธนาคาร เพราะ Worker เป็นคนเติมให้
      ทีหลังพร้อมกับพลิกสถานะเป็น approved — ฝั่งเบราว์เซอร์เขียนเองไม่ได้

      ประกาศไว้นอก try เพราะตอนพลาดต้องรู้ให้ได้ว่าจองลายนิ้วมือไปแล้วหรือยัง
      ข้อความบอกคนโอนต่างกันคนละเรื่องเลย
    */
    let slipRef: string | null = null;
    let slipCheck: Donation["slipCheck"] = "none";

    try {
      await authStore.ensureSignedIn();
      /*
        อ่าน uid จาก Firebase ตรงๆ ไม่ผ่าน authStore
        เพราะ authStore อัปเดตผ่าน onAuthStateChanged ซึ่งอาจยังไม่ยิงกลับมา
        ในจังหวะที่ ensureSignedIn เพิ่ง resolve — จะได้ uid ว่างแล้วโดนกติกาปฏิเสธ
      */
      const uid = getAuthClient()?.currentUser?.uid ?? "";
      if (!uid) {
        setError("เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง");
        toast("เข้าสู่ระบบไม่สำเร็จ", "error");
        return;
      }

      if (slipScan.state === "ok") {
        setPhase("กำลังตรวจสลิป…");
        // จองลายนิ้วมือก่อนเสมอ — สลิปซ้ำต้องตกตั้งแต่ตรงนี้ ยังไม่มีใบเกิดขึ้น
        const claim = await claimSlipRef(slipScan.fingerprint, channel.id);
        if (claim === "duplicate") {
          setError(
            "สลิปใบนี้ถูกใช้ไปแล้ว — ถ้าโอนมาจริงให้ทักหาเจ้าของช่องโดยตรง",
          );
          toast("สลิปใบนี้ถูกใช้ไปแล้ว", "error");
          return;
        }
        // "unchecked" = ระบบยังตรวจซ้ำไม่ได้ ต้องปล่อยผ่านแล้วให้ผู้จัดดูเอง
        // ห้ามปฏิเสธ ไม่งั้นคนโอนจริงจะถูกกล่าวหาเพราะระบบตั้งค่าไม่ครบ
        if (claim === "fresh") {
          slipRef = slipScan.fingerprint;
          slipCheck = "unique";
        }
      }

      /*
        ต้องสร้างใบก่อนแล้วค่อยให้ Worker ตรวจ ไม่ใช่ตรวจก่อนสร้าง
        เพราะคนที่อนุมัติคือ Worker ไม่ใช่เบราว์เซอร์ — มันต้องมีใบให้แก้สถานะ
        (ถ้าให้เบราว์เซอร์เขียน approved เอง ใครก็แก้โค้ดหน้าเว็บแล้วอนุมัติ
         ให้ตัวเองได้โดยไม่ต้องโอนจริง)
      */
      setPhase("กำลังส่งใบ…");
      /*
        ลองซ้ำอีกครั้งถ้าพลาด ไม่ใช่เพื่อความชัวร์เฉยๆ

        ลายนิ้วมือสลิปถูกจองไปแล้วในขั้นบน และจองแล้วถอนคืนไม่ได้
        (กติกาปิด update/delete ไว้ ซึ่งเป็นเหตุผลเดียวกับที่มันกันสลิปซ้ำได้)
        ถ้าปล่อยให้ล้มตรงนี้ สลิปใบนั้นจะส่งไม่ได้อีกเลยตลอดกาล ทั้งที่โอนมาจริง
        เน็ตสะดุดวินาทีเดียวจึงไม่ควรแลกด้วยราคาเท่านั้น
      */
      const donationId = await retryOnce(() =>
        submitChannelDonation(channel.id, {
          kind: mode,
          name: name.trim(),
          amount: finalAmount,
          byUid: uid,
          message: message.trim() || undefined,
          slip: slip ?? undefined,
          tierId: tier?.id,
          tierName: tier?.name,
          months: mode === "member" ? months : undefined,
          tournamentId: tournamentId ?? undefined,
          slipRef,
          slipCheck,
        }),
      );

      if (slipScan.state === "ok" && verifyEndpoint) {
        setPhase("กำลังยืนยันกับธนาคาร…");
        // ผลจากตรงนี้ไม่ได้เอามาเขียนใบเอง Worker เป็นคนเขียนให้ถ้าผ่าน
        // เรารู้ผลไว้เฉยๆ เพื่อบอกคนโอนว่าตรวจผ่านแล้วหรือรอผู้จัดตรวจ
        const result = await verifySlipRemote(verifyEndpoint, slipScan.payload, {
          amount: finalAmount,
          account: promptPayId,
          channelId: channel.id,
          donationId,
        });
        // ตรวจผ่านและ Worker อนุมัติให้แล้ว = ขึ้นจอสตรีมทันที ไม่ต้องรอผู้จัด
        setAutoApproved(result.ok && result.approved === true);
      }

      setSent(true);
    } catch (err) {
      /*
        พลาดหลังจองลายนิ้วมือไปแล้ว = สลิปใบนี้ส่งซ้ำไม่ได้อีก
        บอกให้ตรงว่าต้องทำอะไรต่อ ดีกว่าปล่อยให้กด "ส่งใหม่" แล้วเจอ
        "สลิปใบนี้ถูกใช้ไปแล้ว" ซึ่งอ่านแล้วเหมือนถูกกล่าวหาว่าโกง
      */
      setError(
        slipRef
          ? "ส่งใบไม่สำเร็จ และสลิปใบนี้ถูกจองไว้แล้วจึงส่งซ้ำไม่ได้ — ทักหาเจ้าของช่องพร้อมสลิปได้เลย"
          : err instanceof Error
            ? err.message
            : "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง",
      );
    } finally {
      setBusy(false);
      setPhase(null);
    }
  };

  if (sent) {
    return (
      <>
        <GoldDust count={22} />
        <Panel
          variant="feature"
          accent="169 155 255"
          className="relative mx-auto max-w-lg p-9 text-center"
        >
          <Corners len={20} o={0.45} />
          <p className="slug">Thank you</p>
          <h2 className="mt-3 font-display text-3xl font-light">
            <span className="text-accent-grad">ส่งสลิปเรียบร้อย</span>
          </h2>
          <p className="num mt-4 font-display text-2xl text-iris">
            {formatMoney(finalAmount)}
          </p>
          {autoApproved ? (
            <>
              <p
                className="slug mt-4"
                style={{ color: "rgb(var(--st-win))" }}
              >
                ยืนยันสลิปแล้ว
              </p>
              <p className="mt-2 text-sm text-muted">
                ระบบตรวจสลิปกับธนาคารเรียบร้อย ชื่อของคุณขึ้นหน้าจอสตรีมแล้ว
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-muted">
              รอเจ้าของช่องกดยืนยัน พอยืนยันแล้วชื่อจะเด้งขึ้นหน้าจอสตรีมทันที
            </p>
          )}
          <div className="mt-7">
            <Button
              variant="ghost"
              onClick={() => {
                setSent(false);
                setAutoApproved(false);
                setSlip(null);
                // ล้างผลอ่าน QR ด้วย ไม่งั้นใบถัดไปจะพกลายนิ้วมือของสลิปเก่าที่จองไปแล้ว
                setSlipScan({ state: "none" });
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
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-iris/35 font-display text-xl text-iris">
              {channel.name.slice(0, 1) || "R"}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="slug">Support</p>
            <h2 className="mt-1 truncate font-display text-2xl font-light text-ice">
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
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-live/15 px-4 py-2 font-display text-xs text-live"
            >
              <motion.span
                className="h-1.5 w-1.5 rounded-full bg-live"
                animate={{ opacity: [1, 0.25, 1] }}
                transition={{ duration: 1.6, repeat: Infinity }}
              />
              LIVE
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
              className={`relative min-h-11 flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors sm:text-sm ${
                mode === m.key ? "text-onaccent" : "text-muted hover:text-ice"
              }`}
            >
              {mode === m.key && (
                <motion.span
                  layoutId="support-tab"
                  className="absolute inset-0 rounded-lg accent-fill"
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
          {/* ไส้ในของแท็บสลับพร้อมกับ pill ที่วิ่งอยู่ด้านบน */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              {mode === "member" ? (
                <div className="space-y-5">
                  <div>
                    <Label hint="เลือกแพ็กเกจที่ชอบ แล้วเลือกจำนวนเดือน">
                      เลือกแพ็กเกจ
                    </Label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {channel.member.tiers.map((t) => (
                        <TierCard
                          key={t.id}
                          tier={t}
                          active={tier?.id === t.id}
                          best={t.id === topTierId && channel.member.tiers.length > 1}
                          onSelect={() => setTier(t)}
                        />
                      ))}
                    </div>
                  </div>

                  {tier && (
                    <Panel className="p-6">
                      <Label>สมัครกี่เดือน</Label>
                      <div className="flex flex-wrap gap-2">
                        {MONTHS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMonths(m)}
                            className={`num min-h-11 cursor-pointer rounded-lg px-4 py-2 font-display text-sm transition-colors ${
                              months === m
                                ? "accent-fill"
                                : "tile text-muted hover:text-ice"
                            }`}
                          >
                            {m} เดือน
                          </button>
                        ))}
                      </div>

                      {/* ใบเสร็จย่อ — ให้เห็นยอดรวมก่อนถึงปุ่มส่ง */}
                      <div className="sunken hairline-top mt-5 rounded-xl p-4">
                        <p className="slug slug-2">Summary</p>
                        <div className="mt-3">
                          <ReceiptLine
                            label="ราคาต่อเดือน"
                            value={formatMoney(tier.pricePerMonth)}
                          />
                          <span className="rule my-2.5 block h-px" />
                          <ReceiptLine label="จำนวนเดือน" value={`${months} เดือน`} />
                          <span className="rule my-2.5 block h-px" />
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm text-ice/85">รวมทั้งหมด</span>
                            <AnimatePresence mode="wait" initial={false}>
                              <motion.span
                                key={finalAmount}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                className="num font-display text-2xl text-iris"
                              >
                                {formatMoney(finalAmount)}
                              </motion.span>
                            </AnimatePresence>
                          </div>
                        </div>
                      </div>
                    </Panel>
                  )}
                </div>
              ) : (
                <Panel className="p-6">
                  <Label>ยอดที่ต้องการสนับสนุน</Label>
                  <div className="flex flex-wrap gap-2">
                    {quick.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setAmount(q)}
                        className={`num min-h-11 cursor-pointer rounded-lg px-4 py-2 font-display text-sm transition-colors ${
                          amount === q
                            ? "accent-fill"
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
                    <p className="mt-3 rounded-xl tile px-4 py-3 text-xs text-iris">
                      ยอดนี้จะนับเป็นการสมทบทุนเงินรางวัลของทัวร์ที่คุณเปิดมา
                    </p>
                  )}
                </Panel>
              )}
            </motion.div>
          </AnimatePresence>

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
              <Label hint="ระบบย่อรูปให้อัตโนมัติ แล้วอ่าน QR บนสลิปให้ด้วย">
                แนบสลิปโอนเงิน
              </Label>
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
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg tile px-3 py-2 text-xs text-ice/80 transition-colors hover-tile">
                  เลือกรูปสลิป
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      // อ่าน QR จาก event handler ตรงนี้ ไม่ใช่ใน useEffect
                      setError(null);
                      setSlipScan({ state: "reading" });
                      try {
                        setSlip(await compressImage(file));
                      } catch {
                        setError("อ่านรูปไม่ได้ ลองรูปอื่น");
                        setSlipScan({ state: "none" });
                        return;
                      }
                      try {
                        // อ่าน QR จากไฟล์ต้นฉบับ ไม่ใช่รูปที่ย่อแล้ว ย่อไปลายจะแตกจนอ่านไม่ออก
                        const found = await inspectSlip(file);
                        setSlipScan(
                          found.state === "ok"
                            ? {
                                state: "ok",
                                payload: found.payload,
                                fingerprint: found.fingerprint,
                              }
                            : { state: "no-qr" },
                        );
                      } catch {
                        setSlipScan({ state: "no-qr" });
                      }
                    }}
                  />
                </label>
              </div>

              {/* สถานะการอ่าน QR — บอกล่วงหน้าว่าใบนี้จะตรวจอัตโนมัติได้ไหม */}
              <div className="mt-3 min-h-7">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={slipScan.state}
                    initial={{ opacity: 0, y: calm ? 0 : 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: calm ? 0 : -4 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {slipScan.state === "reading" && (
                      <span className="flex items-center gap-2.5">
                        <Skeleton className="h-4 w-4 rounded-md" />
                        <span className="text-xs text-muted">
                          กำลังอ่าน QR บนสลิป…
                        </span>
                      </span>
                    )}
                    {slipScan.state === "no-qr" && (
                      <Badge rgb="138 142 168">
                        อ่าน QR ไม่เจอ — ผู้จัดจะตรวจด้วยตา
                      </Badge>
                    )}
                    {slipScan.state === "ok" && (
                      <Badge rgb="52 227 176" tone="done">
                        อ่าน QR สลิปได้แล้ว
                      </Badge>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>

            {error && <p className="text-xs text-danger">{error}</p>}

            <Button
              size="lg"
              loading={busy}
              onClick={submit}
              disabled={!canSubmit}
              className="w-full"
            >
              {phase ??
                (finalAmount > 0 ? `ส่งสลิป ${formatMoney(finalAmount)}` : "ส่งสลิป")}
            </Button>
            <p className="text-xs text-muted">
              {verifyEndpoint
                ? "ระบบอ่าน QR บนสลิปเพื่อกันสลิปซ้ำและยืนยันยอดให้อัตโนมัติ เจ้าของช่องยังตรวจซ้ำอีกชั้นก่อนอนุมัติ"
                : "ระบบอ่าน QR บนสลิปเพื่อกันการส่งสลิปใบเดิมซ้ำ ส่วนยอดเงินเจ้าของช่องจะตรวจเองก่อนอนุมัติ"}
            </p>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel accent="169 155 255" className="relative p-6 text-center">
            <p className="slug">PromptPay</p>

            {!promptPayId ? (
              // ยังไม่ได้ตั้งเลข = ปัญหาของเจ้าของช่อง ไม่ใช่ของคนโอน ต้องบอกให้ตรง
              <div className="mt-4">
                <EmptyState
                  art={<ArtShield />}
                  title="ช่องนี้ยังไม่ได้ใส่เลขพร้อมเพย์"
                  description="โอนเองตามช่องทางที่เจ้าของแจ้งไว้ แล้วแนบสลิปมาได้เลย"
                />
              </div>
            ) : !qr ? (
              // มี payload แล้วแต่ยังวาด QR ไม่เสร็จ — โชว์โครงตารางให้เห็นรูปร่างปลายทาง
              <div
                className="mx-auto mt-4 grid w-56 grid-cols-8 gap-1 rounded-xl bg-white/5 p-3"
                aria-label="กำลังสร้าง QR"
              >
                {Array.from({ length: 64 }, (_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-sm" />
                ))}
              </div>
            ) : (
              <>
                <span className="relative mx-auto mt-4 block w-60 p-2">
                  <Corners len={20} o={0.5} />
                  <motion.img
                    key={qr}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    src={qr}
                    alt="QR พร้อมเพย์"
                    className="mx-auto w-52 rounded-lg bg-white p-2"
                  />
                </span>
                <p className="num mt-4 font-display text-2xl text-iris">
                  {finalAmount > 0 ? formatMoney(finalAmount) : "ระบุยอดเอง"}
                </p>
                <p className="mt-1.5 text-sm text-ice/85">
                  {channel.donate.displayName || channel.name}
                </p>
                <p className="num text-xs text-muted">
                  {formatPromptPayId(promptPayId)}
                </p>
              </>
            )}
          </Panel>

          {mode === "member" && channel.member.showMemberList && members.length > 0 && (
            <Panel className="p-6">
              <Panel.Header
                eyebrow="Members"
                title="สมาชิกปัจจุบัน"
                count={members.length}
              />
              <ul className="flex flex-wrap gap-2">
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

          {/* ขอเพลงย้ายไปหน้าของตัวเองแล้ว เหลือแค่ทางไป
              เอาฟอร์มมาต่อท้ายหน้าโอนเงินคนอ่านไม่ออกว่าตกลงหน้านี้ให้ทำอะไร */}
          {channel.songs?.enabled && (
            <Panel className="flex flex-wrap items-center gap-4 p-6">
              <div className="min-w-0 flex-1">
                <p className="slug">Song request</p>
                <p className="mt-1.5 font-display text-base text-ice">
                  อยากขอเพลงด้วยไหม
                </p>
                <p className="mt-1 text-sm text-muted">
                  วางลิงก์ YouTube แล้วส่งเข้าคิว ไม่ต้องโอนก็ขอได้
                </p>
              </div>
              <Link
                href={`/song/#h=${channel.handle || channel.id}`}
                className="hover-tile tile shrink-0 rounded-xl px-4 py-2.5 font-display text-xs text-ice/85 transition-colors hover:text-iris"
              >
                ไปหน้าขอเพลง →
              </Link>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function ReceiptLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted">{label}</span>
      <span className="num font-display text-sm text-ice">{value}</span>
    </div>
  );
}

/**
 * การ์ดแพ็กเกจสมาชิก — แถบสีของ tier พาดหัวการ์ด เหรียญกลม และสิทธิ์เป็นแถวติ๊กถูก
 * แพ็กเกจแพงสุดยกเป็นการ์ดตัวเอกพร้อมริบบิ้นมุมขวาบน
 */
function TierCard({
  tier,
  active,
  best,
  onSelect,
}: {
  tier: MemberTier;
  active: boolean;
  best: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="group block cursor-pointer text-left"
    >
      <Panel
        variant={best ? "feature" : "plain"}
        accent={tier.rgb}
        interactive={false}
        className="relative h-full overflow-hidden p-5 transition-transform duration-300 group-hover:-translate-y-0.5"
        style={{
          background: active ? `rgb(${tier.rgb} / 0.12)` : undefined,
          boxShadow: active ? `inset 0 0 0 1px rgb(${tier.rgb} / 0.55)` : undefined,
        }}
      >
        {/* แถบสีประจำ tier พาดเต็มความกว้างหัวการ์ด */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-0.75"
          style={{
            background: `linear-gradient(90deg, rgb(${tier.rgb}), rgb(${tier.rgb} / 0.2))`,
          }}
        />

        {best && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 h-24 w-24 overflow-hidden"
            style={{ clipPath: "polygon(100% 0, 100% 100%, 0 0)" }}
          >
            <span className="absolute top-4 -right-6 w-32 rotate-45 accent-fill py-1 text-center font-display text-eyebrow font-semibold tracking-luxe text-onaccent">
              คุ้มที่สุด
            </span>
          </span>
        )}

        <div className="flex items-start gap-3">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-display text-sm"
            style={{
              color: `rgb(${tier.rgb})`,
              background: `rgb(${tier.rgb} / 0.15)`,
              boxShadow: `inset 0 0 0 1px rgb(${tier.rgb} / 0.45)`,
            }}
            aria-hidden
          >
            {tier.badge || "★"}
          </span>

          <div className="min-w-0 flex-1">
            <p
              className="truncate font-display text-base"
              style={{ color: `rgb(${tier.rgb})` }}
            >
              {tier.name}
            </p>
            <p className="num mt-0.5 font-display text-lg text-ice">
              ฿{tier.pricePerMonth.toLocaleString("th-TH")}
              <span className="ml-0.5 text-xs text-muted">/เดือน</span>
            </p>
          </div>
        </div>

        {tier.perks.length > 0 && (
          <ul className="mt-3.5 space-y-1.5 border-t border-hair pt-3.5">
            {tier.perks.map((perk, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-muted">
                <span
                  className="mt-0.5 shrink-0"
                  style={{ color: `rgb(${tier.rgb})` }}
                  aria-hidden
                >
                  <IconCheck className="h-3 w-3" strokeWidth={2} />
                </span>
                <span className="min-w-0">{perk}</span>
              </li>
            ))}
          </ul>
        )}

        {active && (
          <p className="slug mt-3.5" style={{ color: `rgb(${tier.rgb})` }}>
            เลือกอยู่
          </p>
        )}
      </Panel>
    </button>
  );
}
