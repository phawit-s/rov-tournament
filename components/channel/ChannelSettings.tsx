"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useHashParam } from "@/hooks/useClient";
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
  createChannel,
  decideChannelSeed,
  emptyChannel,
  markDonationAutoApproved,
  pushChannel,
  pushChannelAs,
  watchAllChannels,
  watchChannel,
} from "@/lib/channel/store";
import { normalizeHandle, type Channel } from "@/lib/channel/types";

/**
 * ของในหน้ากับสำเนาบนคลาวด์ตรงกันไหม
 *
 * ต้องเทียบทางเดียว — ไล่จากคีย์ของ "ในหน้า" ไปหาคลาวด์เท่านั้น
 * เพราะตอนเผยแพร่ pushChannelAs ใส่ isPublic กับ syncedAt เพิ่มให้เอง
 * และ setDoc ใช้ merge ของเก่าที่ถูกลบไปแล้วก็ยังค้างอยู่บนคลาวด์
 * ถ้าเทียบสองทางจะไม่มีวันตรงกัน แถบ "ยังไม่ได้เผยแพร่" ก็จะค้างตลอดเวลา
 *
 * ข้าม updatedAt/createdAt เพราะ updatedAt ขยับทุกครั้งที่พิมพ์ตัวอักษรเดียว
 */
function matchesCloud(local: unknown, cloud: unknown): boolean {
  if (Array.isArray(local)) {
    return (
      Array.isArray(cloud) &&
      local.length === cloud.length &&
      local.every((v, i) => matchesCloud(v, cloud[i]))
    );
  }
  if (local && typeof local === "object") {
    if (!cloud || typeof cloud !== "object" || Array.isArray(cloud)) return false;
    return Object.entries(local as Record<string, unknown>).every(([key, value]) => {
      if (key === "updatedAt" || key === "createdAt") return true;
      const other = (cloud as Record<string, unknown>)[key];
      // undefined กับ null ถือว่าเท่ากัน ฝั่งคลาวด์เก็บ null ฝั่งหน้าเว็บเป็น undefined
      if (value === undefined || value === null) return other === undefined || other === null;
      return matchesCloud(value, other);
    });
  }
  return local === cloud;
}
import { uid } from "@/lib/random";
import { safeImageSrc } from "@/lib/safe";

import { formatMoney } from "@/lib/tournament/prize";
import { formatThaiDate } from "@/lib/tournament/share";
import type { MemberTier } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Figure, { FigureRow } from "../ui/Figure";
import ImagePicker from "../ui/ImagePicker";
import LinkRow from "../ui/LinkRow";
import MiniBtn from "../ui/MiniBtn";
import Panel from "../ui/Panel";
import Reveal, { PageHeading } from "../ui/Reveal";
import Switch from "../ui/Switch";
import Tabs, { StickyTabs } from "../ui/Tabs";
import AdminTeamPanel from "../auth/AdminTeamPanel";
import SongQueuePanel from "../song/SongQueuePanel";
import { toast } from "../ui/Toast";
import { IconCheck } from "../ui/icons";
import {
  ArtShield,
  Badge,
  EmptyState,
  Input,
  Label,
  NumberInput,
  RegStatusBadge,
  Textarea,
} from "../tournament/ui";

const TIER_COLORS = ["169 155 255", "110 155 240", "196 130 255", "52 227 176"];

const DAY = 86_400_000;

/** อ้างอิงคงที่ ไม่งั้น effect ของ Figure จะ resubscribe ทุกเรนเดอร์ */
const money = (n: number) => formatMoney(Math.round(n));

/**
 * ส่วนของหน้าช่อง — แบ่งตาม "งานที่เข้ามาทำ" ไม่ใช่ตามชนิดข้อมูล
 *
 * ของเดิมเป็นหน้าเดียวยาวสิบกว่าจอ เอาของที่แก้ปีละครั้ง (พร้อมเพย์ แพ็กเกจ
 * ลิงก์ Worker) วางปนกับของที่ต้องกดทุกวันตอนไลฟ์ (อนุมัติสลิป คิวเพลง)
 * ผลคือใบที่รอตรวจอยู่ลึกลงไปเจ็ดการ์ด ต้องเลื่อนผ่านฟอร์มทั้งชุดทุกครั้ง
 *
 * ชื่อส่วนอยู่ใน #tab= จึงบุ๊กมาร์กหน้าที่ใช้ทุกวันได้ตรงๆ
 * และปุ่มย้อนกลับของเบราว์เซอร์พาไปส่วนก่อนหน้าตามที่คนคาด
 */
type Section = "home" | "inbox" | "settings" | "songs" | "team";

const SECTIONS: { key: Section; label: string; admin?: boolean }[] = [
  { key: "home", label: "ภาพรวม" },
  { key: "inbox", label: "สลิป" },
  { key: "settings", label: "ตั้งค่าช่อง" },
  { key: "songs", label: "ขอเพลง" },
  { key: "team", label: "ผู้ดูแล", admin: true },
];

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
  verified: { label: "ตรวจแล้ว ยอดตรง", rgb: "52 227 176", hex: "var(--color-win)", tone: "done" },
  mismatch: { label: "ยอดไม่ตรง", rgb: "255 91 122", hex: "var(--color-live)", tone: "plain" },
  unique: {
    label: "สลิปใหม่ ยังไม่ยืนยัน",
    rgb: "169 155 255",
    hex: "var(--color-iris)",
    tone: "plain",
  },
  none: { label: "ไม่มี QR ตรวจด้วยตา", rgb: "126 130 153", hex: "var(--color-out)", tone: "plain" },
  failed: { label: "ตรวจไม่สำเร็จ", rgb: "126 130 153", hex: "var(--color-out)", tone: "plain" },
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

  /**
   * สำเนาที่อยู่บนคลาวด์จริง ใช้ทั้งเทียบว่ามีอะไรค้างยังไม่ได้เผยแพร่
   * และใช้เป็นต้นทางตอนเครื่องนี้ยังไม่มีสำเนาในเครื่อง
   *
   * เก็บ id ของช่องคู่กับข้อมูลเสมอ เพราะผู้ดูแลสลับช่องได้
   * ถ้าเก็บแต่ข้อมูลเปล่าๆ จะแยกไม่ออกว่า "ยังโหลดไม่เสร็จ" กับ "ช่องนี้ไม่มีบนคลาวด์"
   */
  const [liveSnap, setLiveSnap] = useState<{ id: string; data: Channel | null } | null>(
    null,
  );

  /* ส่วนที่เปิดอยู่เก็บใน URL ไม่ใช่ใน state — รีเฟรชแล้วยังอยู่ที่เดิม
     และแปะลิงก์ตรงเข้าหน้าสลิปให้คนที่ช่วยดูแลได้ */
  const hashTab = useHashParam("tab");
  const section: Section = SECTIONS.some((s) => s.key === hashTab)
    ? (hashTab as Section)
    : "home";
  const goSection = (key: Section) => {
    window.location.hash = `tab=${key}`;
  };

  const isAdmin = access === "verified";
  const channel = remote ? remote.draft : stored;
  const activeId = remote?.id ?? user?.uid ?? null;
  const liveLoaded = !!activeId && liveSnap?.id === activeId;
  const live = liveLoaded ? (liveSnap?.data ?? null) : null;
  const autoApprove = !!channel?.donate.autoApprove;
  /* แก้ช่องของตัวเองได้เสมอ ช่องคนอื่นต้องเป็นผู้ดูแลที่ Firestore ยืนยันแล้ว
     ดูจาก ownerUid ของช่อง ไม่ใช่จากชื่อเอกสาร เพราะช่องที่สองเป็นต้นไป
     ชื่อเอกสารเป็นรหัสสุ่ม ไม่ได้เท่ากับ uid ของเจ้าของแล้ว */
  const canManage =
    !!user && !!channel && (channel.ownerUid === user.uid || isAdmin);

  /*
    ยังไม่มีสำเนาในเครื่อง — ต้องดึงของจริงจากคลาวด์มาก่อน ห้ามสร้างโครงว่างทันที

    ของเดิมสร้างโครงว่างเลยโดยไม่ถามคลาวด์ พอเปิดหน้านี้ในเครื่องใหม่
    หรือหลังล้างข้อมูลเบราว์เซอร์ หน้าจะขึ้นช่องเปล่าที่ยังไม่มี handle ทั้งที่
    บนคลาวด์มีช่องที่ตั้งค่าไว้ครบแล้ว — แล้วถ้าเผลอกด "เผยแพร่ช่อง" ตอนนั้น
    ช่องจริงจะโดนทับด้วยของเปล่าทั้งใบ ทั้งพร้อมเพย์ แพ็กเกจ และเพลย์ลิสต์สำรอง

    รอจนรู้ผลจากคลาวด์ก่อน (liveLoaded) ค่อยตัดสินใจ
    และทำเฉพาะช่องของตัวเอง ช่องที่ผู้ดูแลสลับไปดูใช้สำเนาแยกของมันเอง
  */
  useEffect(() => {
    const choice = decideChannelSeed({
      hasUser: !!user,
      hasLocal: !!stored,
      editingOther: !!remote,
      cloudLoaded: liveLoaded,
      cloudExists: !!live,
    });
    if (choice === "use-cloud" && live) channelStore.set(live);
    else if (choice === "create-empty" && user) {
      channelStore.set(emptyChannel({ uid: user.uid, email: user.email }));
    }
  }, [user, stored, remote, liveLoaded, live]);

  // รายชื่อช่องทั้งหมดสำหรับแถบสลับช่อง — คนทั่วไปไม่ต้องดึง
  useEffect(() => {
    if (!isAdmin) return;
    return watchAllChannels(setChannels, () => setChannels(NO_CHANNELS));
  }, [isAdmin]);

  // ฟังสำเนาบนคลาวด์ไว้เทียบ จะได้รู้ว่ามีอะไรค้างยังไม่ได้เผยแพร่
  useEffect(() => {
    if (!activeId) return;
    return watchChannel(
      activeId,
      (c) => setLiveSnap({ id: activeId, data: c }),
      () => setLiveSnap({ id: activeId, data: null }),
    );
  }, [activeId]);

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

  /*
    มีอะไรแก้ค้างไว้ไหม — เทียบของในหน้ากับสำเนาบนคลาวด์
    หน้านี้ยาวมาก ปุ่มเผยแพร่อยู่บนสุดที่เดียว คนแก้ค่าท้ายหน้าแล้วปิดไปเลยก็มี
    รู้ว่าค้างเมื่อไหร่ถึงจะเด้งแถบบันทึกขึ้นมาเตือนตรงที่มือกำลังทำงานอยู่ได้
  */
  const neverPublished = !live;
  const dirty = !live || !matchesCloud(channel, live);

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

  /**
   * สลับช่องที่กำลังแก้ — ส่ง null = กลับมาช่องแรกของตัวเอง
   *
   * ช่องแรกของแต่ละคนใช้ uid เป็นชื่อเอกสาร และมีสำเนาอยู่ใน localStorage
   * ช่องที่สร้างทีหลังมีรหัสของตัวเอง จึงแก้ผ่านสำเนาชั่วคราวใน state แทน
   */
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

  /** เปิดช่องใหม่ให้ตัวเอง แล้วสลับไปแก้ช่องนั้นเลย */
  const addChannel = async () => {
    setBusy(true);
    try {
      const made = await createChannel(
        { uid: user.uid, email: user.email },
        `ช่องใหม่ ${channels.length + 1}`,
      );
      selectChannel(made);
      toast("เปิดช่องใหม่แล้ว — ตั้งชื่อช่อง (handle) ก่อนถึงจะเผยแพร่ได้", "success");
      void recordAudit("channel.publish", { id: made.id, name: made.name, detail: "เปิดช่องใหม่" });
    } catch {
      toast("เปิดช่องใหม่ไม่สำเร็จ", "error");
    } finally {
      setBusy(false);
    }
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
    /* เว้นที่ท้ายหน้าไว้ให้แถบบันทึกลอย ไม่ให้มันทับเนื้อหาบรรทัดสุดท้าย */
    <div className="space-y-6 pb-28">
      {/* แถบสลับช่อง — เห็นเฉพาะผู้ดูแลที่ Firestore ยืนยันสิทธิ์แล้ว */}
      {isAdmin && (
        <ChannelSwitcher
          channels={channels}
          activeId={activeId}
          ownUid={user.uid}
          ownName={stored?.name || stored?.handle || user.name}
          ownAvatar={stored?.avatar}
          onSelect={selectChannel}
          onCreate={() => void addChannel()}
          busy={busy}
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
            กำลังแก้ช่องของ <strong className="text-iris">{otherName}</strong> —
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
          <Button onClick={publish} loading={busy} variant={dirty ? "primary" : "outline"}>
            {dirty ? "เผยแพร่ช่อง" : "เผยแพร่แล้ว"}
          </Button>
        }
      />

      <StickyTabs
        label="ส่วนของหน้าช่อง"
        value={section}
        onChange={goSection}
        items={SECTIONS.filter((s) => !s.admin || isAdmin).map((s) => ({
          key: s.key,
          label: s.label,
          // จุดทองที่แท็บสลิป = มีใบรอตรวจอยู่ เห็นได้จากทุกส่วนโดยไม่ต้องเข้าไปดู
          dot: s.key === "inbox" && stats.pending > 0 ? "169 155 255" : undefined,
          count: s.key === "inbox" ? stats.pending || null : null,
        }))}
      />

      {/* ================= ภาพรวม ================= */}
      {section === "home" && (
        <>
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
            <Panel accent="110 155 240" className="p-6">
              <Panel.Header eyebrow="Links" title="ลิงก์ของช่อง" count={2} />
              <div className="space-y-2.5">
                <LinkRow kind="public" label="หน้าสนับสนุน" url={supportUrl} />
                <LinkRow
                  kind="obs"
                  label="Widget แจ้งเตือน"
                  url={alertUrl}
                  size="1280 × 720"
                />
              </div>
              <p className="mt-4 text-xs text-muted">
                ลิงก์ widget ใช้ได้ตลอด ไม่ต้องเปลี่ยนทุกครั้งที่จัดทัวร์ใหม่
                แก้อะไรในหน้านี้แล้วอย่าลืมกด &ldquo;เผยแพร่ช่อง&rdquo;
              </p>
            </Panel>
          </Reveal>

          {/*
            อะไรเปิดอยู่บ้าง — สรุปสวิตช์ทั้งช่องไว้ที่เดียว

            ของเดิมสวิตช์สี่ตัวกระจายอยู่คนละการ์ด ห่างกันหลายจอ จะรู้ว่า
            "ตอนนี้รับโดเนทอยู่ไหม" ต้องเลื่อนไปหาสวิตช์นั้นให้เจอก่อน
            ตรงนี้ตอบให้ในบรรทัดเดียว พร้อมบอกด้วยว่าที่เปิดไว้ยังขาดอะไรอยู่
          */}
          <Reveal index={2}>
            <Panel className="p-6">
              <Panel.Header
                eyebrow="Status"
                title="ตอนนี้เปิดอะไรอยู่บ้าง"
                action={
                  <MiniBtn onClick={() => goSection("settings")}>ไปตั้งค่า</MiniBtn>
                }
              />
              <div className="grid gap-2.5 sm:grid-cols-2">
                <StatusLine
                  on={channel.donate.enabled}
                  label="รับโดเนท"
                  detail={
                    channel.donate.promptPayId
                      ? `พร้อมเพย์ ${channel.donate.promptPayId}`
                      : "ยังไม่ได้ใส่เลขพร้อมเพย์"
                  }
                />
                <StatusLine
                  on={channel.member.enabled}
                  label="รับสมาชิก"
                  detail={`${channel.member.tiers.length} แพ็กเกจ`}
                />
                <StatusLine
                  on={!!channel.donate.autoApprove}
                  label="อนุมัติสลิปอัตโนมัติ"
                  detail={
                    channel.donate.verifyEndpoint
                      ? "ต่อกับตัวกลางตรวจสลิปแล้ว"
                      : "ยังไม่มีลิงก์ตัวกลาง จะไม่อนุมัติให้เอง"
                  }
                />
                <StatusLine
                  on={channel.songs?.enabled === true}
                  label="รับคำขอเพลง"
                  detail={`กองสำรอง ${channel.songs?.filler?.length ?? 0} เพลง`}
                />
              </div>
            </Panel>
          </Reveal>
        </>
      )}

      {/* ================= ตั้งค่าช่อง ================= */}
      {section === "settings" && (
        <>
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
                        className="h-4 w-4 accent-live"
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
                    shape="round"
                    maxWidth={300}
                    maxBytes={70_000}
                  />
                  <ImagePicker
                    label="รูปปก"
                    value={channel.cover}
                    onChange={(v) => set("cover", v)}
                    shape="wide"
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
            <Panel accent="52 227 176" className="p-6">
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
                        className="cursor-pointer px-2 text-xs text-muted transition-colors hover:text-danger"
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
                className="mt-4 cursor-pointer rounded-lg tile px-3 py-2 text-xs text-muted transition-colors hover:text-iris"
              >
                + เพิ่มแพ็กเกจ
              </button>
            </Panel>
          </Reveal>
        </>
      )}

      {/* ================= สลิปที่ส่งเข้ามา ================= */}
      {section === "inbox" && (
        <Reveal>
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
                /* ลิงก์ย้ายไปอยู่แท็บภาพรวมแล้ว ต้องบอกทางให้ตรง ไม่ใช่ "ด้านบน" */
                description="เอาลิงก์หน้าสนับสนุนจากแท็บ “ภาพรวม” ไปแปะให้คนดู พอมีคนส่งสลิปเข้ามา ใบจะโผล่ตรงนี้ให้กดอนุมัติ"
              />
            ) : (
              <>
                <Tabs
                  label="กรองใบตามสถานะ"
                  className="mb-4"
                  value={tab}
                  onChange={setTab}
                  items={(["all", "pending", "approved", "rejected"] as Tab[]).map(
                    (k) => ({ key: k, label: TAB_LABEL[k], count: COUNT[k] }),
                  )}
                />

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
                                  <span className="num ml-2 font-display text-iris">
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
                                    <Badge rgb="110 155 240" hex="var(--color-info)" tone="done">
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
      )}

      {/* ================= ระบบขอเพลง =================
          ตั้งค่าแล้วต้องกด "เผยแพร่ช่อง" เหมือนค่าอื่น ส่วนคิวเขียนทันที */}
      {section === "songs" && (
        <Reveal>
          <SongQueuePanel
            channelId={activeId ?? ""}
            channel={channel}
            onConfigChange={(songs) => set("songs", songs)}
          />
        </Reveal>
      )}

      {/* ================= ผู้ดูแลระบบ =================
          ตัวแผงเช็คสิทธิ์ซ้ำอีกชั้นในตัวเอง แท็บนี้แค่ไม่โชว์ทางเข้าให้เปล่าๆ */}
      {section === "team" && isAdmin && (
        <Reveal>
          <AdminTeamPanel />
        </Reveal>
      )}

      {/* แถบบันทึกลอย — โผล่เฉพาะตอนมีของค้าง จะได้กดได้จากตรงไหนก็ได้ในหน้า */}
      <AnimatePresence>
        {dirty && canManage && (
          <motion.div
            initial={reduced ? false : { y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? undefined : { y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-hair bg-ink/92 px-4 py-3 shadow-lift-3 backdrop-blur-xl sm:px-5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: "rgb(var(--st-next))" }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm text-ice">
                  {neverPublished ? "ช่องนี้ยังไม่เคยเผยแพร่" : "มีการแก้ที่ยังไม่ได้เผยแพร่"}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {channel.handle
                    ? editingOther
                      ? `กดแล้วค่าจะขึ้นช่องของ ${otherName}`
                      : "คนดูกับ widget จะเห็นค่าใหม่หลังกดปุ่มนี้"
                    : "ตั้งชื่อช่อง (handle) ก่อนถึงจะเผยแพร่ได้"}
                </p>
              </div>
              <Button
                onClick={publish}
                loading={busy}
                disabled={!channel.handle}
                className="shrink-0"
              >
                เผยแพร่ช่อง
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

/**
 * หนึ่งบรรทัดสรุปว่าระบบย่อยนี้เปิดอยู่ไหม และที่เปิดไว้ยังขาดอะไร
 *
 * ตัว detail สำคัญพอๆ กับป้ายเปิด/ปิด — "เปิดรับโดเนทแต่ยังไม่ใส่เลขพร้อมเพย์"
 * คือสถานะที่พังเงียบที่สุดของหน้านี้ ตรงที่มันดูเหมือนเปิดใช้งานได้แล้ว
 */
function StatusLine({
  on,
  label,
  detail,
}: {
  on: boolean;
  label: string;
  detail: ReactNode;
}) {
  return (
    <div
      className="tally flex items-center gap-3 rounded-xl tile p-3.5"
      style={{ ["--st"]: on ? "var(--st-win)" : "var(--st-idle)" } as CSSProperties}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ice">{label}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>
      </div>
      <Badge
        rgb={on ? "52 227 176" : "126 130 153"}
        tone={on ? "done" : "plain"}
      >
        {on ? "เปิด" : "ปิด"}
      </Badge>
    </div>
  );
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
  onCreate,
  busy,
}: {
  channels: Channel[];
  activeId: string;
  ownUid: string;
  ownName: string;
  ownAvatar?: string;
  onSelect: (c: Channel | null) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  /* ช่องแรกของเราใช้ uid เป็นชื่อเอกสาร ส่วนช่องที่สร้างทีหลังมีรหัสของตัวเอง
     แยกเป็นสองกลุ่มให้เห็นชัดว่าอันไหนของเรา อันไหนของคนอื่นที่เข้าไปช่วยดูแล */
  const first = channels.find((c) => c.id === ownUid);
  const mine = channels.filter((c) => c.id !== ownUid && c.ownerUid === ownUid);
  const others = channels.filter((c) => c.id !== ownUid && c.ownerUid !== ownUid);

  return (
    <Panel variant="quiet" className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="slug slug-2">Admin · สลับช่อง</span>
        <span className="num text-eyebrow text-muted">
          ของคุณ {mine.length + 1} · ของคนอื่น {others.length}
        </span>
      </div>

      <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
        <ChannelChip
          name={first?.name || ownName}
          handle={first?.handle}
          avatar={first?.avatar ?? ownAvatar}
          mine
          active={activeId === ownUid}
          onClick={() => onSelect(null)}
        />
        {mine.map((c) => (
          <ChannelChip
            key={c.id}
            name={c.name || c.handle || c.id.slice(0, 8)}
            handle={c.handle}
            avatar={c.avatar}
            mine
            active={activeId === c.id}
            onClick={() => onSelect(c)}
          />
        ))}
        {others.map((c) => (
          <ChannelChip
            key={c.id}
            name={c.name || c.handle || c.id.slice(0, 8)}
            handle={c.handle}
            avatar={c.avatar}
            active={activeId === c.id}
            onClick={() => onSelect(c)}
          />
        ))}

        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="hover-tile flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-dashed border-hair px-4 py-2 font-display text-xs text-muted transition-colors hover:text-iris disabled:cursor-not-allowed disabled:opacity-50"
        >
          + เปิดช่องใหม่
        </button>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-muted">
        {others.length === 0
          ? "ช่องของคนอื่นจะโผล่ที่นี่ก็ต่อเมื่อเจ้าของช่องนั้นเข้ามาตั้งค่าแล้วกดเผยแพร่เองอย่างน้อยหนึ่งครั้ง"
          : "กดที่ช่องไหนก็สลับไปแก้ช่องนั้น — ของที่แก้ค้างไว้ในช่องเดิมจะหายถ้ายังไม่ได้กดเผยแพร่"}
      </p>
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
  /* ช่องที่กำลังแก้อยู่ต้องกดไม่ได้ ไม่งั้นกดแล้วไม่มีอะไรเกิดขึ้น
     ซึ่งแยกไม่ออกจาก "ปุ่มเสีย" โดยเฉพาะตอนที่มีช่องเดียวทั้งระบบ */
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={active}
      aria-pressed={active}
      title={active ? "กำลังแก้ช่องนี้อยู่" : "สลับไปแก้ช่องนี้"}
      className={`flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
        active
          ? "cursor-default border-iris/45 bg-[rgb(221_175_100/0.12)]"
          : "cursor-pointer border-hair hover-tile"
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
            active ? "text-iris" : "text-ice/85"
          }`}
        >
          {name || "ยังไม่ตั้งชื่อ"}
        </span>
        <span className="num block text-eyebrow text-muted">
          {handle ? `@${handle}` : "ยังไม่ตั้ง handle"}
        </span>
      </span>

      {mine && (
        <span className="shrink-0 rounded-full bg-[rgb(77_181_145/0.14)] px-2 py-0.5 font-display text-eyebrow text-win">
          ช่องของคุณ
        </span>
      )}
    </button>
  );
}

