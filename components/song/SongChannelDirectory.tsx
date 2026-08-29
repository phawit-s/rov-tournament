"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAllChannels } from "@/hooks/useChannels";
import { hasBackend } from "@/lib/backend/firebase";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc } from "@/lib/safe";
import Panel from "../ui/Panel";
import Reveal, { PageHeading } from "../ui/Reveal";
import { IconMusic, IconSearch } from "../ui/icons";
import { ArtShield, Badge, EmptyState, Skeleton } from "../tournament/ui";

/**
 * สารบัญช่องที่เปิดรับขอเพลง — ทางเข้าของคนที่ยังไม่มีลิงก์ของช่องไหนเลย
 *
 * ก่อนหน้านี้หน้าขอเพลง (/song/) ใช้ได้ก็ต่อเมื่อมี #h=ชื่อช่อง ห้อยท้ายมาแล้ว
 * ซึ่งได้มาจากสตรีมเมอร์แปะไว้ในไลฟ์เท่านั้น — ใครกดจากเมนูตรงๆ จะเจอ
 * "ไม่พบช่องนี้" ทั้งที่ยังไม่ได้ทำอะไรผิด หน้านี้เลยเป็นชั้นที่ขาดไป:
 * เลือกช่องก่อน แล้วค่อยเข้าไปขอเพลง
 *
 * กติกา Firestore เปิดอ่าน channels เป็นสาธารณะอยู่แล้ว (widget ใน OBS ต้องใช้)
 * หน้านี้จึงไม่ต้องล็อกอินก็เปิดดูได้ — จะขอเพลงจริงค่อยว่ากันในหน้าของช่อง
 */
export default function SongChannelDirectory() {
  const { channels, loaded } = useAllChannels(hasBackend);
  const [q, setQ] = useState("");

  /*
    เอาเฉพาะช่องที่ "กดแล้วใช้ได้จริง" — เปิดระบบขอเพลงไว้ และตั้ง handle แล้ว
    ช่องที่ยังไม่มี handle เปิดลิงก์ /song/#h= ไม่ได้ ถ้าเอามาโชว์ก็คือปุ่มที่พาไปหน้าเสีย
  */
  const open = useMemo(() => {
    const list = channels.filter((c) => c.songs?.enabled && c.handle?.trim());
    /* ช่องที่ไลฟ์อยู่ขึ้นก่อนเสมอ — คนกดเข้ามาหน้านี้ตอนนี้ อยากขอเพลงตอนนี้ */
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
      [c.name, c.handle, c.tagline ?? ""]
        .join(" ")
        .toLocaleLowerCase("th")
        .includes(needle),
    );
  }, [open, q]);

  const liveCount = open.filter((c) => c.live?.isLive).length;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Song requests"
        title="ขอเพลง"
        description="เลือกช่องที่อยากขอเพลง แล้ววางลิงก์ YouTube ส่งเข้าคิว — เพลงจะขึ้นเล่นบนไลฟ์ของช่องนั้นเอง"
        meta={
          open.length > 0
            ? `${open.length} ช่อง${liveCount ? ` · ไลฟ์อยู่ ${liveCount}` : ""}`
            : undefined
        }
      />

      {!hasBackend ? (
        <EmptyState
          art={<ArtShield />}
          title="ระบบขอเพลงต้องเชื่อมหลังบ้านก่อน"
          description="โหมดนี้เก็บข้อมูลไว้ในเบราว์เซอร์เครื่องเดียว จึงยังไม่มีช่องให้เลือก"
        />
      ) : !loaded ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : open.length === 0 ? (
        <EmptyState
          no="06"
          art={<ArtShield />}
          title="ยังไม่มีช่องไหนเปิดรับขอเพลง"
          description="สตรีมเมอร์ต้องเปิดระบบขอเพลงในหน้าตั้งค่าช่องก่อน ช่องถึงจะโผล่ที่นี่"
        />
      ) : (
        <>
          {open.length > 5 && (
            <div className="field flex min-h-11 items-center gap-2.5 rounded-xl px-3.5">
              <IconSearch className="h-4 w-4 shrink-0 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นชื่อช่อง"
                className="min-w-0 grow bg-transparent text-sm text-ice outline-none placeholder:text-muted/70"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="cursor-pointer text-xs text-muted transition-colors hover:text-ice"
                >
                  ล้าง
                </button>
              )}
            </div>
          )}

          {found.length === 0 ? (
            <EmptyState
              title={`ไม่เจอช่องที่ตรงกับ "${q.trim()}"`}
              description="ลองพิมพ์แค่บางส่วนของชื่อช่องดู"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {found.map((c, i) => (
                <Reveal key={c.id} index={Math.min(i, 6)} from="scale">
                  <ChannelRow channel={c} />
                </Reveal>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChannelRow({ channel }: { channel: Channel }) {
  const handle = channel.handle.trim();
  const avatar = channel.avatar ? safeImageSrc(channel.avatar) : null;
  const cover = channel.cover ? safeImageSrc(channel.cover) : null;
  const live = !!channel.live?.isLive;

  return (
    /* ทั้งใบเป็นลิงก์เดียว ไม่ใช่การ์ดที่มีปุ่มเล็กๆ อยู่มุมหนึ่ง —
       หน้านี้มีเจตนาเดียวคือ "เลือกช่องแล้วไปขอเพลง" */
    <Link href={`/song/#h=${handle}`} className="group block h-full">
      <Panel
        state={live ? "live" : undefined}
        className="flex h-full flex-col overflow-hidden p-0"
      >
        {/* แถบปกบางๆ ให้แต่ละช่องดูต่างกันตั้งแต่ยังไม่อ่านชื่อ */}
        <div className="relative h-20 overflow-hidden">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover opacity-70 transition-opacity duration-500 group-hover:opacity-90"
            />
          ) : (
            <span className="absolute inset-0 bg-[radial-gradient(120%_140%_at_20%_0%,rgb(var(--accent)/0.22),transparent_62%)]" />
          )}
          <span className="grain pointer-events-none absolute inset-0 opacity-50" />
        </div>

        <div className="flex flex-1 flex-col p-5 pt-0">
          {/* รูปช่องคร่อมขอบปก ให้การ์ดมีจุดรวมสายตาจุดเดียว */}
          <span className="-mt-8 mb-3 grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-hair bg-ink">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-xl text-iris">
                {(channel.name || handle).slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>

          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-base text-ice transition-colors group-hover:text-iris">
                {channel.name || `@${handle}`}
              </p>
              <p className="num mt-0.5 truncate text-xs text-muted">@{handle}</p>
            </div>
            {live && (
              <Badge rgb="255 91 122" tone="live">
                ไลฟ์อยู่
              </Badge>
            )}
          </div>

          {channel.tagline && (
            <p className="mt-2 line-clamp-2 text-sm text-muted">{channel.tagline}</p>
          )}

          <span className="rule my-4 block h-px" />

          <span className="mt-auto flex items-center gap-2 font-display text-xs text-iris">
            <IconMusic className="h-3.5 w-3.5" />
            ขอเพลงกับช่องนี้
            <span aria-hidden className="ml-auto transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </span>
        </div>
      </Panel>
    </Link>
  );
}
