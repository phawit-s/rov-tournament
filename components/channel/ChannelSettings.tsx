"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { setHashParams, useHashParam } from "@/hooks/useClient";
import { useChannel, useOwnChannels } from "@/hooks/useChannels";
import { useSiteRole } from "@/hooks/useRole";
import { studioHref } from "@/hooks/useStudioChannel";
import { recordAudit } from "@/lib/audit";
import { authStore } from "@/lib/backend/firebase";
import {
  channelStore,
  createChannel,
  decideChannelSeed,
  deleteChannel,
  emptyChannel,
  findChannelByHandle,
  pushChannelAs,
} from "@/lib/channel/store";
import { normalizeHandle, type Channel } from "@/lib/channel/types";
import { DEFAULT_SONG_CONFIG, type SongConfig } from "@/lib/song/types";
import PageHead from "../studio/PageHead";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import ImagePicker from "../ui/ImagePicker";
import { SwitchRow } from "../ui/Switch";
import { toast } from "../ui/Toast";
import { EmptyState, Input, Label, NumberInput, Skeleton, Textarea } from "../ui/kit";

/**
 * ของในหน้ากับสำเนาบนคลาวด์ตรงกันไหม
 *
 * เทียบทางเดียว — ไล่จากคีย์ของ "ในหน้า" ไปหาคลาวด์เท่านั้น
 * เพราะตอนบันทึก pushChannelAs ใส่ isPublic กับ syncedAt เพิ่มให้เอง และใช้ merge
 * ของเก่าที่ถูกลบไปแล้วจึงค้างอยู่บนคลาวด์ (เช่น donate/member สมัยก่อน)
 * ถ้าเทียบสองทาง แถบ "ยังไม่ได้บันทึก" จะค้างตลอดเวลา
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

/**
 * ค่าที่ "มีผลทันที" ต้องเอาของบนคลาวด์มาทับร่างก่อนบันทึกเสมอ
 *
 * เปิด/ปิดรับเพลง ป้ายไลฟ์ และเพลย์ลิสต์สำรอง ถูกแก้จากหน้าอื่นตรงลงคลาวด์
 * (หน้าภาพรวม หน้าคิว ตัวเล่น) ระหว่างที่หน้านี้ถือร่างเก่าค้างไว้
 * ถ้าบันทึกร่างทั้งก้อน ค่าพวกนั้นจะถูกย้อนกลับเงียบๆ — เช่นปิดรับเพลงไปแล้ว
 * มากดบันทึกชื่อช่อง แล้วกลายเป็นเปิดรับใหม่โดยไม่มีใครตั้งใจ
 */
function withLiveFields(draft: Channel, cloud: Channel | null): Channel {
  if (!cloud) return draft;
  const songs = { ...DEFAULT_SONG_CONFIG, ...draft.songs };
  const cloudSongs = cloud.songs;
  return {
    ...draft,
    live: { ...draft.live, isLive: cloud.live?.isLive ?? draft.live.isLive },
    songs: {
      ...songs,
      enabled: cloudSongs?.enabled ?? songs.enabled,
      filler: cloudSongs?.filler ?? songs.filler,
      fillerMode: cloudSongs?.fillerMode ?? songs.fillerMode,
    },
  };
}

/**
 * ตั้งค่าช่อง — /studio/channel/
 *
 * แก้ในร่างก่อน (channelStore) แล้วค่อยกดบันทึกทีเดียว
 * ร่างไม่ผูกกับช่องที่เปิดอยู่ในหน้าอื่น — ช่องมาจาก #c= เหมือนทุกหน้าในสตูดิโอ
 */
export default function ChannelSettings() {
  useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getServerSnapshot);
  const user = authStore.user();

  /* รุ่นของร่างในหน่วยความจำ — ตัวข้อมูลจริงอ่านด้วย channelStore.draftFor(id) */
  useSyncExternalStore(channelStore.subscribe, channelStore.getSnapshot, channelStore.getServerSnapshot);

  const { admin, uid: myUid } = useSiteRole();
  const { channels: ownChannels, loaded: myLoaded } = useOwnChannels(myUid);
  const [busy, setBusy] = useState(false);

  /*
    ช่องที่เปิดอยู่มาจาก #c= — รีเฟรชได้ แชร์ลิงก์ได้ และ "ช่องไหน" ไม่มีทางเดาผิด
    ไม่มี #c= = ช่องแรกของตัวเอง ถ้ายังไม่มีเลยใช้ uid เป็นชื่อเอกสารของ "ช่องแรก"
    (ตรงกับกติกาเดิมที่ช่องแรกของบัญชีใช้ uid เป็นชื่อเอกสาร)
  */
  const hashChannel = useHashParam("c");
  const fallbackId = ownChannels[0]?.id ?? (user ? user.uid : null);
  const activeId = hashChannel || (myLoaded ? fallbackId : null);

  /* สำเนาบนคลาวด์ของช่องที่เปิดอยู่ — ใช้เป็นต้นทางและใช้เทียบว่ามีอะไรค้าง */
  const { channel: live, loaded: liveLoaded } = useChannel(activeId);
  const channel = channelStore.draftFor(activeId);

  /* แก้ช่องตัวเองได้เสมอ ช่องคนอื่นต้องเป็นผู้ดูแลที่ Firestore ยืนยันแล้ว
     ดูจาก ownerUid ไม่ใช่ชื่อเอกสาร (ช่องที่สองขึ้นไปและช่องที่ถูกโอนมา ชื่อเอกสารไม่ใช่ uid) */
  const owned = !!channel && !!myUid && channel.ownerUid === myUid;
  const canManage = owned || admin;
  const editingOther = !!channel && !owned;

  /*
    ยังไม่มีร่าง — ดึงของจริงจากคลาวด์มาก่อน ห้ามสร้างโครงว่างทันที
    ไม่งั้นเปิดหน้านี้ในเครื่องใหม่แล้วจะเห็นช่องเปล่า และถ้าเผลอกดบันทึก
    ช่องจริงจะโดนทับด้วยของเปล่าทั้งใบ — รอจนรู้ผลจากคลาวด์ก่อน (liveLoaded)
  */
  useEffect(() => {
    if (!user || !activeId) return;
    const choice = decideChannelSeed({
      hasUser: true,
      hasLocal: !!channelStore.draftFor(activeId),
      /* ปั้นโครงว่างได้เฉพาะ "ช่องแรกของตัวเอง" ที่ใช้ uid เป็นชื่อเอกสาร
         รหัสอื่นที่คลาวด์ไม่รู้จัก = ลิงก์ผิดหรือช่องถูกลบ ไม่ใช่ช่องใหม่ */
      canCreate: activeId === user.uid,
      cloudLoaded: liveLoaded,
      cloudExists: !!live,
    });
    if (choice === "use-cloud" && live) channelStore.set(activeId, live);
    else if (choice === "create-empty") {
      channelStore.set(activeId, emptyChannel({ uid: user.uid, email: user.email }, activeId));
    }
  }, [user, activeId, liveLoaded, live]);

  if (!user) {
    return (
      <EmptyState
        title="เข้าสู่ระบบก่อน"
        description="ช่องผูกกับบัญชี เข้าสู่ระบบด้วยบัญชีสตรีมเมอร์แล้วค่อยตั้งค่าช่อง"
      />
    );
  }

  /** เปิดช่องใหม่ให้ตัวเอง แล้วสลับไปแก้ช่องนั้นเลย */
  async function addChannel() {
    if (!user) return;
    setBusy(true);
    try {
      const made = await createChannel(
        { uid: user.uid, email: user.email },
        `ช่องใหม่ ${ownChannels.length + 1}`,
      );
      channelStore.set(made.id, made);
      setHashParams({ c: made.id });
      toast("เปิดช่องใหม่แล้ว ตั้งชื่อลิงก์ของช่องก่อนแล้วกดบันทึก", "success");
      void recordAudit("channel.publish", { id: made.id, name: made.name, detail: "เปิดช่องใหม่" });
    } catch {
      toast("เปิดช่องใหม่ไม่สำเร็จ บัญชีนี้อาจยังไม่ได้สิทธิ์สตรีมเมอร์", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!activeId || !channel) {
    if (!myLoaded || (activeId && !liveLoaded)) return <SettingsSkeleton />;
    return (
      <div className="space-y-8">
        <PageHead title="ตั้งค่าช่อง" />
        <EmptyState
          title={hashChannel ? "ไม่พบช่องนี้" : "ยังไม่มีช่องของตัวเอง"}
          description={
            hashChannel
              ? "ลิงก์นี้ชี้ไปที่ช่องที่ไม่มีแล้ว อาจถูกลบหรือคัดลอกรหัสมาไม่ครบ"
              : "เปิดช่องเพื่อรับคำขอเพลง คนดูจะขอเพลงผ่านลิงก์ของช่องคุณ"
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button loading={busy} onClick={() => void addChannel()}>
                เปิดช่องของฉัน
              </Button>
              {hashChannel && (
                <Button variant="ghost" onClick={() => setHashParams({ c: null })}>
                  กลับไปช่องของฉัน
                </Button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  return (
    <Editor
      key={activeId}
      activeId={activeId}
      channel={channel}
      live={live}
      canManage={canManage}
      editingOther={editingOther}
      busy={busy}
      setBusy={setBusy}
      onAddChannel={() => void addChannel()}
      otherChannelId={ownChannels.find((c) => c.id !== activeId)?.id ?? null}
    />
  );
}

function Editor({
  activeId,
  channel,
  live,
  canManage,
  editingOther,
  busy,
  setBusy,
  onAddChannel,
  otherChannelId,
}: {
  activeId: string;
  channel: Channel;
  live: Channel | null;
  canManage: boolean;
  editingOther: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onAddChannel: () => void;
  /** ช่องอื่นของเราที่จะพาไปหลังลบช่องนี้ — null = ไม่มีช่องอื่นแล้ว */
  otherChannelId: string | null;
}) {
  const reduced = useReducedMotion();
  const user = authStore.user();
  const [handleTaken, setHandleTaken] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const name = channel.name || channel.handle || "ช่องนี้";
  const songs: SongConfig = { ...DEFAULT_SONG_CONFIG, ...channel.songs };
  const neverPublished = !live;
  const dirty = !live || !matchesCloud(channel, live);

  /* แก้ลงร่างของ "ช่องที่เปิดอยู่" เท่านั้น — ร่างมีรหัสช่องกำกับอยู่แล้ว */
  const set = <K extends keyof Channel>(key: K, value: Channel[K]) => {
    channelStore.update(activeId, { [key]: value } as Partial<Channel>);
  };
  const setSongs = (patch: Partial<SongConfig>) => set("songs", { ...songs, ...patch });

  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";

  const save = async () => {
    if (!user) return;
    if (!channel.handle) {
      toast("ตั้งชื่อลิงก์ของช่องก่อน แล้วค่อยบันทึก", "error");
      return;
    }
    setBusy(true);
    try {
      /* ชื่อลิงก์ซ้ำกับช่องอื่น = ลิงก์ /song/#h= จะพาคนดูไปผิดช่อง ต้องกันไว้ */
      const holder = await findChannelByHandle(channel.handle);
      if (holder && holder.id !== activeId) {
        setHandleTaken(channel.handle);
        toast(`ชื่อลิงก์ ${channel.handle} มีช่องอื่นใช้แล้ว ลองชื่ออื่น`, "error");
        return;
      }
      setHandleTaken(null);
      /*
        เขียนกลับไปที่เอกสารเดิมเสมอ (activeId) ไม่ใช่ที่ชื่อเอกสาร = ownerUid
        ช่องที่ถูกโอนมาชื่อเอกสารไม่ใช่ uid เจ้าของ เดาผิดแล้วจะกลายเป็นช่องซ้ำสองใบ
        แก้ช่องคนอื่นห้ามทับ ownerEmail ของเจ้าของด้วยอีเมลผู้ดูแล
      */
      const draft = withLiveFields(channel, live);
      await pushChannelAs(
        editingOther ? draft : { ...draft, ownerEmail: user.email ?? undefined },
        activeId,
      );
      channelStore.set(activeId, draft);
      toast(neverPublished ? "เปิดช่องแล้ว" : "บันทึกแล้ว", "success");
      void recordAudit("channel.publish", { id: activeId, name: channel.name || channel.handle });
    } catch (err) {
      toast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่", "error");
    } finally {
      setBusy(false);
    }
  };

  /** คำที่ต้องพิมพ์ยืนยันก่อนลบ — ชื่อลิงก์ถ้ามี (ไม่ซ้ำกับช่องอื่น) ไม่งั้นชื่อช่อง */
  const deletePhrase = channel.handle || channel.name || activeId;

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteChannel(activeId);
      void recordAudit("channel.delete", {
        id: activeId,
        name: channel.name || channel.handle,
        detail: editingOther ? `ลบโดยผู้ดูแล (เจ้าของ ${channel.ownerEmail ?? channel.ownerUid})` : undefined,
      });
      toast(`ลบช่อง ${name} แล้ว`, "success");
      /*
        สลับไปช่องอื่นก่อน แล้วค่อยทิ้งร่าง — กลับลำดับแล้วหน้าจะเห็น "ร่างหาย + คลาวด์ไม่มี"
        ของช่องเดิมชั่วขณะ แล้วโชว์ "ไม่พบช่องนี้" แวบหนึ่งก่อนจะสลับ
      */
      setHashParams({ c: otherChannelId });
      channelStore.set(activeId, null);
    } catch {
      // ลบลูกก่อนแม่ ล้มกลางทางช่องจึงยังอยู่ครบ กดลบซ้ำได้
      toast("ลบช่องไม่สำเร็จ ช่องยังอยู่ครบ เช็คอินเทอร์เน็ตแล้วลองใหม่", "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    /* เว้นที่ท้ายหน้าไว้ให้แถบบันทึกที่ลอยอยู่ ไม่ให้ทับช่องสุดท้าย */
    <div className="space-y-6 pb-32">
      <PageHead
        title="ตั้งค่าช่อง"
        description={
          editingOther
            ? `คุณกำลังแก้ช่องของ ${name} ในฐานะผู้ดูแล`
            : "หน้าตาของช่องและกติกาการขอเพลง กดบันทึกแล้วคนดูถึงจะเห็นค่าใหม่"
        }
      />

      <Group title="หน้าช่อง" description="สิ่งที่คนดูเห็นบนหน้าขอเพลงกับหน้าแรก">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Label htmlFor="ch-name">ชื่อช่อง</Label>
            <Input
              id="ch-name"
              value={channel.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Affarain"
              maxLength={40}
            />
          </div>
          <div>
            <Label
              htmlFor="ch-handle"
              hint={
                channel.handle
                  ? `${origin.replace(/^https?:\/\//, "")}/song/#h=${channel.handle}`
                  : "ภาษาอังกฤษตัวเล็ก ตัวเลข - และ _ เท่านั้น"
              }
            >
              ชื่อลิงก์
            </Label>
            <Input
              id="ch-handle"
              value={channel.handle}
              onChange={(e) => {
                setHandleTaken(null);
                set("handle", normalizeHandle(e.target.value));
              }}
              placeholder="affarain"
              maxLength={24}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!handleTaken && handleTaken === channel.handle}
            />
            {handleTaken === channel.handle && (
              <p className="mt-1.5 text-sm text-danger">มีช่องอื่นใช้ชื่อนี้แล้ว ลองชื่ออื่น</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="ch-tagline" hint="ไม่ใส่ก็ได้ ใช้ตอนคนค้นหาช่องจากหน้าแรก">
              คำอธิบายสั้นๆ
            </Label>
            <Input
              id="ch-tagline"
              value={channel.tagline ?? ""}
              onChange={(e) => set("tagline", e.target.value)}
              placeholder="ไลฟ์เกมทุกคืน ขอเพลงได้ตลอด"
              maxLength={80}
            />
          </div>
          <div className="sm:col-span-2">
            <ImagePicker
              label="รูปช่อง"
              value={channel.avatar}
              onChange={(v) => set("avatar", v)}
              shape="round"
              maxWidth={300}
              maxBytes={70_000}
            />
          </div>
          <div className="sm:col-span-2">
            <Label
              htmlFor="ch-live"
              hint="ปุ่ม “ดูไลฟ์” บนหน้าขอเพลงพาไปที่นี่ เปิดปิดป้ายไลฟ์ได้ที่หน้าภาพรวม"
            >
              ลิงก์ไลฟ์
            </Label>
            <Input
              id="ch-live"
              value={channel.live?.url ?? ""}
              onChange={(e) => set("live", { ...channel.live, url: e.target.value.trim() })}
              placeholder="https://www.tiktok.com/@affarain/live"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      </Group>

      <Group title="กติกาการขอเพลง" description="เปิดปิดรับเพลงได้ที่หน้าภาพรวมหรือหน้าคิว มีผลทันที">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <Label htmlFor="max-user" hint="นับเฉพาะเพลงที่ยังรออยู่ในคิว ว่างไว้ = ไม่จำกัด">
              คนหนึ่งขอได้กี่เพลง
            </Label>
            <NumberInput
              id="max-user"
              value={songs.maxPerUser ?? 0}
              onChange={(maxPerUser) => setSongs({ maxPerUser })}
              max={99}
              placeholder="ไม่จำกัด"
            />
          </div>
          <div>
            <Label htmlFor="max-queue" hint="คิวเต็มแล้วปิดรับชั่วคราวเอง ว่างไว้ = ไม่จำกัด">
              คิวยาวสุดกี่เพลง
            </Label>
            <NumberInput
              id="max-queue"
              value={songs.maxQueue ?? 0}
              onChange={(maxQueue) => setSongs({ maxQueue })}
              max={999}
              placeholder="ไม่จำกัด"
            />
          </div>
        </div>
        <SwitchRow
          checked={!!songs.allowDuplicates}
          onChange={(allowDuplicates) => setSongs({ allowDuplicates })}
          label="ขอเพลงซ้ำกับที่อยู่ในคิวได้"
          hint="ปิดไว้ = เพลงที่อยู่ในคิวแล้วขอซ้ำไม่ได้จนกว่าจะเล่นจบ"
          className="mt-4 border-y border-line"
        />
        <div className="mt-6">
          <Label htmlFor="song-note" hint="ขึ้นเหนือช่องขอเพลง เช่น ขอเพลงยาวไม่เกิน 5 นาที">
            ข้อความถึงคนดู
          </Label>
          <Textarea
            id="song-note"
            rows={3}
            value={songs.note ?? ""}
            onChange={(e) => setSongs({ note: e.target.value.slice(0, 200) })}
            placeholder={DEFAULT_SONG_CONFIG.note}
          />
        </div>
      </Group>

      <Group
        title="ค้นหาเพลงในตัวเล่น"
        description="ไม่ใส่ก็ได้ ไม่ใส่แล้วตัวเล่นจะมีแค่ช่องวางลิงก์ ไม่มีช่องค้นหา"
      >
        <Label htmlFor="search-endpoint">ลิงก์ Worker สำหรับค้นหา</Label>
        <Input
          id="search-endpoint"
          value={songs.searchEndpoint ?? ""}
          onChange={(e) => setSongs({ searchEndpoint: e.target.value.trim() })}
          placeholder="https://xxxx.workers.dev"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mt-2 text-sm text-muted">
          การค้นหาต้องใช้คีย์ YouTube Data API v3 ซึ่งฝังในหน้าเว็บไม่ได้ จึงอยู่ใน Worker
          ตั้งคีย์ด้วยคำสั่ง <code className="rounded bg-fill px-1.5 py-0.5">wrangler secret put YT_API_KEY</code>{" "}
          โควตาฟรีค้นได้ราววันละ 100 ครั้ง
        </p>
      </Group>

      <Group title="ขอเพลงจากแชท TikTok" description="คนดูพิมพ์ !เพลง ชื่อเพลง ในแชทไลฟ์ แล้วเพลงเข้าคิวนี้เลย">
        <p className="text-muted">
          TikTok ไม่เปิดให้เว็บอ่านแชทตรงๆ ต้องรันโปรแกรมเล็กๆ บนเครื่องที่ไลฟ์คู่กันไปด้วย
          วิธีตั้งอยู่ในโฟลเดอร์ <code className="rounded bg-fill px-1.5 py-0.5">bridge/</code> ของโปรเจกต์
        </p>
      </Group>

      <Group title="เพลย์ลิสต์สำรอง" description="เพลงที่ตัวเล่นหยิบมาเปิดเองตอนไม่มีใครขอ ไลฟ์จะได้ไม่เงียบ">
        <p className="text-muted">
          {(songs.filler?.length ?? 0) > 0
            ? `มี ${songs.filler?.length} เพลง จัดการได้ในตัวเล่น`
            : "ยังไม่มีเพลงสำรอง เพิ่มได้ในตัวเล่น"}
        </p>
        {/* ตัวเล่นอยู่ในสตูดิโอแล้ว (หน้าคิว) — เปิดในแท็บเดิม ไม่ต้องแยกหน้าต่าง */}
        <Link
          href={studioHref("/studio/queue/", activeId)}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-fill px-5 font-medium transition-colors hover:bg-fill-2"
        >
          เปิดตัวเล่น
        </Link>
      </Group>

      {!editingOther && (
        <Group title="ช่องอื่น" description="บัญชีเดียวเปิดได้หลายช่อง แต่ละช่องมีคิวและลิงก์ของตัวเอง">
          <Button variant="secondary" loading={busy} onClick={onAddChannel}>
            เปิดอีกช่อง
          </Button>
          <p className="mt-2 text-sm text-muted">
            สลับช่องได้จากตัวเลือกช่องในเมนู{" "}
            <Link href={studioHref("/studio/", activeId)} className="underline">
              กลับหน้าภาพรวม
            </Link>
          </p>
        </Group>
      )}

      {/* ลบได้เฉพาะช่องที่มีอยู่บนคลาวด์แล้ว — ช่องที่ยังเป็นร่างล้วนแค่รีเฟรชก็หายเอง */}
      {canManage && !neverPublished && (
        <Group
          title="ลบช่อง"
          description="ลบช่องนี้พร้อมคิวและประวัติเพลงทั้งหมด ย้อนกลับไม่ได้"
          tone="danger"
        >
          <p className="text-muted">
            ลิงก์ขอเพลง {channel.handle ? <span className="font-medium text-ink">/song/#h={channel.handle}</span> : null}{" "}
            ลิงก์ตัวเล่น และลิงก์ widget ที่ใส่ไว้ใน OBS ของช่องนี้จะใช้ไม่ได้ทันที
          </p>
          <Button
            variant="danger"
            className="mt-4"
            loading={deleting}
            disabled={busy || deleting}
            onClick={() => setConfirmDelete(true)}
          >
            ลบช่องนี้
          </Button>
          <ConfirmDialog
            open={confirmDelete}
            title={`ลบช่อง ${name}?`}
            description="คิว ประวัติเพลง และการตั้งค่าทั้งหมดของช่องนี้จะหายถาวร กู้คืนไม่ได้"
            confirmText="ลบช่องถาวร"
            confirmPhrase={deletePhrase}
            onConfirm={() => void remove()}
            onClose={() => setConfirmDelete(false)}
          />
        </Group>
      )}

      {/* แถบบันทึกลอย — โผล่เฉพาะตอนมีของค้าง กดได้จากตรงไหนก็ได้ในหน้า
          ซ่อนระหว่างลบ: ระหว่างนั้นคลาวด์บอกว่าช่องหายแล้ว แถบจะกลายเป็น "เปิดช่อง"
          ซึ่งกดแล้วสร้างช่องที่กำลังลบขึ้นมาใหม่ */}
      <AnimatePresence>
        {dirty && canManage && !deleting && (
          <motion.div
            initial={reduced ? false : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? undefined : { y: 40, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            /* ลอยเหนือ dock ของสตูดิโอ (--dock-space ตั้งโดย components/ui/Dock.tsx) */
            className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--dock-space,0px)+max(1rem,env(safe-area-inset-bottom)))] z-40 px-4"
          >
            <div className="pointer-events-auto mx-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-3 rounded-sheet bg-paper py-3 pr-3 pl-5 shadow-float ring-1 ring-line">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {neverPublished ? "ช่องนี้ยังไม่ได้เปิด" : "มีการแก้ที่ยังไม่ได้บันทึก"}
                </p>
                <p className="truncate text-sm text-muted">
                  {channel.handle
                    ? editingOther
                      ? `บันทึกแล้วจะขึ้นที่ช่องของ ${name}`
                      : "คนดูจะเห็นค่าใหม่หลังบันทึก"
                    : "ตั้งชื่อลิงก์ของช่องก่อนถึงจะบันทึกได้"}
                </p>
              </div>
              <Button onClick={() => void save()} loading={busy} disabled={!channel.handle}>
                {neverPublished ? "เปิดช่อง" : "บันทึก"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * กลุ่มการตั้งค่า — แผ่นขาวยกจากพื้น หัวข้อซ้าย เนื้อหาขวาบนจอกว้าง ซ้อนกันบนมือถือ
 * tone="danger" = ของที่ย้อนไม่ได้ หัวข้อเป็นสีแดง ให้สะดุดตาก่อนกด
 */
function Group({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description?: string;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section className="surface grid gap-4 p-6 sm:p-8 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className={`text-lg font-bold ${tone === "danger" ? "text-danger" : ""}`}>{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="กำลังอ่านช่องของคุณ">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-64 w-full rounded-sheet" />
    </div>
  );
}
