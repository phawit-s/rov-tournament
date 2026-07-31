"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import QRCode from "qrcode";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useAccess } from "@/hooks/useAdmin";
import { recordActivity } from "@/lib/activity";
import { recordAudit } from "@/lib/audit";
import { authStore } from "@/lib/backend/firebase";
import {
  setChannelDonationStatus,
  expiryFrom,
  watchChannelDonations,
  type ChannelDonation,
} from "@/lib/channel/donations";
import {
  channelStore,
  emptyChannel,
  markDonationAutoApproved,
  pushChannel,
  pushChannelAs,
  watchAllChannels,
} from "@/lib/channel/store";
import { normalizeHandle, type Channel } from "@/lib/channel/types";
import { compressImage } from "@/lib/image";
import { uid } from "@/lib/random";
import { safeImageSrc } from "@/lib/safe";
import { sfx } from "@/lib/sound";

import { formatMoney } from "@/lib/tournament/prize";
import { formatThaiDate } from "@/lib/tournament/share";
import type { MemberTier } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Figure, { FigureRow } from "../ui/Figure";
import Panel from "../ui/Panel";
import Reveal, { PageHeading } from "../ui/Reveal";
import AdminTeamPanel from "../auth/AdminTeamPanel";
import SongQueuePanel from "../song/SongQueuePanel";
import { toast } from "../ui/Toast";
import { IconCheck, IconCopy, IconExternal, IconMonitor } from "../ui/icons";
import {
  ArtShield,
  Badge,
  EmptyState,
  Input,
  Label,
  NumberInput,
  RegStatusBadge,
  Skeleton,
  Textarea,
} from "../tournament/ui";

const TIER_COLORS = ["221 175 100", "109 146 219", "160 121 216", "77 181 145"];

const DAY = 86_400_000;

/** อ้างอิงคงที่ ไม่งั้น effect ของ Figure จะ resubscribe ทุกเรนเดอร์ */
const money = (n: number) => formatMoney(Math.round(n));

type Tab = "all" | "pending" | "approved" | "rejected";

const TAB_LABEL: Record<Tab, string> = {
  all: "ทั้งหมด",
  pending: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
};

/** สีขีดข้างแถว = สถานะใบนั้น (ระบบเดียวกับทั้งเว็บ) */
const ROW_ST: Record<string, string> = {
  pending: "var(--st-next)",
  approved: "var(--st-win)",
  rejected: "var(--st-live)",
};

type SlipCheck = NonNullable<ChannelDonation["slipCheck"]>;

/**
 * ผลตรวจสลิปต่อใบ — สีเดียวกับระบบสถานะทั้งเว็บ
 * เขียวคือยืนยันกับธนาคารแล้ว แดงคือยอดไม่ตรง ทองคือยังไม่ได้ยืนยัน เทาคือระบบช่วยไม่ได้ ต้องดูเอง
 */
const SLIP_META: Record<
  SlipCheck,
  { label: string; rgb: string; hex: string; tone: "plain" | "done" }
> = {
  verified: { label: "ตรวจแล้ว ยอดตรง", rgb: "77 181 145", hex: "#4db591", tone: "done" },
  mismatch: { label: "ยอดไม่ตรง", rgb: "224 86 107", hex: "#e0566b", tone: "plain" },
  unique: {
    label: "สลิปใหม่ ยังไม่ยืนยัน",
    rgb: "221 175 100",
    hex: "#ddaf64",
    tone: "plain",
  },
  none: { label: "ไม่มี QR ตรวจด้วยตา", rgb: "146 151 172", hex: "#9297ac", tone: "plain" },
  failed: { label: "ตรวจไม่สำเร็จ", rgb: "146 151 172", hex: "#9297ac", tone: "plain" },
};

/** อ้างอิงคงที่ ไม่งั้น setChannels([]) ตอน error จะทำให้รีเรนเดอร์ไม่จบ */
const NO_CHANNELS: Channel[] = [];

/**
 * อนุมัติใบที่ระบบยืนยันแล้วให้อัตโนมัติ
 *
 * วางไว้นอกคอมโพเนนต์เพราะถูกเรียกจาก callback ของ onSnapshot
 * ถ้าอยู่ข้างในจะกลายเป็น dependency ของ effect แล้ว subscribe ใหม่ทุกเรนเดอร์
 * ลำดับสำคัญ: อนุมัติให้ผ่านก่อน แล้วค่อยติดธง ถ้าติดธงพลาดก็แค่ไม่มีป้าย ใบยังอนุมัติถูกต้อง
 */
async function autoApproveOne(channelId: string, d: ChannelDonation): Promise<void> {
  try {
    await setChannelDonationStatus(channelId, d.id, "approved", {
      expiresAt: d.kind === "member" && d.months ? expiryFrom(d.months) : undefined,
    });
    await markDonationAutoApproved(channelId, d.id);
    recordActivity(
      d.kind === "member" ? "member.approve" : "donation.approve",
      `${d.name} · ${formatMoney(d.amount)}`,
      { actor: "ระบบตรวจสลิป" },
    );
    void recordAudit("donation.approve", {
      id: d.id,
      name: d.name,
      detail: "อนุมัติอัตโนมัติ · สลิปยืนยันแล้ว",
    });
    toast(`อนุมัติอัตโนมัติ ${d.name} · สลิปยืนยันแล้ว`, "success");
  } catch {
    /* ยิงไม่ผ่านก็ปล่อยให้ผู้จัดกดเอง ไม่ต้องรบกวนด้วย toast แดง */
  }
}

type Stats = {
  total: number;
  last30: number;
  active: number;
  memberAll: number;
  pending: number;
  approvedCount: number;
  rejected: number;
};

const NO_STATS: Stats = {
  total: 0,
  last30: 0,
  active: 0,
  memberAll: 0,
  pending: 0,
  approvedCount: 0,
  rejected: 0,
};

/**
 * สรุปยอดจากใบที่มีอยู่ — เรียกตอนข้อมูลเปลี่ยนเท่านั้น ไม่ใช่ตอนเรนเดอร์
 * (Date.now ตอนเรนเดอร์ทำให้ผลลัพธ์ไม่คงที่ระหว่างรีเรนเดอร์)
 */
function computeStats(list: ChannelDonation[]): Stats {
  const now = Date.now();
  const approved = list.filter((d) => d.status === "approved");
  const memberAll = approved.filter((d) => d.kind === "member");
  return {
    total: approved.reduce((s, d) => s + (d.amount || 0), 0),
    last30: approved
      .filter((d) => now - new Date(d.createdAt).getTime() <= 30 * DAY)
      .reduce((s, d) => s + (d.amount || 0), 0),
    active: memberAll.filter(
      (d) => !d.expiresAt || new Date(d.expiresAt).getTime() > now,
    ).length,
    memberAll: memberAll.length,
    pending: list.filter((d) => d.status === "pending").length,
    approvedCount: approved.length,
    rejected: list.filter((d) => d.status === "rejected").length,
  };
}

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

  const access = useAccess();
  const reduced = useReducedMotion();
  const [donations, setDonations] = useState<ChannelDonation[]>([]);
  const [stats, setStats] = useState<Stats>(NO_STATS);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [working, setWorking] = useState<string | null>(null);
  // ใบที่เพิ่งอนุมัติ — วาบทองหนึ่งครั้งก่อนแถวจะย้ายกลุ่ม
  const [flash, setFlash] = useState<string[]>([]);

  /**
   * ผู้ดูแลระบบสลับไปแก้ช่องของคนอื่น — เก็บสำเนาแยกไว้ใน state
   * ไม่ยัดลง channelStore เพราะนั่นคือ localStorage ของช่องตัวเอง เดี๋ยวงานที่ค้างอยู่หาย
   * null = กำลังแก้ช่องตัวเองตามปกติ
   */
  const [remote, setRemote] = useState<{ id: string; draft: Channel } | null>(null);
  const [channels, setChannels] = useState<Channel[]>(NO_CHANNELS);

  /** ใบที่ยิงอนุมัติอัตโนมัติไปแล้ว — onSnapshot ยิงซ้ำได้เรื่อยๆ ต้องกันเอง */
  const autoDone = useRef<Set<string>>(new Set());

  const isAdmin = access === "verified";
  const channel = remote ? remote.draft : stored;
  const activeId = remote?.id ?? user?.uid ?? null;
  const autoApprove = !!channel?.donate.autoApprove;
  // แก้ช่องตัวเองได้เสมอ ช่องคนอื่นต้องเป็นผู้ดูแลที่ Firestore ยืนยันแล้ว
  const canManage = !!user && !!activeId && (activeId === user.uid || isAdmin);

  // ยังไม่มีช่องในเครื่อง = สร้างโครงว่างให้จากบัญชีที่ล็อกอิน
  useEffect(() => {
    if (!user || stored) return;
    channelStore.set(emptyChannel({ uid: user.uid, email: user.email }));
  }, [user, stored]);

  // รายชื่อช่องทั้งหมดสำหรับแถบสลับช่อง — คนทั่วไปไม่ต้องดึง
  useEffect(() => {
    if (!isAdmin) return;
    return watchAllChannels(setChannels, () => setChannels(NO_CHANNELS));
  }, [isAdmin]);

  /**
   * สรุปยอด + อนุมัติอัตโนมัติ ทำใน callback ตอนข้อมูลมาถึง ไม่ใช่ตอนเรนเดอร์
   * autoApprove กับ canManage อยู่ใน deps เลยไม่ต้องใช้ ref อ่านค่าล่าสุด
   * (สลับสวิตช์ทีก็แค่ subscribe ใหม่รอบเดียว ไม่ได้ถี่พอให้เสียดาย)
   */
  useEffect(() => {
    if (!activeId) return;
    return watchChannelDonations(activeId, (list) => {
      setDonations(list);
      setStats(computeStats(list));
      if (!autoApprove || !canManage) return;
      for (const d of list) {
        if (d.status !== "pending" || d.slipCheck !== "verified") continue;
        if (autoDone.current.has(d.id)) continue;
        autoDone.current.add(d.id);
        void autoApproveOne(activeId, d);
      }
    });
  }, [activeId, autoApprove, canManage]);

  if (!user) return null;
  if (!channel || !activeId) return null;

  const editingOther = !!remote;
  const otherName = channel.name || channel.handle || "ช่องนี้";

  const set = <K extends keyof Channel>(key: K, value: Channel[K]) => {
    if (remote) {
      setRemote((prev) =>
        prev
          ? {
              ...prev,
              draft: {
                ...prev.draft,
                ...({ [key]: value } as Partial<Channel>),
                updatedAt: new Date().toISOString(),
              },
            }
          : prev,
      );
      return;
    }
    channelStore.update({ [key]: value } as Partial<Channel>);
  };

  /** สลับช่องที่กำลังแก้ — ส่ง null = กลับมาช่องตัวเอง */
  const selectChannel = (next: Channel | null) => {
    if (next && next.id === user.uid) {
      setRemote(null);
    } else {
      setRemote(next ? { id: next.id, draft: next } : null);
    }
    // ใบของช่องเดิมต้องไม่ค้างอยู่ระหว่างรอ snapshot ชุดใหม่
    setDonations([]);
    setStats(NO_STATS);
    setTab("all");
  };

  const publish = async () => {
    if (!channel.handle) {
      toast("ตั้งชื่อช่อง (handle) ก่อนถึงจะเผยแพร่ได้", "error");
      return;
    }
    setBusy(true);
    try {
      // แก้ช่องคนอื่นห้ามทับ ownerEmail ของเจ้าของด้วยอีเมลผู้ดูแล
      if (remote) await pushChannelAs(channel, remote.id);
      else await pushChannel({ ...channel, ownerEmail: user.email ?? undefined });
      toast(editingOther ? `เผยแพร่ช่อง ${otherName} แล้ว` : "เผยแพร่ช่องแล้ว", "success");
      recordActivity("tournament.publish", `เผยแพร่ช่อง "${channel.name || channel.handle}"`, {
        actor: user.name,
      });
      void recordAudit("channel.publish", {
        id: activeId,
        name: channel.name || channel.handle,
      });
    } catch (err) {
      toast(err instanceof Error ? err.message : "เผยแพร่ไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
  };

  const approve = async (d: ChannelDonation) => {
    setWorking(d.id);
    try {
      await setChannelDonationStatus(activeId, d.id, "approved", {
        expiresAt:
          d.kind === "member" && d.months ? expiryFrom(d.months) : undefined,
      });
      recordActivity(
        d.kind === "member" ? "member.approve" : "donation.approve",
        `${d.name} · ${formatMoney(d.amount)}`,
        { actor: user.name },
      );
      void recordAudit("donation.approve", { id: d.id, name: d.name });
      toast(`อนุมัติ ${d.name} แล้ว · เด้งขึ้นจอ`, "success");
      if (!reduced) {
        setFlash((p) => [...p, d.id]);
        window.setTimeout(
          () => setFlash((p) => p.filter((x) => x !== d.id)),
          1200,
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ", "error");
    } finally {
      setWorking(null);
    }
  };

  const reject = async (d: ChannelDonation) => {
    setWorking(d.id);
    try {
      await setChannelDonationStatus(activeId, d.id, "rejected");
      recordActivity("donation.reject", `${d.name} · ${formatMoney(d.amount)}`, {
        actor: user.name,
      });
      void recordAudit("donation.reject", { id: d.id, name: d.name });
      toast(`ปฏิเสธ ${d.name} แล้ว`, "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ", "error");
    } finally {
      setWorking(null);
    }
  };

  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";
  const supportUrl = `${origin}/c/#h=${channel.handle || activeId}`;
  const alertUrl = `${origin}/widget/alert/#ch=${activeId}`;

  const COUNT: Record<Tab, number> = {
    all: donations.length,
    pending: stats.pending,
    approved: stats.approvedCount,
    rejected: stats.rejected,
  };

  // เรียงเป็นกลุ่มในลิสต์เดียว เพื่อให้ layout ของ motion ย้ายแถวข้ามกลุ่มได้ลื่น
  const order: Tab[] = tab === "all" ? ["pending", "approved", "rejected"] : [tab];
  const sections = order
    .map((key) => ({
      key,
      items: donations.filter((d) => d.status === key),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="space-y-6">
      {/* แถบสลับช่อง — เห็นเฉพาะผู้ดูแลที่ Firestore ยืนยันสิทธิ์แล้ว */}
      {isAdmin && (
        <ChannelSwitcher
          channels={channels}
          activeId={activeId}
          ownUid={user.uid}
          ownName={stored?.name || stored?.handle || user.name}
          ownAvatar={stored?.avatar}
          onSelect={selectChannel}
        />
      )}

      {editingOther && (
        <div
          className="tally flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl tile p-4"
          style={{ ["--st"]: "var(--st-next)" } as CSSProperties}
        >
          <span className="slug" style={{ color: "rgb(var(--st-next))" }}>
            โหมดผู้ดูแล
          </span>
          <p className="min-w-0 flex-1 text-sm text-ice/85">
            กำลังแก้ช่องของ <strong className="text-champagne">{otherName}</strong> —
            สิ่งที่แก้จะไม่ทับช่องของคุณ ต้องกด &ldquo;เผยแพร่ช่อง&rdquo; ถึงจะบันทึกขึ้นคลาวด์
          </p>
          <MiniBtn onClick={() => selectChannel(null)}>กลับไปช่องของคุณ</MiniBtn>
        </div>
      )}

      <PageHeading
        eyebrow="Channel"
        title={editingOther ? otherName : "ช่องของคุณ"}
        description="ตั้งพร้อมเพย์ แพ็กเกจสมาชิก และลิงก์สำหรับสตรีมที่เดียว ใช้ได้กับทุกทัวร์"
        meta={channel.handle ? `@${channel.handle}` : undefined}
        action={
          <Button onClick={publish} loading={busy}>
            เผยแพร่ช่อง
          </Button>
        }
      />

      {/* สรุปเงินของช่อง — คำนวณจากใบที่มีอยู่ ไม่ต้องยิง API เพิ่ม */}
      <Reveal>
        <Panel variant="feature" className="p-6 sm:p-7">
          <Panel.Header
            eyebrow="Ledger"
            title="ภาพรวมของช่อง"
            action={
              <span className="slug slug-2 hidden sm:block">
                {donations.length} ใบทั้งหมด
              </span>
            }
          />
          <FigureRow>
            <Figure
              value={stats.total}
              fmt={money}
              label="อนุมัติแล้วรวม"
              ratio={stats.total > 0 ? 1 : 0}
            />
            <Figure
              value={stats.pending}
              label="รอตรวจ"
              suffix="ใบ"
              tone="platinum"
              className="sm:pl-6"
              ratio={
                donations.length > 0 ? stats.pending / donations.length : 0
              }
            />
            <Figure
              value={stats.active}
              label="สมาชิกที่ยังใช้ได้"
              suffix="คน"
              tone="platinum"
              className="sm:pl-6"
              ratio={stats.memberAll > 0 ? stats.active / stats.memberAll : 0}
            />
            <Figure
              value={stats.last30}
              fmt={money}
              label="ยอด 30 วันล่าสุด"
              className="sm:pl-6"
              ratio={stats.total > 0 ? stats.last30 / stats.total : 0}
            />
          </FigureRow>
        </Panel>
      </Reveal>

      {/* ลิงก์ */}
      <Reveal index={1}>
        <Panel accent="109 146 219" className="p-6">
          <Panel.Header eyebrow="Links" title="ลิงก์ของช่อง" count={2} />
          <div className="space-y-2.5">
            <LinkRow kind="public" label="หน้าสนับสนุน" url={supportUrl} />
            <LinkRow kind="obs" label="Widget แจ้งเตือน" url={alertUrl} />
          </div>
          <p className="mt-4 text-xs text-muted">
            ลิงก์ widget ใช้ได้ตลอด ไม่ต้องเปลี่ยนทุกครั้งที่จัดทัวร์ใหม่
            แก้อะไรในหน้านี้แล้วอย่าลืมกด &ldquo;เผยแพร่ช่อง&rdquo;
          </p>
        </Panel>
      </Reveal>

      {/* โปรไฟล์ */}
      <Reveal index={2}>
        <Panel className="p-6">
          <Panel.Header eyebrow="Profile" title="โปรไฟล์" />

          <div className="grid gap-5 lg:grid-cols-2">
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
                  placeholder="ช่องจัดแข่งของเรา"
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
                <label className="mt-2.5 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ice/85">
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
      <Reveal index={3}>
        <Panel className="p-6">
          <Panel.Header
            eyebrow="Donations"
            title="รับโดเนท"
            action={
              <Switch
                label="รับโดเนท"
                checked={channel.donate.enabled}
                onChange={(v) => set("donate", { ...channel.donate, enabled: v })}
              />
            }
          />

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

          <div className="mt-4">
            <Label>ข้อความบนหน้าสนับสนุน</Label>
            <Textarea
              rows={2}
              value={channel.donate.note ?? ""}
              onChange={(e) => set("donate", { ...channel.donate, note: e.target.value })}
            />
          </div>
        </Panel>
      </Reveal>

      {/* ตรวจสลิป */}
      <Reveal index={4}>
        <Panel accent="77 181 145" className="p-6">
          <Panel.Header
            eyebrow="Verify"
            title="ตรวจสลิปอัตโนมัติ"
            action={
              <Switch
                label="อนุมัติอัตโนมัติเมื่อยืนยันผ่าน"
                checked={!!channel.donate.autoApprove}
                onChange={(v) => set("donate", { ...channel.donate, autoApprove: v })}
              />
            }
          />

          <div>
            <Label hint="ลิงก์ Worker ที่คุณ deploy เอง คีย์ของผู้ให้บริการอยู่ในนั้น ไม่ได้อยู่ในหน้าเว็บ">
              ลิงก์ตัวกลางตรวจสลิป
            </Label>
            <Input
              value={channel.donate.verifyEndpoint ?? ""}
              onChange={(e) =>
                set("donate", { ...channel.donate, verifyEndpoint: e.target.value.trim() })
              }
              placeholder="https://slip-check.your-worker.workers.dev"
            />
          </div>

          <p className="mt-3 text-xs text-muted">
            เว้นว่างไว้ก็ใช้งานได้ทันที ไม่ต้องตั้งอะไรเลย —
            ระบบจะอ่าน QR บนสลิปแล้วตรวจให้แค่ว่าเป็นสลิปใบที่เคยส่งมาแล้วหรือเปล่า
            ใส่ลิงก์เมื่อไหร่ถึงจะยืนยันกับธนาคารได้ว่าเงินเข้าจริงและยอดตรง
          </p>

          {channel.donate.autoApprove && !channel.donate.verifyEndpoint && (
            <p
              className="mt-2 text-xs"
              style={{ color: "rgb(var(--st-next))" }}
            >
              เปิดอนุมัติอัตโนมัติไว้แต่ยังไม่มีลิงก์ตัวกลาง
              ใบจะไม่ถูกอนุมัติเองเพราะยังไม่มีอะไรยืนยันยอดให้
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-1.5">
            {(["verified", "mismatch", "unique", "none", "failed"] as SlipCheck[]).map(
              (k) => (
                <Badge key={k} rgb={SLIP_META[k].rgb} hex={SLIP_META[k].hex}>
                  {SLIP_META[k].label}
                </Badge>
              ),
            )}
          </div>
        </Panel>
      </Reveal>

      {/* สมาชิก */}
      <Reveal index={5}>
        <Panel className="p-6">
          <Panel.Header
            eyebrow="Membership"
            title="แพ็กเกจสมาชิก"
            count={channel.member.tiers.length}
            action={
              <Switch
                label="เปิดรับสมาชิก"
                checked={channel.member.enabled}
                onChange={(v) => set("member", { ...channel.member, enabled: v })}
              />
            }
          />

          <div className="space-y-3">
            {channel.member.tiers.map((tier, index) => (
              <div
                key={tier.id}
                className="tally relative overflow-hidden rounded-xl tile p-4"
                style={{ ["--st"]: tier.rgb } as CSSProperties}
              >
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
            className="mt-4 cursor-pointer rounded-lg tile px-3 py-2 text-xs text-muted transition-colors hover:text-champagne"
          >
            + เพิ่มแพ็กเกจ
          </button>
        </Panel>
      </Reveal>

      {/* กล่องสลิป */}
      <Reveal index={6}>
        <Panel className="p-6">
          <Panel.Header
            eyebrow="Inbox"
            title="สลิปที่ส่งเข้ามา"
            count={donations.length}
            action={
              stats.pending > 0 ? (
                <span
                  className="slug"
                  style={{ color: "rgb(var(--st-next))" }}
                >
                  {stats.pending} รอตรวจ
                </span>
              ) : undefined
            }
          />

          {donations.length === 0 ? (
            <EmptyState
              no="05"
              art={<ArtShield />}
              title="ยังไม่มีใครส่งสลิป"
              description="แชร์ลิงก์หน้าสนับสนุนด้านบนให้คนดู พอมีคนส่งสลิปเข้ามา ใบจะโผล่ตรงนี้ให้กดอนุมัติ"
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-1 rounded-xl tile p-1">
                {(["all", "pending", "approved", "rejected"] as Tab[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`relative min-h-11 flex-1 cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs transition-colors ${
                      tab === k ? "text-[#1b1509]" : "text-muted hover:text-ice"
                    }`}
                  >
                    {tab === k && (
                      <motion.span
                        layoutId="donation-tab"
                        className="absolute inset-0 rounded-lg bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)]"
                        transition={{ type: "spring", stiffness: 340, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">
                      {TAB_LABEL[k]}
                      <span className="num ml-1 opacity-70">({COUNT[k]})</span>
                    </span>
                  </button>
                ))}
              </div>

              {sections.length === 0 ? (
                <EmptyState
                  title={`ไม่มีใบที่ ${TAB_LABEL[tab]}`}
                  description="ลองเลือกแท็บอื่นดู"
                />
              ) : (
                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {sections.flatMap((sec) => [
                      <motion.li
                        key={`head-${sec.key}`}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-3 pt-1"
                      >
                        <RegStatusBadge status={sec.key} />
                        <span className="rule h-px flex-1" />
                        <span className="num text-xs text-muted">
                          {sec.items.length}
                        </span>
                      </motion.li>,
                      ...sec.items.map((d) => (
                        <motion.li
                          key={d.id}
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.97 }}
                          style={
                            { ["--st"]: ROW_ST[d.status] ?? "var(--st-idle)" } as CSSProperties
                          }
                          className={`tally relative flex flex-wrap items-start gap-4 overflow-hidden rounded-xl tile p-4 ${
                            d.status === "rejected" ? "state-out" : ""
                          }`}
                        >
                          {flash.includes(d.id) && (
                            <motion.span
                              aria-hidden
                              className="pointer-events-none absolute inset-0"
                              initial={{ opacity: 0.65 }}
                              animate={{ opacity: 0 }}
                              transition={{ duration: 1.1, ease: "easeOut" }}
                              style={{
                                background:
                                  "radial-gradient(130% 100% at 0% 50%, rgb(var(--st-win)/.4), transparent 72%)",
                              }}
                            />
                          )}

                          {d.slip && (
                            <a
                              href={safeImageSrc(d.slip) ?? undefined}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="relative shrink-0"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={safeImageSrc(d.slip) ?? ""}
                                alt="สลิป"
                                className="h-24 w-20 rounded-lg object-cover"
                              />
                            </a>
                          )}

                          <div className="relative min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <p className="min-w-0 text-sm text-ice">
                                {d.name}
                                <span className="num ml-2 font-display text-champagne">
                                  {formatMoney(d.amount)}
                                </span>
                                {d.kind === "member" && (
                                  <span className="num ml-2 text-xs text-muted">
                                    สมาชิก {d.tierName} · {d.months} เดือน
                                  </span>
                                )}
                              </p>
                              <RegStatusBadge status={d.status} />
                            </div>

                            {d.message && (
                              <p className="mt-1 text-xs text-muted">“{d.message}”</p>
                            )}
                            <p className="num mt-1 text-xs text-muted/80">
                              {formatThaiDate(d.createdAt)}
                              {d.tournamentName && ` · สมทบทุน ${d.tournamentName}`}
                              {d.slipBank && ` · ${d.slipBank}`}
                            </p>

                            {(d.slipCheck || d.autoApproved) && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <SlipBadge
                                  check={d.slipCheck}
                                  amount={d.slipAmount}
                                />
                                {d.autoApproved && (
                                  <Badge rgb="109 146 219" hex="#6d92db" tone="done">
                                    อนุมัติอัตโนมัติ
                                  </Badge>
                                )}
                              </div>
                            )}

                            {d.status === "pending" && (
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  loading={working === d.id}
                                  icon={<IconCheck className="h-3.5 w-3.5" />}
                                  onClick={() => void approve(d)}
                                >
                                  อนุมัติ · เด้งขึ้นจอ
                                </Button>
                                <MiniBtn
                                  danger
                                  disabled={working === d.id}
                                  onClick={() => void reject(d)}
                                >
                                  ปฏิเสธ
                                </MiniBtn>
                              </div>
                            )}
                          </div>
                        </motion.li>
                      )),
                    ])}
                  </AnimatePresence>
                </ul>
              )}
            </>
          )}
        </Panel>
      </Reveal>

      {/* รายชื่อผู้ดูแลระบบ — โผล่เฉพาะบัญชีที่ Firestore ยืนยันสิทธิ์แล้ว */}
      <Reveal>
        <AdminTeamPanel />
      </Reveal>

      {/* ระบบขอเพลง — ตั้งค่าแล้วต้องกด "เผยแพร่ช่อง" เหมือนค่าอื่น ส่วนคิวเขียนทันที */}
      <Reveal>
        <SongQueuePanel
          channelId={activeId ?? ""}
          channel={channel}
          onConfigChange={(songs) => set("songs", songs)}
        />
      </Reveal>
    </div>
  );

  // ผ่าน set() เสมอ ไม่งั้นตอนผู้ดูแลแก้ช่องคนอื่นจะไปเขียนทับช่องตัวเองในเครื่อง
  function updateTier(index: number, value: Partial<MemberTier>) {
    if (!channel) return;
    set("member", {
      ...channel.member,
      tiers: channel.member.tiers.map((t, i) =>
        i === index ? { ...t, ...value } : t,
      ),
    });
  }
}

/** ป้ายผลตรวจสลิป — ยอดไม่ตรงต้องบอกด้วยว่าอ่านได้เท่าไหร่ ผู้จัดจะได้ตัดสินใจเองได้ */
function SlipBadge({
  check,
  amount,
}: {
  check?: SlipCheck;
  amount?: number | null;
}) {
  if (!check) return null;
  const meta = SLIP_META[check];
  return (
    <Badge rgb={meta.rgb} hex={meta.hex} tone={meta.tone}>
      {meta.label}
      {check === "mismatch" && typeof amount === "number" && (
        <span className="num opacity-80">· สลิป {formatMoney(amount)}</span>
      )}
    </Badge>
  );
}

/**
 * แถบสลับช่องของผู้ดูแลระบบ
 *
 * ช่องตัวเองอยู่หัวแถวเสมอ แม้ยังไม่เคยเผยแพร่ขึ้นคลาวด์ (จะยังไม่มีใน channels)
 * แถวเลื่อนแนวนอนแทน dropdown เพราะบนมือถือกดง่ายกว่าและเห็นรูปช่องไปด้วย
 */
function ChannelSwitcher({
  channels,
  activeId,
  ownUid,
  ownName,
  ownAvatar,
  onSelect,
}: {
  channels: Channel[];
  activeId: string;
  ownUid: string;
  ownName: string;
  ownAvatar?: string;
  onSelect: (c: Channel | null) => void;
}) {
  const own = channels.find((c) => c.id === ownUid);
  const others = channels.filter((c) => c.id !== ownUid);

  return (
    <Panel variant="quiet" className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="slug slug-2">Admin · สลับช่อง</span>
        <span className="num text-eyebrow text-muted">{others.length + 1} ช่อง</span>
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        <ChannelChip
          name={own?.name || ownName}
          handle={own?.handle}
          avatar={own?.avatar ?? ownAvatar}
          mine
          active={activeId === ownUid}
          onClick={() => onSelect(null)}
        />
        {others.map((c) => (
          <ChannelChip
            key={c.id}
            name={c.name || c.handle || c.id.slice(0, 6)}
            handle={c.handle}
            avatar={c.avatar}
            active={activeId === c.id}
            onClick={() => onSelect(c)}
          />
        ))}
      </div>

      {others.length === 0 && (
        <p className="mt-2 text-xs text-muted">
          ยังไม่มีช่องอื่นบนคลาวด์ — ช่องจะโผล่ที่นี่หลังเจ้าของกดเผยแพร่ครั้งแรก
        </p>
      )}
    </Panel>
  );
}

function ChannelChip({
  name,
  handle,
  avatar,
  mine,
  active,
  onClick,
}: {
  name: string;
  handle?: string;
  avatar?: string;
  mine?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
        active
          ? "border-champagne/45 bg-[rgb(221_175_100/0.12)]"
          : "border-hair hover-tile"
      }`}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeImageSrc(avatar) ?? ""}
          alt=""
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full tile font-display text-eyebrow text-muted">
          {(name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}

      <span className="min-w-0">
        <span
          className={`block max-w-40 truncate text-sm ${
            active ? "text-champagne" : "text-ice/85"
          }`}
        >
          {name || "ยังไม่ตั้งชื่อ"}
        </span>
        <span className="num block text-eyebrow text-muted">
          {handle ? `@${handle}` : "ยังไม่ตั้ง handle"}
        </span>
      </span>

      {mine && (
        <span className="shrink-0 rounded-full bg-[rgb(77_181_145/0.14)] px-2 py-0.5 font-display text-eyebrow text-[#4db591]">
          ช่องของคุณ
        </span>
      )}
    </button>
  );
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
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg tile px-3 py-2 text-xs text-ice/80 transition-colors hover-tile">
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

/**
 * QR ของลิงก์สาธารณะ — ทำเป็น hook เพราะ toDataURL เป็น async
 * setState อยู่ใน .then() ไม่ใช่ในตัว effect
 */
function useQr(text: string | null): string | null {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!text || map[text]) return;
    let alive = true;
    QRCode.toDataURL(text, {
      margin: 1,
      width: 180,
      color: { dark: "#12100b", light: "#ffffff" },
    })
      .then((url) => alive && setMap((p) => ({ ...p, [text]: url })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [text, map]);

  return text ? (map[text] ?? null) : null;
}

function LinkRow({
  label,
  url,
  kind,
}: {
  label: string;
  url: string;
  kind: "public" | "obs";
}) {
  const [copied, setCopied] = useState(false);
  const qr = useQr(kind === "public" ? url : null);

  return (
    <div className="flex items-start gap-3.5 rounded-xl tile p-3.5">
      {kind === "public" && (
        <span className="relative grid h-18 w-18 shrink-0 place-items-center overflow-hidden rounded-lg bg-white p-1">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR หน้าสนับสนุน" className="h-full w-full" />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="slug">{label}</span>
          {kind === "obs" && (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(109_146_219/0.14)] px-2 py-0.5 font-display text-eyebrow text-[#6d92db]">
                <IconMonitor className="h-3 w-3" />
                Browser Source
              </span>
              <span className="num text-eyebrow text-muted">แนะนำ 1280 × 720</span>
            </>
          )}
        </div>

        <code className="mt-1.5 block truncate text-xs text-ice/75">{url}</code>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <MiniBtn
            onClick={() => {
              void navigator.clipboard.writeText(url);
              setCopied(true);
              toast("คัดลอกลิงก์แล้ว", "success", 1600);
              window.setTimeout(() => setCopied(false), 1600);
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              {copied ? (
                <IconCheck className="h-3 w-3" strokeWidth={2} />
              ) : (
                <IconCopy className="h-3 w-3" />
              )}
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </span>
          </MiniBtn>

          {kind === "public" && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-hair px-2.5 py-1.5 text-xs text-muted transition-colors hover:text-champagne"
            >
              <IconExternal className="h-3 w-3" />
              เปิด
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniBtn({
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
      className={`shrink-0 cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "border-[#e79a9a]/25 text-[#e79a9a]/90 hover:bg-[#e79a9a]/10"
          : "border-hair text-muted hover:text-champagne"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * สวิตช์ที่บอกสถานะเป็นตัวหนังสือในราง — สีอย่างเดียวอ่านยากบนธีมสว่าง
 * กล่องคลิกสูง 44px ตามขนาดนิ้วขั้นต่ำ
 */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        sfx.unlock();
        sfx.play("click");
        onChange(!checked);
      }}
      className="relative grid h-11 w-21 shrink-0 cursor-pointer place-items-center"
      aria-pressed={checked}
      aria-label={label}
    >
      <span
        className={`relative block h-7 w-full rounded-full transition-colors duration-300 ${
          checked ? "bg-[linear-gradient(90deg,#bd9350,#f0d8ab)]" : "rule"
        }`}
      >
        <span
          className={`pointer-events-none absolute inset-y-0 flex items-center font-display text-eyebrow tracking-luxe ${
            checked ? "left-3 text-[#1b1509]" : "right-3 text-muted"
          }`}
        >
          {checked ? "เปิด" : "ปิด"}
        </span>
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
          className="absolute top-1 h-5 w-5 rounded-full bg-white shadow"
          style={{ left: checked ? 60 : 4 }}
        />
      </span>
    </button>
  );
}
