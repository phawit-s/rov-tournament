"use client";

import { useState } from "react";
import Link from "next/link";
import { useOpenQueue } from "@/hooks/useSong";
import { studioHref, useStudioChannel } from "@/hooks/useStudioChannel";
import { setChannelLive } from "@/lib/channel/store";
import { setSongsEnabled } from "@/lib/song/config";
import { splitQueue } from "@/lib/song/store";
import { DEFAULT_SONG_CONFIG } from "@/lib/song/types";
import type { Channel } from "@/lib/channel/types";
import LinkRow from "../ui/LinkRow";
import { SwitchRow } from "../ui/Switch";
import { toast } from "../ui/Toast";
import { EmptyState, Skeleton } from "../ui/kit";
import Stage from "../song/Stage";
import PageHead from "./PageHead";

/**
 * ภาพรวมของสตูดิโอ — หน้าที่สตรีมเมอร์เปิดค้างไว้ระหว่างไลฟ์
 *
 * ตอบสามคำถามที่ถามบ่อยที่สุดตอนไลฟ์ โดยไม่ต้องกดไปไหน:
 * ตอนนี้เปิดเพลงอะไรอยู่ · ยังรับคำขออยู่ไหม · คนดูต้องเข้าลิงก์ไหน
 * ทุกอย่างที่เหลือ (จัดคิว ตั้งค่า OBS) อยู่ห่างไปหนึ่งคลิก
 */
export default function StudioHome() {
  const { channel, channels, loaded, missingId, admin } = useStudioChannel();

  if (!loaded) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="aspect-video w-full max-w-xl rounded-stage" />
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="space-y-8">
        <PageHead title="สตูดิโอ" />
        {missingId ? (
          <EmptyState
            title="ไม่พบช่องนี้"
            description="ลิงก์นี้ชี้ไปที่ช่องที่ไม่มีแล้ว อาจถูกลบหรือคัดลอกรหัสมาไม่ครบ เลือกช่องจากเมนูด้านข้างแทน"
          />
        ) : admin && channels.length > 0 ? (
          <EmptyState
            title="เลือกช่องที่จะดูแล"
            description="บัญชีนี้ยังไม่มีช่องของตัวเอง เลือกช่องที่จะเข้าไปช่วยจัดคิวจากตัวเลือกช่องด้านบน หรือเปิดช่องของคุณเอง"
            action={<NewChannelLink />}
          />
        ) : (
          <EmptyState
            title="เปิดคิวเพลงให้ช่องของคุณ"
            description="ตั้งชื่อช่องกับชื่อลิงก์ แล้วเปิดรับเพลง คนดูจะขอเพลงผ่านลิงก์หรือ QR ของช่องคุณได้ทันที"
            action={<NewChannelLink />}
          />
        )}
      </div>
    );
  }

  return <Overview channel={channel} />;
}

function NewChannelLink() {
  return (
    <Link
      href="/studio/channel/"
      className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink transition-opacity hover:opacity-85"
    >
      ตั้งค่าช่องของฉัน
    </Link>
  );
}

function Overview({ channel }: { channel: Channel }) {
  const config = { ...DEFAULT_SONG_CONFIG, ...channel.songs };
  const { queue } = useOpenQueue(channel.id);
  const { playing, queued } = splitQueue(queue);
  const [busy, setBusy] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);

  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";
  const requestUrl = channel.handle ? `${origin}/song/#h=${channel.handle}` : null;
  const playerHref = `/player/#ch=${channel.id}`;

  /* เปิด/ปิดรับมีผลทันที (เขียนตรงลงช่อง) ไม่ต้องผ่านปุ่มบันทึกของหน้าตั้งค่า
     — ปิดรับกลางไลฟ์แล้วต้องปิดเดี๋ยวนั้น */
  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await setSongsEnabled(channel.id, next);
      toast(next ? "เปิดรับเพลงแล้ว" : "ปิดรับเพลงแล้ว", "success");
    } catch {
      toast("เปลี่ยนไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่", "error");
    } finally {
      setBusy(false);
    }
  };

  /* ป้าย "ไลฟ์อยู่" — ขึ้นที่หน้าแรกกับหน้าขอเพลงทันที ช่องที่ไลฟ์อยู่ถูกดันขึ้นก่อน */
  const toggleLive = async (next: boolean) => {
    setLiveBusy(true);
    try {
      await setChannelLive(channel.id, next);
      toast(next ? "ขึ้นป้ายไลฟ์อยู่แล้ว" : "เอาป้ายไลฟ์ออกแล้ว", "success");
    } catch {
      toast("เปลี่ยนไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่", "error");
    } finally {
      setLiveBusy(false);
    }
  };

  return (
    <div className="space-y-10">
      <PageHead
        title={channel.name || channel.handle || "ช่องของคุณ"}
        description={channel.handle ? `@${channel.handle}` : "ยังไม่ได้ตั้งชื่อลิงก์ของช่อง"}
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Stage
          song={playing}
          empty={
            <>
              <p className="text-lg font-bold">ยังไม่มีเพลงที่กำลังเล่น</p>
              <p className="mt-1 text-muted">
                เปิดตัวเล่นทิ้งไว้อีกหน้าต่าง พอมีคนขอเพลง ตัวเล่นจะเปิดให้เอง
              </p>
            </>
          }
          footer={
            <div className="mt-5 flex flex-wrap gap-2 px-1">
              <a
                href={playerHref}
                target="_blank"
                rel="noopener"
                className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink transition-opacity hover:opacity-85"
              >
                เปิดตัวเล่น
              </a>
              <Link
                href={studioHref("/studio/queue/", channel.id)}
                className="inline-flex min-h-11 items-center rounded-full bg-canvas/70 px-5 font-medium transition-colors hover:bg-canvas"
              >
                จัดคิว
                <span className="num ml-2 text-muted">{queued.length}</span>
              </Link>
            </div>
          }
        />

        <div className="min-w-0 space-y-8">
          <section aria-labelledby="accept-title">
            <h2 id="accept-title" className="text-title font-bold">
              ระหว่างไลฟ์
            </h2>
            <p className="mt-1 text-sm text-muted">สองอย่างนี้มีผลทันที ไม่ต้องกดบันทึก</p>
            <div className="rows mt-2">
              <SwitchRow
                checked={config.enabled}
                onChange={(v) => !busy && void toggle(v)}
                label="รับคำขอเพลง"
                hint={
                  config.enabled
                    ? "เปิดอยู่ คนดูส่งเพลงเข้าคิวได้"
                    : "ปิดอยู่ คนดูเปิดหน้าขอเพลงได้แต่ส่งเพลงไม่ได้"
                }
              />
              <SwitchRow
                checked={!!channel.live?.isLive}
                onChange={(v) => !liveBusy && void toggleLive(v)}
                label="ป้ายไลฟ์อยู่"
                hint={
                  channel.live?.url
                    ? "โชว์ป้ายไลฟ์บนหน้าขอเพลง กดแล้วพาไปดูไลฟ์"
                    : "ใส่ลิงก์ไลฟ์ที่หน้าตั้งค่าช่องด้วย ป้ายถึงจะพาไปดูไลฟ์ได้"
                }
              />
            </div>
          </section>

          <section aria-labelledby="link-title">
            <h2 id="link-title" className="text-title font-bold">
              ลิงก์ให้คนดู
            </h2>
            {requestUrl ? (
              <>
                <p className="mt-1 text-sm text-muted">
                  แปะในไลฟ์หรือเอา QR ขึ้นจอ คนดูสแกนแล้วขอเพลงได้เลย
                </p>
                <LinkRow label="หน้าขอเพลง" url={requestUrl} />
              </>
            ) : (
              <p className="mt-2 text-muted">
                ตั้งชื่อลิงก์ของช่องก่อน ลิงก์กับ QR ถึงจะใช้ได้{" "}
                <Link href={studioHref("/studio/channel/", channel.id)} className="font-medium text-ink underline">
                  ไปตั้งค่าช่อง
                </Link>
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
