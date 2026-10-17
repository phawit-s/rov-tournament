"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAllChannels } from "@/hooks/useChannels";
import { useOpenQueue } from "@/hooks/useSong";
import { hasBackend } from "@/lib/backend/firebase";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc } from "@/lib/safe";
import { splitQueue } from "@/lib/song/store";
import Cover from "../ui/Cover";
import { IconSearch } from "../ui/icons";
import { Badge, EmptyState, Skeleton } from "../ui/kit";

/**
 * หน้าแรก = สารบัญช่องที่เปิดรับขอเพลง
 *
 * แต่ละช่องโชว์ด้วยปกเพลงที่ "กำลังเล่นอยู่จริงตอนนี้" ไม่ใช่รูปโปรไฟล์
 * คนที่เปิดหน้านี้อยากรู้ว่าตอนนี้ใครเปิดอะไรอยู่ แล้วเข้าไปขอเพลงต่อ
 * ปกคือข้อมูลที่บอกเรื่องนั้นได้ในพริบตา (ไม่มีเพลงค่อยถอยไปใช้รูปช่อง)
 *
 * กติกา Firestore เปิดอ่าน channels สาธารณะอยู่แล้ว (widget ใน OBS ต้องใช้)
 * จึงไม่ต้องล็อกอินก็เปิดดูได้
 */
export default function ChannelDirectory() {
  const { channels, loaded } = useAllChannels(hasBackend);
  const [q, setQ] = useState("");

  /* เอาเฉพาะช่องที่กดแล้วใช้ได้จริง — เปิดรับเพลงอยู่ และตั้ง handle แล้ว
     (ไม่มี handle เปิดลิงก์ /song/#h= ไม่ได้) ไลฟ์อยู่ขึ้นก่อนเสมอ */
  const open = useMemo(() => {
    const list = channels.filter((c) => c.songs?.enabled && c.handle?.trim());
    return list.sort((a, b) => {
      const live = Number(!!b.live?.isLive) - Number(!!a.live?.isLive);
      if (live !== 0) return live;
      return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    });
  }, [channels]);

  const found = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("th");
    if (!needle) return open;
    return open.filter((c) =>
      [c.name, c.handle, c.tagline ?? ""].join(" ").toLocaleLowerCase("th").includes(needle),
    );
  }, [open, q]);

  return (
    <div>
      <section className="max-w-[40rem]">
        <h1 className="text-display font-bold">ขอเพลงให้ไลฟ์ที่คุณดูอยู่</h1>
        <p className="mt-4 text-lg text-muted">
          เลือกช่อง วางลิงก์ YouTube แล้วเพลงจะต่อคิวเล่นบนไลฟ์ของช่องนั้น
          ไม่ต้องสมัครสมาชิก
        </p>
      </section>

      <section className="mt-12 sm:mt-16" aria-labelledby="channels-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="channels-title" className="text-title font-bold">
            ช่องที่เปิดรับเพลง
            {loaded && open.length > 0 && (
              <span className="num ml-2 font-normal text-muted">{open.length}</span>
            )}
          </h2>
          {open.length > 6 && (
            <label className="flex min-h-11 w-full items-center gap-2.5 rounded-full bg-fill px-4 sm:w-72">
              <IconSearch className="h-4 w-4 shrink-0 text-muted" />
              <span className="sr-only">ค้นหาช่อง</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหาช่อง"
                className="min-w-0 grow bg-transparent outline-none placeholder:text-faint"
              />
            </label>
          )}
        </div>

        <div className="mt-6">
          {!hasBackend ? (
            <EmptyState
              title="เว็บนี้ยังไม่ได้เชื่อมฐานข้อมูล"
              description="ตั้งค่า Firebase ใน .env.local แล้ว build ใหม่ ระบบขอเพลงถึงจะใช้ได้"
            />
          ) : !loaded ? (
            <Grid>
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton className="aspect-square w-full rounded-art" />
                  <Skeleton className="mt-3 h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3.5 w-1/2" />
                </div>
              ))}
            </Grid>
          ) : open.length === 0 ? (
            <EmptyState
              title="ยังไม่มีช่องไหนเปิดรับเพลง"
              description="ถ้าคุณเป็นสตรีมเมอร์ เปิดคิวเพลงให้ช่องของคุณได้ที่สตูดิโอ"
              action={
                <Link
                  href="/studio/"
                  className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink"
                >
                  เปิดคิวเพลงให้ช่องของฉัน
                </Link>
              }
            />
          ) : found.length === 0 ? (
            <EmptyState
              title={`ไม่เจอช่องที่ชื่อมีคำว่า "${q.trim()}"`}
              description="ลองพิมพ์แค่บางส่วนของชื่อช่อง หรือชื่อหลัง @"
            />
          ) : (
            <Grid>
              {found.map((c) => (
                <ChannelTile key={c.id} channel={c} />
              ))}
            </Grid>
          )}
        </div>
      </section>

      <section className="surface mt-16 p-6 sm:p-10">
        <h2 className="text-title font-bold">เป็นสตรีมเมอร์?</h2>
        <p className="mt-2 max-w-[36rem] text-muted">
          เปิดคิวขอเพลงให้ช่องของคุณ คนดูสแกน QR บนไลฟ์แล้วขอเพลงได้ทันที
          มีตัวเล่นที่เปิดเพลงตามคิวให้เอง และกราฟิกเพลงที่กำลังเล่นสำหรับ OBS
        </p>
        <Link
          href="/studio/"
          className="mt-6 inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink transition-opacity hover:opacity-85"
        >
          เปิดคิวเพลงให้ช่องของฉัน
        </Link>
      </section>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4">
      {children}
    </div>
  );
}

/** ช่องหนึ่งช่อง — ปกเพลงที่กำลังเล่น ชื่อช่อง และชื่อเพลง */
function ChannelTile({ channel }: { channel: Channel }) {
  const { queue } = useOpenQueue(channel.id);
  const { playing, queued } = splitQueue(queue);
  const avatar = channel.avatar ? safeImageSrc(channel.avatar) : null;

  return (
    <Link href={`/song/#h=${channel.handle}`} className="group block min-w-0">
      {/* ปกยกขึ้นจากพื้นเทา และลอยขึ้นอีกนิดตอนชี้ — ตอบการกระทำ ไม่ได้ขยับเอง */}
      <div className="relative rounded-art shadow-card transition-[transform,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:shadow-raise">
        {playing ? (
          <Cover videoId={playing.videoId} square className="w-full" />
        ) : avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatar}
            alt=""
            loading="lazy"
            className="aspect-square w-full rounded-art bg-fill object-cover"
          />
        ) : (
          <span className="grid aspect-square w-full place-items-center rounded-art bg-fill text-5xl font-bold text-faint">
            {(channel.name || channel.handle).slice(0, 1).toUpperCase()}
          </span>
        )}
        {channel.live?.isLive && (
          <Badge tone="ink" className="absolute top-2.5 left-2.5 bg-live text-white" dot>
            ไลฟ์อยู่
          </Badge>
        )}
      </div>

      <p className="mt-3 truncate font-semibold group-hover:underline">
        {channel.name || channel.handle}
      </p>
      <p className="truncate text-sm text-muted">
        {playing
          ? playing.title
          : queued.length > 0
            ? `รอเล่น ${queued.length} เพลง`
            : `@${channel.handle}`}
      </p>
    </Link>
  );
}
