"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BRAND_MONOGRAM } from "@/lib/brand";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { useLive } from "@/lib/backend/live";
import {
  watchStreamerRequests,
  type StreamerRequest,
} from "@/lib/backend/roles";
import { profileStore } from "@/lib/backend/users";
import { recordActivity } from "@/lib/activity";
import { gateStore } from "@/lib/gate";
import { setHashParams, useHashParam } from "@/hooks/useClient";
import { ROLE_LABEL, useSiteRole, type RoleInfo } from "@/hooks/useRole";
import AdminGate from "@/components/auth/AdminGate";
import AuthPanel from "@/components/auth/AuthPanel";
import ProfileGate from "@/components/auth/ProfileGate";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import ThemeSoundButtons from "@/components/ui/ThemeSound";
import ToastHost, { toast } from "@/components/ui/Toast";
import {
  IconArrowLeft,
  IconClose,
  IconExternal,
  IconLogout,
  IconMenu,
  IconSearch,
} from "@/components/ui/icons";
import { Skeleton } from "@/components/tournament/ui";
import StreamerRequestPanel from "./StreamerRequest";
import CommandPalette from "./CommandPalette";
import {
  STUDIO_GROUPS,
  isStudioActive,
  studioNavFor,
  studioPage,
  type StudioItem,
  type StudioSub,
} from "./nav";

/**
 * เปลือกของหลังบ้าน — แถบข้างถาวรบนจอใหญ่ ลิ้นชักบนจอเล็ก
 *
 * ตั้งใจไม่ใช้ AppShell ของหน้าสาธารณะ เพราะสองที่นี้คนละงานกัน:
 * หน้าสาธารณะขายของ (ฉากหลังเคลื่อนไหว หน้าปก แอนิเมชันพลิกหน้า)
 * ส่วนหลังบ้านคือที่ทำงาน — เปิดค้างไว้ทั้งไลฟ์ ต้องนิ่ง เบา และหาเมนูเจอเสมอ
 *
 * สิ่งที่รื้อรอบนี้:
 *  · จอใหญ่มีแถบบนแล้ว — เดิมมีแต่จอเล็ก พอเข้าหน้าลึกๆ แล้วไม่มีอะไรบอกว่า
 *    อยู่ตรงไหน ต้องไล่หาจากแถบข้างเอง
 *  · แถบข้างพับเป็นไอคอนได้ คนที่ทำงานกับตารางกว้างๆ จะได้พื้นที่คืน 12rem
 *  · มีตัวค้นหา (Ctrl/⌘ + K) กระโดดไปหน้าไหนก็ได้โดยไม่ต้องรู้ว่าเมนูอยู่กลุ่มไหน
 *  · งานที่ค้าง (คำขอเป็นสตรีมเมอร์) ขึ้นเป็นตัวเลขบนเมนู ไม่ต้องเข้าไปเช็คเอง
 */
const NO_REQUESTS: StreamerRequest[] = [];

/**
 * สถานะพับ/กางของแถบข้าง — เก็บในเครื่อง เพราะเป็นความชอบของ "โต๊ะทำงาน" ตัวนั้น
 * ไม่ใช่ของบัญชี คนเดียวกันใช้จอ 27 นิ้วที่บ้านกับโน้ตบุ๊ก 13 นิ้วนอกบ้าน
 * ก็ต้องการคนละแบบ
 *
 * ทำเป็น external store แทน useState + effect เพราะหน้านี้เป็น static export —
 * ฝั่งเซิร์ฟเวอร์ไม่มีทางรู้ค่าในเครื่อง getServerSnapshot จึงต้องคืน "กาง" เสมอ
 * แล้วให้ React สลับให้เองหลัง hydrate โดยไม่ฟ้อง mismatch
 */
const RAIL_KEY = "tourney-hub/studio-rail";
const railListeners = new Set<() => void>();
let railCache: boolean | null = null;

const railStore = {
  subscribe(onChange: () => void) {
    railListeners.add(onChange);
    return () => {
      railListeners.delete(onChange);
    };
  },
  getSnapshot(): boolean {
    if (railCache === null) {
      try {
        railCache = localStorage.getItem(RAIL_KEY) === "1";
      } catch {
        railCache = false;
      }
    }
    return railCache;
  },
  getServerSnapshot: () => false,
  toggle() {
    const next = !railStore.getSnapshot();
    railCache = next;
    try {
      localStorage.setItem(RAIL_KEY, next ? "1" : "0");
    } catch {
      /* โหมดส่วนตัวเขียนไม่ได้ ก็ใช้แค่รอบนี้ */
    }
    railListeners.forEach((l) => l());
  },
};

export default function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/studio";
  const info = useSiteRole();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);

  const rail = useSyncExternalStore(
    railStore.subscribe,
    railStore.getSnapshot,
    railStore.getServerSnapshot,
  );

  /* ปิดลิ้นชักเมื่อเปลี่ยนหน้า (รวมกรณีกดปุ่มย้อนกลับ)
     ปรับ state ระหว่างเรนเดอร์ตามที่ React แนะนำ ไม่ใช่ setState ใน effect */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
    if (palette) setPalette(false);
  }

  const admin = info.admin;

  /* งานค้างของผู้ดูแล — ท่อเดียวใช้ร่วมกับหน้าภาพรวมและหน้าสิทธิ์ */
  const { data: requests } = useLive<StreamerRequest[]>(
    admin && hasBackend ? "streamerRequests" : null,
    NO_REQUESTS,
    (onChange, onError) => watchStreamerRequests(onChange, onError),
  );
  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const badges = { streamerRequests: pendingRequests };

  /* ⌘K / Ctrl+K เปิดตัวค้นหา — ผูกไว้ตลอดเวลาที่อยู่ในสตูดิโอ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!info.studio) {
    return (
      <>
        <StudioLocked info={info} />
        <ToastHost />
      </>
    );
  }

  const page = studioPage(pathname);

  return (
    <div className="studio-canvas relative min-h-dvh lg:flex">
      {/* ---- แถบข้าง (จอใหญ่) ---- */}
      <aside
        className={`studio-rail sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-hair transition-[width] duration-300 lg:flex ${
          rail ? "w-18" : "w-66"
        }`}
      >
        <SidebarBody
          admin={admin}
          info={info}
          rail={rail}
          onToggleRail={railStore.toggle}
          badges={badges}
        />
      </aside>

      {/* ---- เนื้อหา ---- */}
      <div className="flex min-w-0 grow flex-col">
        <TopBar
          page={page}
          info={info}
          onOpenMenu={() => setOpen(true)}
          onOpenPalette={() => setPalette(true)}
        />

        <main className="mx-auto w-full max-w-420 grow px-4 py-6 pb-[calc(2.5rem+var(--sab))] sm:px-6 lg:px-8 lg:py-8">
          {info.local && hasBackend && info.role === "viewer" && <LocalModeNotice />}
          <ProfileGate>{children}</ProfileGate>
        </main>
      </div>

      {/* ---- ลิ้นชัก (จอเล็ก) ---- */}
      <Drawer open={open} onClose={() => setOpen(false)}>
        <SidebarBody
          admin={admin}
          info={info}
          rail={false}
          badges={badges}
          onNavigate={() => setOpen(false)}
        />
      </Drawer>

      <CommandPalette
        open={palette}
        admin={admin}
        badges={badges}
        onClose={() => setPalette(false)}
      />

      <ToastHost />
    </div>
  );
}

/* =========================================================================
   แถบบน — มีทั้งจอเล็กและจอใหญ่แล้ว
   ========================================================================= */

/**
 * พื้นทึบ ไม่ใช่เบลอ — แถบนี้ค้างอยู่ทั้งวันระหว่างไลฟ์ การเบลอฉากหลัง
 * แปลว่าเบราว์เซอร์ต้องสุ่มพื้นหลังมาวาดใหม่ทุกครั้งที่เนื้อหาข้างหลังขยับ
 */
function TopBar({
  page,
  info,
  onOpenMenu,
  onOpenPalette,
}: {
  page: StudioItem | null;
  info: RoleInfo;
  onOpenMenu: () => void;
  onOpenPalette: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-3 border-b border-hair px-4 lg:px-8"
      style={{
        /* พื้นทึบ ไม่ใช่เบลอ — แถบนี้ค้างอยู่ทั้งวันระหว่างไลฟ์
           การเบลอฉากหลังแปลว่าต้องวาดใหม่ทุกครั้งที่เนื้อหาข้างหลังขยับ */
        background: "var(--color-ink)",
        paddingTop: "var(--sat)",
        height: "calc(3.5rem + var(--sat))",
      }}
    >
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="เปิดเมนูสตูดิโอ"
        className="-ml-1.5 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-muted transition-colors hover:bg-iris/12 hover:text-iris lg:hidden"
      >
        <IconMenu className="h-5 w-5" />
      </button>
      <span className="lg:hidden">
        <Mark />
      </span>

      <div className="min-w-0 grow">
        <p className="truncate font-display text-sm text-ice">
          {page?.label ?? "สตูดิโอ"}
        </p>
        {page?.detail && (
          <p className="hidden truncate text-xs leading-none text-muted lg:block">
            {page.detail}
          </p>
        )}
      </div>

      {/*
        ตัวค้นหา — ทางเข้าที่ไม่ต้องรู้ว่าเมนูอยู่กลุ่มไหน
        จอใหญ่โชว์เป็นช่องพร้อมคีย์ลัด จอเล็กเหลือแค่ไอคอนเพราะพื้นที่ไม่พอ
      */}
      <button
        type="button"
        onClick={onOpenPalette}
        className="hover-tile tile hidden min-h-9 cursor-pointer items-center gap-2 rounded-xl px-3 text-xs text-muted transition-colors hover:text-ice md:flex"
      >
        <IconSearch className="h-3.5 w-3.5" />
        <span>ค้นหาเมนู</span>
        <kbd className="num rounded-md border border-hair px-1.5 py-0.5 text-[10px] text-muted/80">
          Ctrl K
        </kbd>
      </button>
      <button
        type="button"
        onClick={onOpenPalette}
        aria-label="ค้นหาเมนู"
        className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-muted transition-colors hover:bg-iris/12 hover:text-iris md:hidden"
      >
        <IconSearch className="h-4 w-4" />
      </button>

      <span className="hidden lg:block">
        <RoleChip info={info} />
      </span>
      <ThemeSoundButtons />
    </header>
  );
}

function RoleChip({ info }: { info: RoleInfo }) {
  const label = info.local && !info.signedIn ? "รหัสเครื่องนี้" : ROLE_LABEL[info.role];
  return (
    <span className="rounded-full bg-iris/12 px-2.5 py-1 font-display text-eyebrow text-iris">
      {label}
    </span>
  );
}

/* =========================================================================
   แถบข้าง
   ========================================================================= */

function Mark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-iris/40 bg-[radial-gradient(circle_at_35%_25%,rgba(242,220,176,0.25),transparent_65%)] ${className}`}
      aria-hidden
    >
      <span className="font-display text-sm font-medium text-iris">
        {BRAND_MONOGRAM}
      </span>
    </span>
  );
}

export type StudioBadges = { streamerRequests: number };

function SidebarBody({
  admin,
  info,
  rail,
  badges,
  onToggleRail,
  onNavigate,
}: {
  admin: boolean;
  info: RoleInfo;
  rail: boolean;
  badges: StudioBadges;
  onToggleRail?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const nav = studioNavFor(admin);
  const groups = STUDIO_GROUPS.filter((g) =>
    nav.some((item) => item.group === g.key),
  );

  return (
    <>
      <div
        className={`flex shrink-0 items-center border-b border-hair ${
          rail ? "justify-center px-2" : "gap-2.5 px-4"
        }`}
        style={{ height: "calc(3.5rem + var(--sat))", paddingTop: "var(--sat)" }}
      >
        <Mark />
        {!rail && (
          <div className="min-w-0 grow">
            <p className="font-display text-sm leading-none font-medium text-ice">
              สตูดิโอ
            </p>
            <p className="slug slug-2 mt-1.5 leading-none">Studio</p>
          </div>
        )}
        {onToggleRail && !rail && (
          <button
            type="button"
            onClick={onToggleRail}
            aria-label="พับแถบเมนู"
            title="พับแถบเมนู"
            className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-iris/12 hover:text-iris"
          >
            <IconArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <nav className={`grow overflow-y-auto py-4 ${rail ? "px-2" : "px-3"}`}>
        {groups.map((group) => (
          <div key={group.key} className="mb-5 last:mb-0">
            {rail ? (
              <span className="rail-divider mx-2 mb-2 block" />
            ) : (
              <p className="slug px-3 pb-2">{group.title}</p>
            )}
            <ul>
              {nav
                .filter((item) => item.group === group.key)
                .map((item) => (
                  <NavRow
                    key={item.href}
                    item={item}
                    active={isStudioActive(item.href, pathname, item.alsoActive)}
                    rail={rail}
                    count={item.badge ? badges[item.badge] : 0}
                    onNavigate={onNavigate}
                  />
                ))}
            </ul>
          </div>
        ))}
      </nav>

      <SidebarFooter info={info} rail={rail} onExpand={onToggleRail} />
    </>
  );
}

function NavRow({
  item,
  active,
  rail,
  count,
  onNavigate,
}: {
  item: StudioItem;
  active: boolean;
  rail: boolean;
  count: number;
  onNavigate?: () => void;
}) {
  const Icon = item.Icon;

  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={rail ? `${item.label} — ${item.detail}` : item.detail}
        className={`group relative flex items-center rounded-xl font-display text-[13px] transition-colors ${
          rail ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2.5"
        } ${active ? "text-onaccent" : "text-muted hover:bg-iris/8 hover:text-ice"}`}
      >
        {active && (
          <motion.span
            layoutId="studio-active"
            className="accent-fill absolute inset-0 rounded-xl"
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          />
        )}
        <span className="relative z-10 grid h-4 w-4 shrink-0 place-items-center">
          <Icon className="h-4 w-4" />
          {/* พับแถบแล้วยังต้องรู้ว่ามีงานค้าง — เหลือเป็นจุดแทนตัวเลข */}
          {rail && count > 0 && (
            <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-iris ring-2 ring-ink-2" />
          )}
        </span>
        {!rail && (
          <>
            <span className="relative z-10 truncate">{item.label}</span>
            {count > 0 && (
              <span
                className={`num relative z-10 ml-auto rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? "bg-black/20 text-onaccent" : "bg-iris/18 text-iris"
                }`}
              >
                {count}
              </span>
            )}
            {item.external && (
              <span
                aria-hidden
                className={`relative z-10 text-[10px] ${
                  count > 0 ? "" : "ml-auto"
                } ${active ? "text-onaccent/60" : "text-muted/60"}`}
              >
                <IconExternal className="h-3 w-3" />
              </span>
            )}
          </>
        )}
      </Link>

      {/* ส่วนย่อยของหน้านั้น — กางเฉพาะตอนอยู่ในหน้านั้นจริง
          ถ้ากางค้างไว้ตลอด แถบข้างจะยาวจนเมนูจริงหาย */}
      {active && item.sub && !rail && (
        <SubNav items={item.sub} onNavigate={onNavigate} />
      )}
    </li>
  );
}

/**
 * เมนูลูก — เปลี่ยนส่วนของหน้าด้วย #tab= ไม่ใช่การเปลี่ยนหน้า
 *
 * ใช้ hash ไม่ใช่ route เพราะทั้งหน้าช่องแชร์สถานะเดียวกันหมด (ฉบับร่างที่ยังไม่
 * เผยแพร่ · ใบสลิปที่กำลังฟังอยู่ · ปุ่มเผยแพร่) แยกเป็นคนละ route เมื่อไหร่
 * ของพวกนี้จะถูกสร้างใหม่ทุกครั้งที่สลับส่วน แล้วงานที่แก้ค้างไว้จะหาย
 */
function SubNav({
  items,
  onNavigate,
}: {
  items: StudioSub[];
  onNavigate?: () => void;
}) {
  const current = useHashParam("tab") ?? items[0]?.hash;

  return (
    <ul className="mt-0.5 mb-1 ml-[1.4rem] border-l border-hair pl-2.5">
      {items.map((sub) => {
        const on = current === sub.hash;
        return (
          <li key={sub.hash}>
            <button
              type="button"
              aria-current={on ? "true" : undefined}
              onClick={() => {
                /* แก้เฉพาะ tab= อย่าเขียนทับทั้ง hash — หน้าช่องเก็บรหัสช่อง
                   ไว้ใน #c= ด้วย ถ้าทับทั้งก้อนจะเด้งกลับไปช่องเริ่มต้น */
                setHashParams({ tab: sub.hash });
                onNavigate?.();
              }}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-left font-display text-xs transition-colors ${
                on ? "bg-iris/12 text-iris" : "text-muted hover:text-ice"
              }`}
            >
              <span
                aria-hidden
                className={`h-1 w-1 shrink-0 rounded-full transition-colors ${
                  on ? "bg-iris" : "bg-transparent"
                }`}
              />
              <span className="truncate">{sub.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarFooter({
  info,
  rail,
  onExpand,
}: {
  info: RoleInfo;
  rail: boolean;
  onExpand?: () => void;
}) {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );
  const user = authStore.user();
  const profile = profileStore.profile();
  const [signOutOpen, setSignOutOpen] = useState(false);

  const name = profile?.gameName?.trim() || user?.name || "โหมดเครื่องนี้";

  const avatar = user?.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={user.photo}
      alt=""
      referrerPolicy="no-referrer"
      className="h-full w-full object-cover"
    />
  ) : (
    <span className="font-display text-xs text-iris">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );

  if (rail) {
    return (
      <div
        className="flex shrink-0 flex-col items-center gap-2 border-t border-hair p-2"
        style={{ paddingBottom: "calc(0.5rem + var(--sab))" }}
      >
        <button
          type="button"
          onClick={onExpand}
          aria-label="กางแถบเมนู"
          title="กางแถบเมนู"
          className="grid h-9 w-9 cursor-pointer place-items-center rounded-xl text-muted transition-colors hover:bg-iris/12 hover:text-iris"
        >
          <IconMenu className="h-4 w-4" />
        </button>
        <span
          title={name}
          className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-hair"
        >
          {avatar}
        </span>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 border-t border-hair p-3"
      style={{ paddingBottom: "calc(0.75rem + var(--sab))" }}
    >
      <Link
        href="/"
        className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 font-display text-xs text-muted transition-colors hover:bg-iris/8 hover:text-iris"
      >
        <IconArrowLeft className="h-3.5 w-3.5" />
        กลับหน้าเว็บ
      </Link>

      <div className="tile mb-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full border border-hair">
          {avatar}
        </span>
        <div className="min-w-0 grow">
          <p className="truncate text-[13px] leading-tight text-ice">{name}</p>
          <p className="slug slug-2 mt-1 leading-none">
            {info.local && !info.signedIn ? "รหัสเครื่องนี้" : ROLE_LABEL[info.role]}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <ThemeSoundButtons />
        {info.signedIn ? (
          <button
            type="button"
            onClick={() => setSignOutOpen(true)}
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-danger/12 hover:text-danger"
          >
            <IconLogout className="h-4 w-4" />
          </button>
        ) : info.local ? (
          <button
            type="button"
            onClick={() => {
              gateStore.lock();
              toast("ออกจากโหมดผู้จัดแล้ว");
            }}
            title="ออกจากโหมดผู้จัด"
            aria-label="ออกจากโหมดผู้จัด"
            className="grid h-9 w-9 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-danger/12 hover:text-danger"
          >
            <IconLogout className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <ConfirmDialog
        open={signOutOpen}
        title="ออกจากระบบ?"
        description="ต้องล็อกอินใหม่ถึงจะกลับเข้าสตูดิโอได้อีกครั้ง"
        confirmText="ออกจากระบบ"
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          void authStore
            .signOut()
            .then(() => {
              recordActivity("auth.signout", "ออกจากระบบจากสตูดิโอ");
              toast("ออกจากระบบแล้ว", "success");
            })
            .catch(() => toast("ออกจากระบบไม่สำเร็จ", "error"));
        }}
      />
    </div>
  );
}

function Drawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <motion.button
            type="button"
            aria-label="ปิดเมนู"
            onClick={onClose}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
          />
          <motion.div
            initial={reduced ? false : { x: -24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduced ? undefined : { x: -24, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="surface glass-panel relative flex h-full w-69 max-w-[85vw] flex-col rounded-none"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="ปิดเมนู"
              className="absolute top-3 right-3 z-10 grid h-9 w-9 cursor-pointer place-items-center rounded-xl text-muted transition-colors hover:bg-iris/12 hover:text-iris"
              style={{ marginTop: "var(--sat)" }}
            >
              <IconClose className="h-4 w-4" />
            </button>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* =========================================================================
   ประตู — คนที่ยังไม่มีสิทธิ์เห็นหน้านี้แทนแถบข้าง
   ========================================================================= */

/** โหมดรหัสเครื่องทำงานได้เฉพาะของที่อยู่ในเบราว์เซอร์ ต้องบอกให้ชัด */
function LocalModeNotice() {
  return (
    <div className="tally sunken mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl py-3 pr-4 pl-5 text-xs">
      <span className="slug">โหมดเครื่องนี้</span>
      <span className="text-muted">
        ปลดด้วยรหัสผู้จัด ใช้ได้เฉพาะข้อมูลในเบราว์เซอร์เครื่องนี้ —
        ถ้าจะตั้งค่าช่องหรือรับใบสมัครข้ามเครื่อง ต้องล็อกอินบัญชีสตรีมเมอร์
      </span>
    </div>
  );
}

function StudioLocked({ info }: { info: RoleInfo }) {
  /*
    ไม่มีแบ็กเอนด์ = ข้อมูลอยู่ในเบราว์เซอร์เครื่องเดียว ไม่มีบัญชีให้ตรวจสิทธิ์
    ทางเข้าเดียวที่เหลือคือรหัสผู้จัดในเครื่อง ซึ่ง AdminGate ทำไว้ครบแล้ว
  */
  if (!hasBackend) {
    return (
      <LockedFrame>
        <AdminGate>
          <p className="text-sm text-muted">กำลังเข้าสตูดิโอ…</p>
        </AdminGate>
      </LockedFrame>
    );
  }

  if (info.loading) {
    return (
      <LockedFrame>
        <div className="surface hairline-top rounded-2xl p-7" aria-busy="true">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-3 h-7 w-52" />
          <Skeleton className="mt-5 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-3/4" />
          <Skeleton className="mt-7 h-12 w-full rounded-xl" />
        </div>
      </LockedFrame>
    );
  }

  if (!info.signedIn) {
    return (
      <LockedFrame>
        <AuthPanel
          title="สตูดิโอสำหรับสตรีมเมอร์"
          description="ล็อกอินก่อน แล้วถ้ายังไม่มีสิทธิ์ ระบบจะพาไปหน้าขอเปิดช่องให้เอง"
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

/** กรอบเรียบๆ ของหน้าประตู — มีแค่ทางกลับกับปุ่มธีม ไม่มีเมนูให้หลง */
function LockedFrame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-[calc(2.5rem+var(--sab))] sm:px-6">
      <div
        className="flex shrink-0 items-center gap-3 py-4"
        style={{ paddingTop: "calc(1rem + var(--sat))" }}
      >
        <Link
          href="/"
          className="flex items-center gap-2 rounded-full px-2 py-1.5 font-display text-xs text-muted transition-colors hover:text-iris"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          กลับหน้าเว็บ
        </Link>
        <span className="grow" />
        <ThemeSoundButtons />
      </div>

      <div className="grid grow place-items-center py-6">
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
