"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { muteStore, sfx } from "@/lib/sound";
import { themeStore } from "@/lib/theme";
import BackgroundFX from "./fx/BackgroundFX";

const NAV = [
  { href: "/", label: "สุ่มทีม" },
  { href: "/wheel/", label: "วงล้อ" },
  { href: "/tournaments/", label: "ทัวร์นาเมนต์" },
  { href: "/players/", label: "ผู้เล่น" },
] as const;

export default function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  const pathname = usePathname();
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

  const isActive = (href: string) => {
    const clean = href.replace(/\/$/, "") || "/";
    const current = (pathname ?? "/").replace(/\/$/, "") || "/";
    if (clean === "/") return current === "/";
    return current === clean || current.startsWith(`${clean}/`);
  };

  return (
    <>
      <BackgroundFX />

      <main
        className={`relative z-10 mx-auto flex min-h-dvh w-full flex-col gap-6 px-4 pt-[calc(1.5rem+var(--sat))] pb-[calc(2.5rem+var(--sab))] sm:px-6 lg:px-10 ${
          wide ? "max-w-420" : "max-w-350"
        }`}
      >
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="flex min-w-0 items-center gap-3.5">
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-champagne/35 bg-[radial-gradient(circle_at_35%_25%,rgba(242,220,176,0.22),transparent_65%)]"
            >
              <span className="font-display text-base font-medium text-champagne">R</span>
            </motion.span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-medium tracking-[0.16em] sm:text-lg">
                <span className="text-gold-grad">ROV TOURNAMENT HUB</span>
              </h1>
              <p className="mt-0.5 hidden truncate text-xs text-muted sm:block">
                สุ่มทีม · จัดสาย · เก็บประวัติ — ทำงานในเครื่องล้วน
              </p>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <nav className="mr-1 flex items-center gap-1 rounded-full tile p-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative rounded-full px-3.5 py-1.5 font-display text-xs transition-colors duration-300 sm:px-4 ${
                    isActive(item.href)
                      ? "text-[#1b1509]"
                      : "text-muted hover:text-ice"
                  }`}
                >
                  {isActive(item.href) && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 rounded-full bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)]"
                      transition={{ type: "spring", stiffness: 340, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </Link>
              ))}
            </nav>

            <IconButton
              onClick={() => {
                sfx.play("click");
                themeStore.toggle();
              }}
              label={theme === "dark" ? "สลับเป็นธีมสว่าง" : "สลับเป็นธีมมืด"}
            >
              {theme === "dark" ? "☀" : "☾"}
            </IconButton>
            <IconButton
              onClick={() => muteStore.toggle()}
              label={muted ? "เปิดเสียง" : "ปิดเสียง"}
            >
              {muted ? "🔇" : "🔊"}
            </IconButton>
          </div>
        </header>

        <div className="h-px rule" />

        <div className="flex-1">{children}</div>

        <footer className="border-t border-hair pt-5 text-center text-xs text-muted">
          ข้อมูลทั้งหมดเก็บอยู่ในเบราว์เซอร์ของคุณเครื่องเดียว · แชร์ให้คนอื่นดูผ่านลิงก์ได้
        </footer>
      </main>
    </>
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
      className="grid h-10 w-10 cursor-pointer place-items-center tile rounded-full text-sm text-ice/80 transition-all duration-300 hover:border-champagne/40 hover:bg-champagne/15 hover:text-champagne active:scale-95"
    >
      {children}
    </button>
  );
}
