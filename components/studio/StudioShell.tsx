"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { useLive } from "@/lib/backend/live";
import { watchStreamerRequests, type StreamerRequest } from "@/lib/backend/roles";
import { safeImageSrc } from "@/lib/safe";
import type { Channel } from "@/lib/channel/types";
import { ROLE_LABEL, useSiteRole, type RoleInfo } from "@/hooks/useRole";
import { studioHref, useStudioChannel } from "@/hooks/useStudioChannel";
import AuthPanel from "@/components/auth/AuthPanel";
import ProfileGate from "@/components/auth/ProfileGate";
import { AccountMenu, Avatar, Wordmark } from "@/components/SiteHeader";
import ThemeToggle from "@/components/ui/ThemeToggle";
import ToastHost, { toast } from "@/components/ui/Toast";
import { IconArrowLeft, IconCheck, IconChevronDown, IconSearch } from "@/components/ui/icons";
import { EmptyState, Skeleton } from "@/components/ui/kit";
import StreamerRequestPanel from "./StreamerRequest";
import { isStudioActive, studioNavFor, type StudioItem } from "./nav";

const NO_REQUESTS: StreamerRequest[] = [];

/**
 * เปลือกของสตูดิโอ (หลังบ้านของสตรีมเมอร์)
 *
 * จอกว้าง: แถบข้างถาวร — ชื่อเว็บ ตัวเลือกช่อง เมนู บัญชี
 * มือถือ: แถบบน + แถบเมนูเลื่อนแนวนอนใต้แถบบน (ไม่มีลิ้นชักให้ต้องกดเปิดก่อน
 * สตรีมเมอร์ที่จัดคิวจากมือถือระหว่างไลฟ์ต้องสลับหน้าได้ด้วยนิ้วเดียว)
 *
 * ทุกลิงก์ในเมนูพา #c= (ช่องที่เลือก) ติดไปด้วย — ดู hooks/useStudioChannel.ts
 */
export default function StudioShell({ children }: { children: ReactNode }) {
  const info = useSiteRole();
  const admin = info.admin;

  /* งานค้างของผู้ดูแล — ท่อเดียวใช้ร่วมกับหน้าสตรีมเมอร์ */
  const { data: requests } = useLive<StreamerRequest[]>(
    admin && hasBackend ? "streamerRequests" : null,
    NO_REQUESTS,
    (onChange, onError) => watchStreamerRequests(onChange, onError),
  );
  const pending = requests.filter((r) => r.status === "pending").length;

  if (!info.studio) {
    return (
      <>
        <StudioLocked info={info} />
        <ToastHost />
      </>
    );
  }

  return (
    <div className="min-h-dvh lg:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line lg:flex">
        <div className="px-5 pt-4">
          <Wordmark />
        </div>
        <div className="px-3 pt-3">
          <ChannelPicker />
        </div>
        <nav aria-label="เมนูสตูดิโอ" className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3">
          <NavItems admin={admin} pending={pending} layout="rail" />
        </nav>
        <SidebarAccount info={info} />
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:hidden">
          <div className="flex h-14 items-center gap-1 px-4">
            <Wordmark />
            <span className="flex-1" />
            <ThemeToggle />
            <MobileAccount info={info} />
          </div>
          <div className="px-4 pb-2 empty:hidden">
            <ChannelPicker compact />
          </div>
          <nav aria-label="เมนูสตูดิโอ" className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2.5">
            <NavItems admin={admin} pending={pending} layout="tabs" />
          </nav>
        </header>

        <main className="mx-auto w-full max-w-[960px] px-5 pt-7 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:px-8 lg:pt-10">
          <ProfileGate>{children}</ProfileGate>
        </main>
      </div>

      <ToastHost />
    </div>
  );
}

/* =========================================================================
   เมนู
   ========================================================================= */

function NavItems({
  admin,
  pending,
  layout,
}: {
  admin: boolean;
  pending: number;
  layout: "rail" | "tabs";
}) {
  const pathname = usePathname();
  const { channel } = useStudioChannel();

  return (
    <>
      {studioNavFor(admin).map((item) => (
        <NavLink
          key={item.href}
          item={item}
          on={isStudioActive(item.href, pathname)}
          channelId={channel?.id}
          count={item.badge === "streamerRequests" ? pending : 0}
          layout={layout}
        />
      ))}
    </>
  );
}

function NavLink({
  item,
  on,
  channelId,
  count,
  layout,
}: {
  item: StudioItem;
  on: boolean;
  channelId?: string;
  count: number;
  layout: "rail" | "tabs";
}) {
  /* ตัวเล่นใช้ #ch= (ตามลิงก์ที่แจกไปก่อนหน้านี้) หน้าในสตูดิโอใช้ #c= */
  const href = item.external
    ? channelId
      ? `${item.href}#ch=${channelId}`
      : item.href
    : studioHref(item.href, channelId);

  const look =
    layout === "rail"
      ? `flex min-h-11 items-center gap-3 rounded-xl px-3 ${on ? "bg-fill font-semibold" : "text-muted hover:bg-fill hover:text-ink"}`
      : `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm ${on ? "bg-ink font-semibold text-onink" : "bg-fill text-ink"}`;

  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener" : undefined}
      className={`transition-colors ${look}`}
    >
      {layout === "rail" && <item.Icon className="h-5 w-5 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count > 0 && (
        <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-live px-1.5 text-xs font-semibold text-white">
          {count}
        </span>
      )}
      {item.external && layout === "rail" && (
        <span className="text-xs font-normal text-faint">หน้าต่างใหม่</span>
      )}
    </Link>
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

function SidebarAccount({ info }: { info: RoleInfo }) {
  const user = useUser();
  if (!user) return null;
  return (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-3 px-2 py-1.5">
        <Avatar user={user} className="h-9 w-9" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block text-sm text-muted">{ROLE_LABEL[info.role]}</span>
        </span>
        <ThemeToggle />
      </div>
      <div className="mt-1 flex gap-1">
        <Link
          href="/"
          className="flex min-h-10 flex-1 items-center justify-center rounded-xl text-sm text-muted transition-colors hover:bg-fill hover:text-ink"
        >
          หน้าเว็บ
        </Link>
        <Link
          href="/account/"
          className="flex min-h-10 flex-1 items-center justify-center rounded-xl text-sm text-muted transition-colors hover:bg-fill hover:text-ink"
        >
          โปรไฟล์
        </Link>
        <button
          type="button"
          onClick={() =>
            void authStore
              .signOut()
              .then(() => toast("ออกจากระบบแล้ว", "success"))
              .catch(() => toast("ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง", "error"))
          }
          className="flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-xl text-sm text-muted transition-colors hover:bg-fill hover:text-danger"
        >
          ออกจากระบบ
        </button>
      </div>
    </div>
  );
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
