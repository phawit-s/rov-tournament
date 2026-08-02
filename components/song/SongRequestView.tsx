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
import { ArtCalendar, Badge, EmptyNote, EmptyState } from "../tournament/ui";
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

  return (
    <div className="space-y-6">
      {/* ---------- หัวหน้า: บอกว่านี่คือช่องไหน ---------- */}
      <Panel variant="feature" interactive={false} className="overflow-hidden p-0">
        <div className="relative">
          <div className="scene-base absolute inset-0 z-0 overflow-hidden">
            {cover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-full w-full object-cover opacity-40" />
            )}
            <span className="grain pointer-events-none absolute inset-0 opacity-60" />
            <RingCluster size={220} className="absolute -top-14 -right-14 opacity-35" />
          </div>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              background:
                "linear-gradient(0deg, var(--color-ink) 6%, color-mix(in srgb, var(--color-ink) 70%, transparent) 55%, transparent 100%)",
            }}
          />
          <Corners len={16} o={0.3} />

          <div className="relative z-10 flex flex-wrap items-center gap-4 p-6 sm:p-7">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt=""
                className="h-14 w-14 shrink-0 rounded-2xl object-cover sm:h-16 sm:w-16"
              />
            ) : (
              <span className="tile grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-display text-xl text-champagne sm:h-16 sm:w-16">
                {(channel.name || channel.handle || "?").slice(0, 1).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="slug">ขอเพลงกับ</p>
              <h2 className="mt-1 truncate font-display text-h2 leading-tight font-light text-ice">
                {channel.name || channel.handle}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                {channel.handle && <span className="num">@{channel.handle}</span>}
                {songs.enabled ? (
                  <Badge rgb="77 181 145" tone="live">
                    เปิดรับเพลง
                  </Badge>
                ) : (
                  <Badge rgb="146 151 172">ปิดรับอยู่</Badge>
                )}
              </div>
            </div>

            {/* ทางไปหน้าสนับสนุน — คนละเรื่องกัน แต่ต้องไปหากันเจอ */}
            {supportOn && (
              <Link
                href={`/c/#h=${channel.handle || channel.id}`}
                className="hover-tile tile shrink-0 rounded-xl px-4 py-2.5 font-display text-xs text-ice/85 transition-colors hover:text-champagne"
              >
                สนับสนุนช่อง →
              </Link>
            )}
          </div>
        </div>
      </Panel>

      {/* ---------- เนื้อหา ---------- */}
      {songs.enabled ? (
        <SongRequestPanel channel={channel} bare />
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
                className="font-display text-sm text-champagne hover:underline"
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
