"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { recordActivity } from "@/lib/activity";
import { muteStore, sfx } from "@/lib/sound";
import { themeStore } from "@/lib/theme";

type Item = { href: string; label: string; icon: React.ReactNode };

const NAV: Item[] = [
  { href: "/draw/", label: "สุ่มทีม", icon: <IconDice /> },
  { href: "/wheel/", label: "วงล้อ", icon: <IconWheel /> },
  { href: "/tournaments/", label: "ทัวร์นาเมนต์", icon: <IconTrophy /> },
  { href: "/players/", label: "ผู้เล่น", icon: <IconUsers /> },
  { href: "/widgets/", label: "Widget", icon: <IconMonitor /> },
  { href: "/activity/", label: "ประวัติ", icon: <IconClock /> },
];

export default function NavBar() {
  const pathname = usePathname();
  const [condensed, setCondensed] = useState(false);

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
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();

  // ย่อแถบลงเมื่อเลื่อนหน้าลง
  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => {
    const clean = href.replace(/\/$/, "") || "/";
    const current = (pathname ?? "/").replace(/\/$/, "") || "/";
    return clean === "/" ? current === "/" : current.startsWith(clean);
  };

  return (
    <header className="sticky top-3 z-40">
      <div
        className={`nav-shell flex items-center gap-2 rounded-full ${
          condensed ? "is-condensed px-2 py-1.5" : "px-2.5 py-2"
        }`}
      >
        {/* แบรนด์ */}
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2.5 rounded-full py-1 pr-3 pl-1"
        >
          <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-champagne/40 bg-[radial-gradient(circle_at_35%_25%,rgba(242,220,176,0.25),transparent_65%)]">
            <span className="absolute inset-0 animate-halo rounded-full" />
            <span className="font-display text-sm font-medium text-champagne">R</span>
          </span>
          <span className="hidden font-display text-sm font-medium tracking-[0.18em] lg:block">
            <span className="text-gold-grad">ROV HUB</span>
          </span>
        </Link>

        <span className="hidden h-6 w-px shrink-0 bg-[rgb(var(--hair)/var(--hair-a))] lg:block" />

        {/* เมนู */}
        <nav className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 font-display text-xs whitespace-nowrap transition-colors duration-300 ${
                  active ? "text-[#1b1509]" : "text-muted hover:text-ice"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-full bg-[linear-gradient(180deg,#f4e0b6_0%,#d9b273_55%,#c09a58_100%)] shadow-[0_6px_20px_-8px_rgba(207,167,101,0.95)]"
                    transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  />
                )}
                <span className="relative z-10 grid h-4 w-4 place-items-center opacity-90">
                  {item.icon}
                </span>
                <span className="relative z-10 hidden sm:block">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* ปุ่มขวา */}
        <div className="flex shrink-0 items-center gap-1">
          <IconButton
            onClick={() => {
              sfx.play("click");
              themeStore.toggle();
            }}
            label={theme === "dark" ? "ธีมสว่าง" : "ธีมมืด"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </IconButton>
          <IconButton
            onClick={() => muteStore.toggle()}
            label={muted ? "เปิดเสียง" : "ปิดเสียง"}
          >
            {muted ? "🔇" : "🔊"}
          </IconButton>

          {hasBackend &&
            (user ? (
              <button
                type="button"
                onClick={() => {
                  if (!confirm(`ออกจากระบบ (${user.name})?`)) return;
                  recordActivity("auth.signout", `ออกจากระบบ (${user.name})`);
                  void authStore.signOut();
                }}
                title={`${user.name} — กดเพื่อออกจากระบบ`}
                className="ml-0.5 grid h-9 w-9 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border border-champagne/45 transition-transform hover:scale-105"
              >
                {user.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photo}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-display text-xs text-champagne">
                    {user.name.slice(0, 1)}
                  </span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  void authStore.signIn().then(() => {
                    const u = authStore.user();
                    recordActivity("auth.signin", `เข้าสู่ระบบ (${u?.name ?? "-"})`);
                  });
                }}
                className="ml-0.5 shrink-0 cursor-pointer rounded-full border border-champagne/35 px-4 py-2 font-display text-xs whitespace-nowrap text-champagne transition-colors hover:bg-champagne/12"
              >
                เข้าสู่ระบบ
              </button>
            ))}
        </div>
      </div>
    </header>
  );
}

function IconButton({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-sm text-muted transition-all duration-300 hover:bg-champagne/12 hover:text-champagne active:scale-90"
    >
      {children}
    </button>
  );
}

/* ---------- ไอคอนเส้นบาง ---------- */

function base(children: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {children}
    </svg>
  );
}

function IconDice() {
  return base(
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>,
  );
}

function IconWheel() {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
    </>,
  );
}

function IconTrophy() {
  return base(
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
      <path d="M12 14v3M9 20h6M10 17h4" />
    </>,
  );
}

function IconUsers() {
  return base(
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6M17 14.2a5.3 5.3 0 0 1 3.5 4.8" />
    </>,
  );
}

function IconMonitor() {
  return base(
    <>
      <rect x="3" y="4" width="18" height="12" rx="2.5" />
      <path d="M9 20h6M12 16v4" />
    </>,
  );
}

function IconClock() {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 1.8" />
    </>,
  );
}
