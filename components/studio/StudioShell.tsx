"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { useLive } from "@/lib/backend/live";
import { watchStreamerRequests, type StreamerRequest } from "@/lib/backend/roles";
import { repairDuplicatedHash } from "@/lib/hash";
import { safeImageSrc } from "@/lib/safe";
import type { Channel } from "@/lib/channel/types";
import { useSiteRole, type RoleInfo } from "@/hooks/useRole";
import { studioHref, useStudioChannel } from "@/hooks/useStudioChannel";
import AuthPanel from "@/components/auth/AuthPanel";
import ProfileGate from "@/components/auth/ProfileGate";
import { AccountMenu, Wordmark } from "@/components/SiteHeader";
import ThemeToggle from "@/components/ui/ThemeToggle";
import ToastHost from "@/components/ui/Toast";
import { IconArrowLeft, IconCheck, IconChevronDown, IconSearch } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/kit";
import StreamerRequestPanel from "./StreamerRequest";
import { isStudioActive, studioNavFor } from "./nav";
import StudioPlayer from "./StudioPlayer";
import Dock, { type DockItem } from "@/components/ui/Dock";

const NO_REQUESTS: StreamerRequest[] = [];

/**
 * เปลือกของสตูดิโอ (หลังบ้านของสตรีมเมอร์)
 *
 * บน: ชื่อเว็บ · ตัวเลือกช่อง · ธีม · บัญชี
 * ล่าง: dock เมนู (ต.ค. 2569 แทนแถบข้างกับแถบแท็บเดิม) ลอยกลางจอ — บนมือถืออยู่ระดับ
 * นิ้วโป้ง สตรีมเมอร์ที่จัดคิวจากมือถือระหว่างไลฟ์สลับหน้าได้ด้วยนิ้วเดียว
 *
 * ตัวเล่นถูกวางที่นี่ ไม่ได้อยู่ในหน้า /studio/queue/ — ดูเหตุผลใน StudioPlayer
 *
 * ทุกลิงก์ในเมนูพา #c= (ช่องที่เลือก) ติดไปด้วย — ดู hooks/useStudioChannel.ts
 */
export default function StudioShell({ children }: { children: ReactNode }) {
  const info = useSiteRole();
  const admin = info.admin;
  const pathname = usePathname();
  const { channel } = useStudioChannel();

  /* งานค้างของผู้ดูแล — ท่อเดียวใช้ร่วมกับหน้าสตรีมเมอร์ */
  const { data: requests } = useLive<StreamerRequest[]>(
    admin && hasBackend ? "streamerRequests" : null,
    NO_REQUESTS,
    (onChange, onError) => watchStreamerRequests(onChange, onError),
  );
  const pending = requests.filter((r) => r.status === "pending").length;

  /*
    เปิดตัวเล่นครั้งแรกที่เข้าหน้าคิว แล้วเก็บไว้ตลอดทั้งแท็บ — สลับไปหน้าอื่นเพลงต้องไม่หยุด
    ไม่เปิดตั้งแต่หน้าแรกของสตูดิโอ: คนที่แค่เข้ามาแก้ชื่อช่องไม่ควรได้ตัวเล่นที่แย่งสิทธิ์เล่น
    (ปรับ state ตอน render ตามแบบที่ React แนะนำ ไม่ใช่ setState ใน effect)
  */
  /*
    ล้าง #c=...#c=... ที่ซ้อนกันหลังกดเมนู — Next 16 ต่อ hash ของลิงก์ใหม่เข้ากับที่อยู่เดิม
    (ดู lib/hash.ts) ตัวอ่านค่ายึดก้อนท้ายอยู่แล้ว ตรงนี้แค่ทำให้ลิงก์สะอาดพอจะก๊อปไปแปะต่อ
    หน้าสาธารณะทำที่ AppShell แต่สตูดิโอมีเปลือกของตัวเอง จึงต้องทำซ้ำที่นี่
  */
  useEffect(() => {
    repairDuplicatedHash();
    window.addEventListener("hashchange", repairDuplicatedHash);
    return () => window.removeEventListener("hashchange", repairDuplicatedHash);
  }, [pathname]);

  const onQueue = isStudioActive("/studio/queue/", pathname);
  const [playerOn, setPlayerOn] = useState(onQueue);
  if (onQueue && !playerOn) setPlayerOn(true);

  if (!info.studio) {
    return (
      <>
        <StudioLocked info={info} />
        <ToastHost />
      </>
    );
  }

  const dockItems: DockItem[] = studioNavFor(admin).map((item) => ({
    id: item.href,
    /* หน้าต่างแยกของตัวเล่นใช้ #ch= (ลิงก์ที่แจกไปแล้ว) หน้าในสตูดิโอใช้ #c= */
    href: item.external
      ? channel
        ? `${item.href}#ch=${channel.id}`
        : item.href
      : studioHref(item.href, channel?.id),
    label: item.label,
    short: item.short,
    Icon: item.Icon,
    active: isStudioActive(item.href, pathname),
    badge: item.badge === "streamerRequests" ? pending : 0,
    external: item.external,
  }));

  return (
    <div className="min-h-dvh">
      {/* พื้นทึบ ไม่เบลอ — แถบนี้ลอยทับวิดีโอที่กำลังเล่นทั้งไลฟ์ backdrop-filter ต้องเบลอใหม่
          ทุกเฟรมของวิดีโอ ซึ่งคือการ์ดจอของเครื่องที่กำลังเข้ารหัสสตรีมอยู่พอดี */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-2 px-4 sm:gap-4 sm:px-8">
          <Wordmark />
          <div className="hidden w-72 min-w-0 sm:block">
            <ChannelPicker />
          </div>
          <span className="flex-1" />
          <ThemeToggle />
          <MobileAccount info={info} />
        </div>
        <div className="px-4 pb-2 empty:hidden sm:hidden">
          <ChannelPicker compact />
        </div>
      </header>

      {/* เว้นท้ายหน้าเท่าความสูง dock ไม่งั้นแถวสุดท้ายของทุกหน้าอยู่ใต้ dock กดไม่ได้ */}
      <main
        className={`mx-auto w-full px-5 pt-7 pb-[calc(var(--dock-space,5.5rem)+2rem+env(safe-area-inset-bottom))] sm:px-8 lg:pt-10 ${
          onQueue ? "max-w-[1280px]" : "max-w-[960px]"
        }`}
      >
        <ProfileGate>
          {playerOn && (
            <div
              /*
                หน้าอื่น: ย้ายออกนอกจอแต่ยังมีขนาดจริง (ไม่ใช่ display:none)
                YouTube ที่ฝังอยู่ในกล่องที่ไม่มีขนาดเริ่มเล่นไม่ได้ในบางเบราว์เซอร์
                inert = กด/โฟกัส/โปรแกรมอ่านจอเข้าไม่ถึง
              */
              className={onQueue ? "" : "pointer-events-none fixed top-0 -left-[200vw] w-[960px]"}
              aria-hidden={!onQueue}
              inert={!onQueue}
            >
              <StudioPlayer visible={onQueue} />
            </div>
          )}
          {children}
        </ProfileGate>
      </main>

      <Dock items={dockItems} label="เมนูสตูดิโอ" />
      <ToastHost />
    </div>
  );
}

/* =========================================================================
   ตัวเลือกช่อง
   ========================================================================= */

/**
 * ช่องที่กำลังทำงานด้วย — กดแล้วกางรายการช่องให้สลับ
 *
 * สตรีมเมอร์ส่วนใหญ่มีช่องเดียว ตัวเลือกจึงเป็นแค่ป้ายชื่อช่องที่กดไม่ได้
 * ผู้ดูแลเห็นทุกช่อง ช่องของคนอื่นมีชื่อเจ้าของกำกับ กันแก้ผิดช่อง
 */
function ChannelPicker({ compact = false }: { compact?: boolean }) {
  const { channels, channel, editingOther, select, loaded } = useStudioChannel();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  /* เปลี่ยนหน้าแล้วปิด — ปรับ state ระหว่างเรนเดอร์ ไม่ใช่ setState ใน effect */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!loaded) return compact ? null : <Skeleton className="h-14 w-full rounded-xl" />;
  if (channels.length === 0) return null;

  const switchable = channels.length > 1;
  /* มือถือ: ช่องเดียวไม่ต้องกินที่แถวหนึ่งเต็มๆ เพื่อบอกชื่อที่เปลี่ยนไม่ได้ */
  if (compact && !switchable) return null;
  const needle = q.trim().toLocaleLowerCase("th");
  const shown = needle
    ? channels.filter((c) =>
        [c.name, c.handle, c.ownerEmail ?? ""].join(" ").toLocaleLowerCase("th").includes(needle),
      )
    : channels;

  const label = channel ? channel.name || channel.handle || "ช่องที่ยังไม่ตั้งชื่อ" : "เลือกช่อง";

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={!switchable}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl text-left transition-colors enabled:cursor-pointer enabled:hover:bg-fill ${
          compact ? "min-h-11 bg-fill px-3" : "min-h-14 px-2"
        }`}
      >
        <ChannelAvatar channel={channel} size={compact ? "h-7 w-7" : "h-9 w-9"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{label}</span>
          {!compact && (
            <span className="block truncate text-sm text-muted">
              {editingOther
                ? `ของ ${channel?.ownerEmail?.split("@")[0] ?? "คนอื่น"}`
                : channel?.handle
                  ? `@${channel.handle}`
                  : "ยังไม่ได้ตั้งชื่อลิงก์"}
            </span>
          )}
        </span>
        {switchable && <IconChevronDown className="h-4 w-4 shrink-0 text-muted" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 left-0 z-50 mt-1 max-h-[70dvh] overflow-y-auto rounded-sheet bg-paper p-2 shadow-float ring-1 ring-line lg:right-auto lg:w-80"
          >
            {channels.length > 8 && (
              <label className="mb-1 flex min-h-11 items-center gap-2 rounded-xl bg-fill px-3">
                <IconSearch className="h-4 w-4 text-muted" />
                <span className="sr-only">ค้นหาช่อง</span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ค้นหาช่อง"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
                />
              </label>
            )}
            <ul role="listbox" aria-label="ช่อง">
              {shown.map((c) => (
                <ChannelOption
                  key={c.id}
                  channel={c}
                  on={c.id === channel?.id}
                  onPick={() => {
                    select(c.id);
                    setOpen(false);
                    setQ("");
                  }}
                />
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChannelOption({
  channel,
  on,
  onPick,
}: {
  channel: Channel;
  on: boolean;
  onPick: () => void;
}) {
  const { uid } = useSiteRole();
  const other = channel.ownerUid !== uid;
  return (
    <li role="option" aria-selected={on}>
      <button
        type="button"
        onClick={onPick}
        className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-fill"
      >
        <ChannelAvatar channel={channel} size="h-8 w-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">
            {channel.name || channel.handle || "ช่องที่ยังไม่ตั้งชื่อ"}
          </span>
          <span className="block truncate text-sm text-muted">
            {other ? `ของ ${channel.ownerEmail?.split("@")[0] ?? "คนอื่น"}` : "ช่องของคุณ"}
          </span>
        </span>
        {on && <IconCheck className="h-4 w-4 shrink-0" strokeWidth={2.2} />}
      </button>
    </li>
  );
}

export function ChannelAvatar({
  channel,
  size = "h-9 w-9",
}: {
  channel: Channel | null;
  size?: string;
}) {
  const src = channel?.avatar ? safeImageSrc(channel.avatar) : null;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`${size} shrink-0 rounded-full bg-fill object-cover`} />;
  }
  const letter = (channel?.name || channel?.handle || "?").slice(0, 1).toUpperCase();
  return (
    <span className={`${size} grid shrink-0 place-items-center rounded-full bg-fill text-sm font-bold text-muted`}>
      {letter}
    </span>
  );
}

/* =========================================================================
   บัญชี
   ========================================================================= */

function useUser() {
  useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getServerSnapshot);
  return authStore.user();
}

function MobileAccount({ info }: { info: RoleInfo }) {
  const user = useUser();
  if (!user) return null;
  return <AccountMenu user={user} studio={info.studio} role={info.role} />;
}

/* =========================================================================
   ประตู — คนที่ยังไม่มีสิทธิ์เห็นหน้านี้แทนสตูดิโอ
   ========================================================================= */

function StudioLocked({ info }: { info: RoleInfo }) {
  if (!hasBackend) {
    return (
      <LockedFrame>
        <EmptyState
          title="เว็บนี้ยังไม่ได้เชื่อมฐานข้อมูล"
          description="ตั้งค่า Firebase ใน .env.local แล้ว build ใหม่ สตูดิโอถึงจะใช้ได้"
        />
      </LockedFrame>
    );
  }

  if (info.loading) {
    return (
      <LockedFrame>
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-6 h-12 w-full rounded-full" />
        </div>
      </LockedFrame>
    );
  }

  if (!info.signedIn) {
    return (
      <LockedFrame>
        <AuthPanel
          title="สตูดิโอสำหรับสตรีมเมอร์"
          description="เข้าสู่ระบบเพื่อจัดคิวเพลงของช่องคุณ ถ้ายังไม่เคยเปิดคิว จะพาไปขอสิทธิ์ต่อเลย"
        />
      </LockedFrame>
    );
  }

  // ล็อกอินแล้วแต่ยังเป็นผู้ใช้ทั่วไป — ทางเดียวต่อไปคือยื่นคำขอ
  return (
    <LockedFrame>
      <StreamerRequestPanel />
    </LockedFrame>
  );
}

/** กรอบเรียบของหน้าประตู — ทางกลับหน้าเว็บกับปุ่มธีม ไม่มีเมนูให้หลง */
function LockedFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="flex shrink-0 items-center gap-2 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <Link
          href="/"
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium text-muted transition-colors hover:text-ink"
        >
          <IconArrowLeft className="h-4 w-4" />
          กลับหน้าเว็บ
        </Link>
        <span className="flex-1" />
        <ThemeToggle />
      </div>
      <div className="flex grow flex-col justify-center py-8">{children}</div>
    </div>
  );
}
