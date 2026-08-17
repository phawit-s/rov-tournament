"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { watchStreamerRequests } from "@/lib/backend/roles";
import { watchMyChannels } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { formatThaiDate } from "@/lib/tournament/share";
import { safeImageSrc } from "@/lib/safe";
import { ROLE_LABEL, useSiteRole } from "@/hooks/useRole";
import Panel, { PanelHeader } from "@/components/ui/Panel";
import Reveal, { PageHeading } from "@/components/ui/Reveal";
import Button from "@/components/ui/Button";
import { IconExternal } from "@/components/ui/icons";
import { Badge, EmptyState, Skeleton } from "@/components/tournament/ui";
import { STUDIO_NAV, type StudioItem } from "./nav";

/* อ้างอิงคงที่ ไม่งั้น setState ตอน error จะสร้างอาร์เรย์ใหม่แล้วรีเรนเดอร์ไม่จบ */
const NO_CHANNELS: Channel[] = [];

/**
 * หน้าแรกของสตูดิโอ — ตอบสองคำถามที่ถามทุกครั้งที่เปิดหลังบ้าน
 * "ช่องเราเป็นยังไงอยู่" กับ "จะไปทำอะไรต่อ"
 */
export default function StudioHome() {
  const { role, local } = useSiteRole();
  const admin = role === "admin";

  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const uid = user && !user.anonymous ? user.uid : null;

  const [channels, setChannels] = useState<Channel[]>(NO_CHANNELS);
  const [loading, setLoading] = useState(!!uid);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (!uid) return;
    return watchMyChannels(
      uid,
      (list) => {
        setChannels(list);
        setLoading(false);
      },
      () => {
        setChannels(NO_CHANNELS);
        setLoading(false);
      },
    );
  }, [uid]);

  // ใบคำขอที่ค้างอยู่ — งานของผู้ดูแลที่ไม่ควรปล่อยให้จมอยู่ในเมนู
  useEffect(() => {
    if (!admin) return;
    return watchStreamerRequests(
      (list) => setPending(list.filter((r) => r.status === "pending").length),
      () => setPending(0),
    );
  }, [admin]);

  const shortcuts = STUDIO_NAV.filter(
    (item) => item.href !== "/studio/" && (admin || !item.admin),
  );

  return (
    <div className="space-y-7">
      <PageHeading
        no="09"
        eyebrow="Studio"
        title="สตูดิโอ"
        description="ที่ทำงานของสตรีมเมอร์ — ตั้งค่าช่อง คุมคิวเพลง จับเวลาบนสตรีม และจัดทัวร์นาเมนต์"
        meta={
          <Badge rgb="169 155 255" hex="var(--color-iris)">
            {local && !uid ? "โหมดเครื่องนี้" : ROLE_LABEL[role]}
          </Badge>
        }
      />

      {admin && pending > 0 && (
        <Reveal>
          <Link href="/studio/roles/" className="block">
            <div
              className="tally sunken flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl py-3.5 pr-4 pl-5 transition-colors hover:text-ice"
              style={{ ["--st" as string]: "var(--st-next)" }}
            >
              <span className="slug">รออนุมัติ</span>
              <span className="text-sm text-ice">
                มีคำขอเป็นสตรีมเมอร์ {pending} ใบรอคุณกด
              </span>
              <span className="ml-auto font-display text-xs text-iris">
                ไปดู →
              </span>
            </div>
          </Link>
        </Reveal>
      )}

      {/* ---- ช่องของฉัน ---- */}
      <Reveal index={1}>
        {!hasBackend ? (
          <Panel className="p-6">
            <PanelHeader eyebrow="Channel" title="ช่องของฉัน" />
            <EmptyState
              title="เครื่องนี้ยังไม่ได้เชื่อมคลาวด์"
              description="โหมดนี้ใช้เครื่องมือที่ทำงานในเบราว์เซอร์ได้ทั้งหมด แต่ยังเปิดช่องรับโดเนทไม่ได้"
            />
          </Panel>
        ) : !uid ? (
          /*
            เข้ามาด้วยรหัสผู้จัดในเครื่อง ยังไม่มีบัญชีผูกอยู่
            ช่องเป็นของบัญชี ไม่ใช่ของเครื่อง จึงยังไม่มีอะไรให้โชว์
          */
          <Panel className="p-6">
            <PanelHeader eyebrow="Channel" title="ช่องของฉัน" />
            <EmptyState
              title="ยังไม่ได้ล็อกอิน"
              description="ช่องผูกกับบัญชี ไม่ใช่กับเครื่อง — ล็อกอินก่อนถึงจะตั้งค่าช่องและรับโดเนทได้ · เครื่องมือที่ทำงานในเบราว์เซอร์ (สุ่มทีม วงล้อ จับเวลา widget) ใช้ได้เลยไม่ต้องล็อกอิน"
            />
          </Panel>
        ) : loading ? (
          <Panel className="p-6">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="mt-3 h-5 w-40" />
            <Skeleton className="mt-6 h-20 w-full rounded-xl" />
          </Panel>
        ) : channels.length === 0 ? (
          <Panel variant="feature" className="p-6 sm:p-7">
            <PanelHeader eyebrow="Channel" title="ยังไม่มีช่อง" />
            <p className="text-sm leading-relaxed text-muted">
              ช่องคือที่รวมทุกอย่างของคุณ — พร้อมเพย์สำหรับรับโดเนท แพ็กเกจสมาชิก
              คิวขอเพลง และลิงก์ widget ที่ใช้ได้ตลอดโดยไม่ต้องเปลี่ยนทุกครั้งที่จัดทัวร์ใหม่
            </p>
            <Link href="/studio/channel/" className="mt-5 inline-flex">
              <Button>ตั้งค่าช่องของคุณ</Button>
            </Link>
          </Panel>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {channels.map((c) => (
              <ChannelCard key={c.id} channel={c} />
            ))}
          </div>
        )}
      </Reveal>

      {/* ---- ทางลัด ---- */}
      <Reveal index={2}>
        <div>
          <p className="slug">ไปที่</p>
          <span className="rule mt-3 mb-4 block h-px" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shortcuts.map((item) => (
              <Shortcut key={item.href} item={item} />
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function Shortcut({ item }: { item: StudioItem }) {
  const Icon = item.Icon;
  return (
    <Link href={item.href} className="group block h-full">
      <div className="tile hover-tile flex h-full items-start gap-3 rounded-2xl p-4 transition-colors">
        <span className="sunken grid h-10 w-10 shrink-0 place-items-center rounded-xl text-iris">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-display text-sm text-ice">
            {item.label}
            {item.external && (
              <IconExternal className="h-3 w-3 shrink-0 opacity-50" />
            )}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">
            {item.detail}
          </span>
        </span>
      </div>
    </Link>
  );
}

function ChannelCard({ channel }: { channel: Channel }) {
  const handle = channel.handle?.trim();
  const publicHref = `/c/#h=${handle || channel.id}`;

  return (
    <Panel variant="feature" className="p-6">
      <div className="flex items-start gap-4">
        {channel.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(channel.avatar) ?? ""}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <span className="sunken grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-display text-lg text-iris">
            {(channel.name || handle || "?").slice(0, 1).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 grow">
          <p className="truncate font-display text-lg text-ice">
            {channel.name || "ยังไม่ได้ตั้งชื่อช่อง"}
          </p>
          <p className="num mt-0.5 truncate text-xs text-muted">
            {handle ? `@${handle}` : "ยังไม่ได้ตั้งชื่อในลิงก์"} · แก้ล่าสุด{" "}
            {formatThaiDate(channel.updatedAt)}
          </p>
        </div>

        {channel.live?.isLive && (
          <span
            className="tally shrink-0 rounded-full py-1 pr-3 pl-3.5 text-xs text-ice"
            style={{ ["--st" as string]: "var(--st-live)" }}
          >
            ไลฟ์อยู่
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-1.5">
        {channel.donate?.enabled && <Badge rgb="169 155 255">รับโดเนท</Badge>}
        {channel.member?.enabled && <Badge rgb="196 130 255">สมาชิก</Badge>}
        {channel.songs?.enabled && <Badge rgb="52 227 176">ขอเพลง</Badge>}
        {channel.timer?.enabled && <Badge rgb="110 155 240">จับเวลา</Badge>}
        {!channel.donate?.enabled &&
          !channel.member?.enabled &&
          !channel.songs?.enabled && (
            <span className="text-xs text-muted">ยังไม่ได้เปิดระบบไหนเลย</span>
          )}
      </div>

      <span className="rule my-5 block h-px" />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/studio/channel/">
          <Button size="sm">ตั้งค่าช่อง</Button>
        </Link>
        {handle ? (
          <Link href={publicHref}>
            <Button size="sm" variant="ghost">
              เปิดหน้าสนับสนุน
            </Button>
          </Link>
        ) : (
          <span className="text-xs text-muted">
            ตั้งชื่อในลิงก์ก่อน คนอื่นถึงจะเปิดหน้าสนับสนุนได้
          </span>
        )}
        {channel.songs?.enabled && handle && (
          <Link href={`/song/#h=${handle}`}>
            <Button size="sm" variant="ghost">
              หน้าขอเพลง
            </Button>
          </Link>
        )}
      </div>
    </Panel>
  );
}
