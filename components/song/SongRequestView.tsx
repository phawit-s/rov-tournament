"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useHashParam } from "@/hooks/useClient";
import { useOpenQueue } from "@/hooks/useSong";
import { hasBackend } from "@/lib/backend/firebase";
import { findChannelByHandle, watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc } from "@/lib/safe";
import { splitQueue } from "@/lib/song/store";
import { DEFAULT_SONG_CONFIG } from "@/lib/song/types";
import { IconArrowLeft } from "../ui/icons";
import { Badge, EmptyState, LiveBadge, Skeleton } from "../ui/kit";
import Stage from "./Stage";
import { QueueList, RequestForm } from "./SongRequestPanel";

/**
 * หน้าขอเพลงของช่อง — /song/#h=ชื่อช่อง (หรือ #ch=รหัสช่อง)
 *
 * เปิดจากมือถือเป็นหลัก (สแกน QR บนไลฟ์) ลำดับบนมือถือจึงเป็น
 * ช่องไหน → กำลังเล่นอะไร → ฟอร์มขอเพลง → คิว
 * จอกว้างแยกสองคอลัมน์: ซ้ายเวที + ฟอร์ม (ติดอยู่กับที่) ขวาคิวยาวๆ
 */
export default function SongRequestView() {
  const idParam = useHashParam("ch");
  const handleParam = useHashParam("h");

  const [channel, setChannel] = useState<Channel | null>(null);
  const [lookupDone, setLookupDone] = useState(false);

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

  if (!hasBackend) {
    return (
      <EmptyState
        title="เว็บนี้ยังไม่ได้เชื่อมฐานข้อมูล"
        description="ตั้งค่า Firebase แล้ว build ใหม่ ระบบขอเพลงถึงจะใช้ได้"
      />
    );
  }

  if (!idParam && !handleParam) {
    return (
      <EmptyState
        title="ลิงก์นี้ไม่ได้บอกว่าเป็นช่องไหน"
        description="เลือกช่องที่อยากขอเพลงจากหน้าแรก หรือสแกน QR บนไลฟ์อีกครั้ง"
        action={<BackLink label="ดูช่องที่เปิดรับเพลง" />}
      />
    );
  }

  if (!lookupDone) return <LoadingScreen />;

  if (!channel) {
    return (
      <EmptyState
        title="ไม่พบช่องนี้"
        description={`ไม่มีช่องชื่อ "${handleParam ?? idParam}" ลองเลือกจากรายชื่อช่องที่เปิดรับเพลงแทน`}
        action={<BackLink label="ดูช่องที่เปิดรับเพลง" />}
      />
    );
  }

  return <RequestScreen channel={channel} />;
}

function RequestScreen({ channel }: { channel: Channel }) {
  const config = { ...DEFAULT_SONG_CONFIG, ...channel.songs };
  const { queue, loaded } = useOpenQueue(config.enabled ? channel.id : null);
  const { playing, queued } = splitQueue(queue);
  const avatar = channel.avatar ? safeImageSrc(channel.avatar) : null;
  const live = channel.live?.isLive ? channel.live.url : null;
  const name = channel.name || channel.handle;

  const header = (
    <div className="flex items-center gap-4">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-16 w-16 shrink-0 rounded-full bg-fill object-cover" />
      ) : (
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-fill text-2xl font-bold text-muted">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-headline font-bold">{name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {channel.handle && <span className="text-sm text-muted">@{channel.handle}</span>}
          {config.enabled ? <Badge tone="open">เปิดรับเพลง</Badge> : <Badge>ปิดรับเพลงอยู่</Badge>}
          {live && <LiveBadge url={live} label="ดูไลฟ์" />}
        </div>
      </div>
    </div>
  );

  if (!config.enabled) {
    return (
      <div className="max-w-[40rem] space-y-8">
        <BackLink />
        {header}
        <EmptyState
          title="ช่องนี้ยังไม่เปิดรับเพลง"
          description="สตรีมเมอร์จะเปิดรับตอนไลฟ์ ลองกลับมาใหม่ หรือดูช่องอื่นที่เปิดรับอยู่"
          action={<BackLink label="ดูช่องอื่น" />}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
      <div className="min-w-0 space-y-8 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-3">
          <BackLink />
          {header}
        </div>
        <Stage
          song={playing}
          empty={
            <>
              <p className="text-lg font-bold">ยังไม่มีเพลงที่กำลังเล่น</p>
              <p className="mt-1 text-muted">ขอเพลงแรกได้เลย สตรีมเมอร์จะเปิดตามคิว</p>
            </>
          }
        />
        <RequestForm channel={channel} config={config} queue={queue} queued={queued} />
      </div>

      <div className="min-w-0 lg:pt-14">
        <QueueList channelId={channel.id} queued={queued} loading={!loaded} />
      </div>
    </div>
  );
}

function BackLink({ label = "ช่องอื่น" }: { label?: string }) {
  return (
    <Link
      href="/"
      className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      <IconArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

function LoadingScreen() {
  return (
    <div className="max-w-[40rem] space-y-8" aria-busy="true">
      <div className="flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="aspect-video w-full rounded-stage" />
    </div>
  );
}
