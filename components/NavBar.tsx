"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { BRAND, BRAND_MARK, BRAND_MONOGRAM } from "@/lib/brand";
import { gateStore } from "@/lib/gate";
import { useAccess } from "@/hooks/useAdmin";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { recordActivity } from "@/lib/activity";
import { muteStore, sfx } from "@/lib/sound";
import { themeStore } from "@/lib/theme";
import Button from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import {
  IconClock,
  IconLock,
  IconDice,
  IconHeart,
  IconMonitor,
  IconMoon,
  IconMute,
  IconSun,
  IconTimer,
  IconTrophy,
  IconUnlock,
  IconUsers,
  IconVolume,
  IconWheel,
} from "@/components/ui/icons";

type IconProps = { className?: string; strokeWidth?: number };

export type NavGroup = "tools" | "league" | "channel";

export type NavItem = {
  href: string;
  label: string;
  /** เลขบทชุดเดียวกับหัวหน้าเพจ เพื่อให้สารบัญท้ายเล่มอ้างเลขเดียวกัน */
  no: string;
  group: NavGroup;
  Icon: ComponentType<IconProps>;
  /** ต้องปลดล็อกโหมดผู้จัดก่อนถึงจะเห็นในเมนู */
  admin?: boolean;
};

/**
 * สารบัญกลางของทั้งเว็บ — Footer ใช้ตัวเดียวกันนี้
 * ถ้าแยกสองที่ เพิ่มเมนูทีต้องไล่แก้สองไฟล์แล้วลืมทุกครั้ง
 */
export const NAV: NavItem[] = [
  {
    href: "/draw/",
    label: "สุ่มทีม",
    no: "01",
    group: "tools",
    Icon: IconDice,
  },
  {
    href: "/wheel/",
    label: "วงล้อ",
    no: "02",
    group: "tools",
    Icon: IconWheel,
  },
  {
    href: "/tournaments/",
    label: "ทัวร์นาเมนต์",
    no: "03",
    group: "league",
    Icon: IconTrophy,
    admin: true,
  },
  {
    href: "/players/",
    label: "ผู้เล่น",
    no: "04",
    group: "league",
    Icon: IconUsers,
    admin: true,
  },
  {
    href: "/channel/",
    label: "ช่อง",
    no: "05",
    group: "channel",
    Icon: IconHeart,
    admin: true,
  },
  {
    href: "/timer/",
    label: "จับเวลา",
    no: "10",
    group: "channel",
    Icon: IconTimer,
    admin: true,
  },
  {
    href: "/widgets/",
    label: "Widget",
    no: "06",
    group: "tools",
    Icon: IconMonitor,
    admin: true,
  },
  {
    href: "/activity/",
    label: "ประวัติ",
    no: "07",
    group: "channel",
    Icon: IconClock,
    admin: true,
  },
  {
    href: "/admin/",
    label: "หลังบ้าน",
    no: "08",
    group: "channel",
    Icon: IconLock,
    admin: true,
  },
];

/** เมนูที่ควรเห็น — ผู้ชมทั่วไปเหลือแค่เครื่องมือที่เปิดให้ใช้ฟรี */
export function visibleNav(admin: boolean): NavItem[] {
  return admin ? NAV : NAV.filter((item) => !item.admin);
}

export const NAV_GROUPS: { key: NavGroup; title: string }[] = [
  { key: "tools", title: "เครื่องมือ" },
  { key: "league", title: "ทัวร์นาเมนต์" },
  { key: "channel", title: "ช่องและประวัติ" },
];

/** หน้าที่ไม่มีในเมนูแต่ต้องมีชื่อเวลาพลิกหน้า */
const EXTRA_TITLE: Record<string, string> = {
  "/": "หน้าแรก",
  "/tournament": "ทัวร์นาเมนต์",
  "/c": "ช่อง",
};

function cleanPath(path: string | null): string {
  return (path ?? "/").replace(/\/+$/, "") || "/";
}

/** ชื่อหน้าปลายทาง ใช้ทั้งใน AppShell ตอนพลิกหน้าและใน Footer */
export function navTitle(path: string | null): string {
  const current = cleanPath(path);
  if (EXTRA_TITLE[current]) return EXTRA_TITLE[current];
  const hit = NAV.find((item) => current.startsWith(cleanPath(item.href)));
  return hit?.label ?? BRAND;
}

function isActive(href: string, path: string | null) {
  const clean = cleanPath(href);
  const current = cleanPath(path);
  return clean === "/" ? current === "/" : current.startsWith(clean);
}

export default function NavBar() {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [condensed, setCondensed] = useState(false);
  const [pending, setPending] = useState(false);
  const { scrollYProgress } = useScroll();

  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const access = useAccess();
  const admin = access !== "none";

  // ย่อแถบลงเมื่อเลื่อนหน้าลง
  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-3 z-40">
      <div
        className={`nav-shell relative flex items-center gap-2 rounded-full ${
          condensed ? "is-condensed px-2 py-1.5" : "px-2.5 py-2"
        }`}
      >
        {/* แบรนด์ */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-full py-1 pr-3 pl-1"
        >
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-iris/40 bg-[radial-gradient(circle_at_35%_25%,rgba(242,220,176,0.25),transparent_65%)]">
            <span className="absolute inset-0 animate-halo rounded-full" />
            <span className="font-display text-sm font-medium text-iris">
              {BRAND_MONOGRAM}
            </span>
          </span>
          <span className="hidden font-display text-sm font-medium tracking-[0.18em] lg:block">
            <span className="text-accent-grad">{BRAND_MARK}</span>
          </span>
        </Link>

        <span className="hidden h-6 w-px shrink-0 bg-[rgb(var(--hair)/var(--hair-a))] lg:block" />

        {/* เมนู — ขอบจางสองข้างเป็นสัญญาณว่าเลื่อนได้ เพราะ scrollbar ถูกซ่อนสนิท */}
        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto mask-[linear-gradient(90deg,transparent,#000_18px,#000_calc(100%-18px),transparent)]">
          {visibleNav(admin).map((item) => {
            const active = isActive(item.href, pathname);
            const Icon = item.Icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex shrink-0 items-center gap-2 rounded-full px-2.5 py-2 font-display text-xs whitespace-nowrap transition-colors duration-300 sm:px-3.5 ${
                  active ? "text-onaccent" : "text-muted hover:text-ice"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full accent-fill shadow-[0_6px_20px_-8px_rgba(207,167,101,0.95)]"
                    transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  />
                )}
                <span className="relative z-10 grid h-4 w-4 place-items-center opacity-90">
                  <Icon className="h-4 w-4" />
                </span>

                {/* จอใหญ่มีที่พอให้ทุกเมนูมีชื่อ */}
                <span className="relative z-10 hidden sm:block">
                  {item.label}
                </span>

                {/* จอเล็กโชว์ชื่อเฉพาะเมนูที่เปิดอยู่ ไม่งั้นแถวยาวเกินจอ */}
                <span className="relative z-10 sm:hidden">
                  <AnimatePresence initial={false}>
                    {active && (
                      <motion.span
                        key="label"
                        initial={reduced ? false : { width: 0, opacity: 0 }}
                        animate={{ width: "auto", opacity: 1 }}
                        exit={reduced ? undefined : { width: 0, opacity: 0 }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                        className="block overflow-hidden text-eyebrow tracking-luxe whitespace-nowrap"
                      >
                        <span className="block pl-1.5">{item.label}</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </Link>
            );
          })}
        </nav>

        {/* ปุ่มขวา */}
        <div className="flex shrink-0 items-center gap-1">
          {/*
            ปุ่มนี้ปลดได้แค่รหัสในเครื่อง สิทธิ์ที่ Firestore ยืนยันต้องออกด้วยการ
            ล็อกเอาต์ ซึ่งมีปุ่มรูปโปรไฟล์อยู่แล้ว จึงโชว์เฉพาะโหมดเครื่องนี้
          */}
          {access === "local" && (
            <button
              type="button"
              onClick={() => {
                gateStore.lock();
                toast("ออกจากโหมดผู้จัดแล้ว");
              }}
              title="ออกจากโหมดผู้จัด"
              aria-label="ออกจากโหมดผู้จัด"
              className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-iris transition-colors hover:bg-iris/10"
            >
              <IconUnlock className="h-4 w-4" />
            </button>
          )}

          <ThemeSoundButtons />

          {hasBackend &&
            (user ? (
              <>
                {/*
                  กดรูปโปรไฟล์แล้วไปหน้าบัญชี ไม่ใช่เด้งถามออกจากระบบทันที
                  ปุ่มออกจากระบบย้ายไปอยู่ในหน้านั้นแล้ว ซึ่งตรงกับที่คนคาดหวังกว่า
                */}
                <Link
                  href="/account/"
                  title={`${user.name} — โปรไฟล์ของฉัน`}
                  aria-label="โปรไฟล์ของฉัน"
                  className="relative ml-0.5 grid h-9 w-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-iris/45 transition-transform hover:scale-105"
                >
                  <span className="pointer-events-none absolute inset-0 animate-halo rounded-full" />
                  {user.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photo}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-xs text-iris">
                      {user.name.slice(0, 1)}
                    </span>
                  )}
                </Link>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                loading={pending}
                aria-label="เข้าสู่ระบบ"
                className="ml-0.5 shrink-0 rounded-full whitespace-nowrap max-sm:px-2.5"
                onClick={() => {
                  setPending(true);
                  authStore
                    .signIn()
                    .then(() => {
                      const u = authStore.user();
                      recordActivity(
                        "auth.signin",
                        `เข้าสู่ระบบ (${u?.name ?? "-"})`,
                      );
                    })
                    .catch(() =>
                      toast("เข้าสู่ระบบไม่สำเร็จ ป็อปอัปอาจถูกบล็อก", "error"),
                    )
                    .finally(() => setPending(false));
                }}
              >
                {/* จอเล็กเหลือแค่ไอคอน เมนูจะได้มีที่เลื่อนมากขึ้น */}
                <IconUsers className="h-4 w-4 sm:hidden" />
                <span className="hidden sm:inline">เข้าสู่ระบบ</span>
              </Button>
            ))}
        </div>

        {/* ความคืบหน้าการอ่านหน้า — เส้นเดียวบางๆ ไม่กินพื้นที่ */}
        <motion.span
          aria-hidden
          style={{ scaleX: scrollYProgress }}
          className="pointer-events-none absolute inset-x-8 bottom-0 h-px origin-left bg-[linear-gradient(90deg,rgb(var(--accent)/.85),transparent)]"
        />
      </div>
    </header>
  );
}

/** ปุ่มธีมกับเสียง — NavBar กับ Footer ใช้ชุดเดียวกัน */
export function ThemeSoundButtons({ className = "" }: { className?: string }) {
  const reduced = useReducedMotion();
  const muted = useSyncExternalStore(
    muteStore.subscribe,
    muteStore.getSnapshot,
    muteStore.getServerSnapshot,
  );
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <IconButton
        onClick={() => {
          sfx.play("click");
          themeStore.toggle();
        }}
        label={theme === "dark" ? "ธีมสว่าง" : "ธีมมืด"}
      >
        <SwapIcon swapKey={theme} reduced={reduced}>
          {theme === "dark" ? (
            <IconSun className="h-4 w-4" />
          ) : (
            <IconMoon className="h-4 w-4" />
          )}
        </SwapIcon>
      </IconButton>

      <IconButton
        onClick={() => muteStore.toggle()}
        label={muted ? "เปิดเสียง" : "ปิดเสียง"}
      >
        <SwapIcon swapKey={muted ? "mute" : "on"} reduced={reduced}>
          {muted ? (
            <IconMute className="h-4 w-4" />
          ) : (
            <IconVolume className="h-4 w-4" />
          )}
        </SwapIcon>
      </IconButton>
    </div>
  );
}

/** สลับไอคอนแบบหมุนเข้า-ออก ให้การกดปุ่มมีน้ำหนักกว่าการเปลี่ยนตัวอักษรเฉยๆ */
function SwapIcon({
  swapKey,
  reduced,
  children,
}: {
  swapKey: string;
  reduced: boolean | null;
  children: ReactNode;
}) {
  if (reduced) {
    return <span className="grid h-4 w-4 place-items-center">{children}</span>;
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={swapKey}
        initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="grid h-4 w-4 place-items-center"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-all duration-300 hover:bg-iris/12 hover:text-iris active:scale-90"
    >
      {children}
    </button>
  );
}
