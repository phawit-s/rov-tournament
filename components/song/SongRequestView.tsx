"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useHashParam } from "@/hooks/useClient";
import { hasBackend } from "@/lib/backend/firebase";
import { findChannelByHandle, watchChannel } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc } from "@/lib/safe";
import { DEFAULT_SONG_CONFIG } from "@/lib/song/types";
import Panel from "../ui/Panel";
import Corners from "../ui/Corners";
import RingCluster from "../fx/RingCluster";
import { ArtCalendar, Badge, EmptyNote, EmptyState, LiveBadge } from "../tournament/ui";
import SongBackdrop from "./SongBackdrop";
import SongRequestPanel from "./SongRequestPanel";

/**
 * หน้าขอเพลงของช่อง — อยู่แยกจากหน้าสนับสนุน
 *
 * เดิมฟอร์มขอเพลงถูกต่อท้ายหน้าโอนเงิน คนเปิดมาแล้วอ่านไม่ออกว่าหน้านี้ให้ทำอะไร
 * ต้องเลื่อนผ่าน QR พร้อมเพย์กับแพ็กเกจสมาชิกทั้งหน้าก่อนถึงจะเจอช่องวางลิงก์
 * ตอนนี้แยกออกมาเป็นหน้าของตัวเอง เปิดมาแล้วเจอช่องวางลิงก์เลย
 */
export default function SongRequestView() {
  const idParam = useHashParam("ch");
  const handleParam = useHashParam("h");

  const [channel, setChannel] = useState<Channel | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  /** คลิปที่กำลังเล่น — ฟอร์มข้างล่างเป็นคนบอกมา เอาไปทำฉากหลังของทั้งหน้า */
  const [nowVideoId, setNowVideoId] = useState<string | null>(null);

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
  if (resolving) return null;

  if (!hasBackend) {
    return <EmptyNote>ระบบขอเพลงต้องเชื่อมหลังบ้านก่อน</EmptyNote>;
  }

  if (!channel) {
    return (
      <EmptyNote>
        ไม่พบช่องนี้ — ลิงก์ต้องมี <code>#h=ชื่อช่อง</code> หรือ <code>#ch=รหัส</code>{" "}
        และเจ้าของต้องกดเผยแพร่ช่องก่อน
      </EmptyNote>
    );
  }

  const songs = { ...DEFAULT_SONG_CONFIG, ...channel.songs };
  const avatar = channel.avatar ? safeImageSrc(channel.avatar) : null;
  const cover = channel.cover ? safeImageSrc(channel.cover) : null;
  const supportOn = channel.donate.enabled || channel.member.enabled;
  /* ป้าย LIVE พาไปดูไลฟ์ได้เลย — คนที่สแกน QR มาส่วนใหญ่ดูอยู่บนอีกแอป
     แต่คนที่ได้ลิงก์ต่อมาจากเพื่อนยังหาทางเข้าไลฟ์ไม่เจอ */
  const live = channel.live.isLive ? channel.live.url : null;

  return (
    <div className="space-y-6">
      {/* ฉากหลังของทั้งหน้า = ปกเพลงที่กำลังเล่น เบลอแล้วไหลช้าๆ
          หน้านี้ผูกกับไลฟ์ที่กำลังเปิดอยู่จริง ฉากหลังจึงควรเปลี่ยนตามไปด้วย */}
      <SongBackdrop videoId={nowVideoId} />
      {/* ---------- หัวหน้า: บอกว่านี่คือช่องไหน ----------

          เตี้ยกว่าเดิมมาก เพราะหน้านี้เปิดจากมือถือเป็นหลัก (สแกน QR บนไลฟ์)
          พื้นที่แนวตั้งทุกพิกเซลที่หัวกินไป คือช่องวางลิงก์ที่ถูกดันตกขอบจอ

          รูปปกใช้เป็นฉากหลังเบลอ ไม่ใช่แบนเนอร์เต็มใบ — ได้บรรยากาศของช่อง
          โดยไม่ต้องเสียความสูงให้ภาพที่ไม่มีข้อมูลอะไรเลย */}
      <Panel variant="feature" interactive={false} className="overflow-hidden p-0">
        <div className="relative">
          <div className="scene-base absolute inset-0 z-0 overflow-hidden">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cover}
                alt=""
                aria-hidden
                className="h-full w-full scale-110 object-cover opacity-45"
                style={{ filter: "blur(22px) saturate(1.3)" }}
              />
            )}
            <span className="grain pointer-events-none absolute inset-0 opacity-60" />
            <RingCluster size={200} className="absolute -top-16 -right-12 opacity-30" />
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background:
                "linear-gradient(0deg, var(--color-ink) 4%, color-mix(in srgb, var(--color-ink) 72%, transparent) 60%, color-mix(in srgb, var(--color-ink) 35%, transparent) 100%)",
            }}
          />
          <Corners len={16} o={0.3} />

          <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-3 p-5 sm:p-6">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-1 ring-iris/35"
              />
            ) : (
              <span className="tile grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-display text-xl text-iris ring-1 ring-iris/35">
                {(channel.name || channel.handle || "?").slice(0, 1).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              {/* ทางกลับไปสารบัญ — คนที่มาจาก /songs/ ต้องเปลี่ยนช่องได้โดยไม่ต้อง
                  กดย้อนของเบราว์เซอร์ ส่วนคนที่สแกน QR มาตรงๆ ก็ได้รู้ว่ามีช่องอื่นอยู่ */}
              <Link
                href="/songs/"
                className="slug inline-block transition-colors hover:text-iris"
              >
                ขอเพลงกับ · เลือกช่องอื่น
              </Link>
              <h2 className="mt-0.5 truncate font-display text-2xl leading-tight font-light text-ice sm:text-3xl">
                {channel.name || channel.handle}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                {channel.handle && <span className="num">@{channel.handle}</span>}
                {songs.enabled ? (
                  <Badge rgb="52 227 176" tone="live">
                    เปิดรับเพลง
                  </Badge>
                ) : (
                  <Badge rgb="126 130 153">ปิดรับอยู่</Badge>
                )}
                {live && (
                  <LiveBadge url={live} title={undefined} />
                )}
              </div>
            </div>

            {/* ทางไปหน้าสนับสนุน — คนละเรื่องกัน แต่ต้องไปหากันเจอ */}
            {supportOn && (
              <Link
                href={`/c/#h=${channel.handle || channel.id}`}
                className="hover-tile tile min-h-11 shrink-0 rounded-xl px-4 py-2.5 font-display text-xs text-ice/85 transition-colors hover:text-iris"
              >
                สนับสนุนช่อง →
              </Link>
            )}
          </div>
        </div>
      </Panel>

      {/* ---------- เนื้อหา ---------- */}
      {songs.enabled ? (
        <SongRequestPanel channel={channel} bare onPlayingChange={setNowVideoId} />
      ) : (
        <EmptyState
          art={<ArtCalendar />}
          no="01"
          title="ช่องนี้ยังไม่เปิดรับเพลง"
          description="สตรีมเมอร์ยังไม่ได้เปิดระบบขอเพลง ลองกลับมาใหม่ตอนไลฟ์"
          action={
            supportOn ? (
              <Link
                href={`/c/#h=${channel.handle || channel.id}`}
                className="font-display text-sm text-iris hover:underline"
              >
                ไปหน้าสนับสนุนช่องแทน →
              </Link>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
