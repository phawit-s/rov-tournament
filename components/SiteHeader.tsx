"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BRAND } from "@/lib/brand";
import { authStore, hasBackend, type AuthUser } from "@/lib/backend/firebase";
import { ROLE_LABEL, useSiteRole, type SiteRole } from "@/hooks/useRole";
import ThemeToggle from "./ui/ThemeToggle";
import { toast } from "./ui/Toast";

/**
 * แถบบนของหน้าสาธารณะ
 *
 * เตี้ยและเรียบ — หน้าขอเพลงเปิดจากมือถือเป็นหลัก ทุกพิกเซลที่แถบนี้กิน
 * คือช่องวางลิงก์ที่ถูกดันลงไป จึงมีแค่ชื่อเว็บ สลับธีม และทางเข้าบัญชี
 */
export default function SiteHeader({ wide = false }: { wide?: boolean }) {
  useSyncExternalStore(authStore.subscribe, authStore.getSnapshot, authStore.getServerSnapshot);
  const user = authStore.user();
  const { studio, role, signedIn, loading } = useSiteRole();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div
        className={`mx-auto flex h-16 items-center gap-2 px-5 sm:px-8 ${wide ? "max-w-[1400px]" : "max-w-[1120px]"}`}
      >
        <Wordmark />
        <span className="flex-1" />

        <ThemeToggle />
        {hasBackend && !loading && (
          <>
            {studio && (
              <Link
                href="/studio/"
                className="hidden min-h-9 items-center rounded-full bg-fill px-4 text-sm font-medium transition-colors hover:bg-fill-2 sm:inline-flex"
              >
                สตูดิโอ
              </Link>
            )}
            {signedIn && user ? (
              <AccountMenu user={user} studio={studio} role={role} />
            ) : (
              <Link
                href="/studio/"
                className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-medium transition-colors hover:bg-fill"
              >
                สำหรับสตรีมเมอร์
              </Link>
            )}
          </>
        )}
      </div>
    </header>
  );
}

/**
 * ชื่อเว็บ + เครื่องหมายคิว (แถบสามเส้นยาวลดหลั่น = เพลงที่ต่อแถวกันอยู่)
 * ใช้ร่วมกับแถบข้างของสตูดิโอ
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex min-h-11 items-center gap-2.5 ${className}`}>
      <QueueMark className="h-6 w-6" />
      <span className="text-[1.18rem] font-bold tracking-[-0.01em]">{BRAND}</span>
    </Link>
  );
}

export function QueueMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect x="3" y="4.5" width="18" height="3.6" rx="1.8" fill="currentColor" />
      <rect x="3" y="10.2" width="13" height="3.6" rx="1.8" fill="currentColor" opacity="0.62" />
      <rect x="3" y="15.9" width="8" height="3.6" rx="1.8" fill="currentColor" opacity="0.34" />
    </svg>
  );
}

/** รูปโปรไฟล์กดแล้วกางเมนู — บอกว่าใช้บัญชีไหนอยู่ กันสลับบัญชีแล้วลืม */
export function AccountMenu({ user, studio, role }: { user: AuthUser; studio: boolean; role: SiteRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /* เปลี่ยนหน้าแล้วปิดเมนู — ปรับ state ระหว่างเรนเดอร์ ไม่ใช่ setState ใน effect */
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

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`บัญชี ${user.name}`}
        className="grid h-11 w-11 cursor-pointer place-items-center rounded-full transition-colors hover:bg-fill"
      >
        <Avatar user={user} className="h-8 w-8" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 z-50 mt-1 w-64 rounded-sheet bg-paper p-2 shadow-float ring-1 ring-line"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar user={user} className="h-10 w-10" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{user.name}</span>
                <span className="block text-sm text-muted">{ROLE_LABEL[role]}</span>
              </span>
            </div>
            <div className="my-1 h-px bg-line" />
            <MenuLink href="/studio/">{studio ? "สตูดิโอ" : "ขอเปิดคิวเพลงให้ช่องของคุณ"}</MenuLink>
            <MenuLink href="/account/">โปรไฟล์</MenuLink>
            <div className="my-1 h-px bg-line" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void authStore
                  .signOut()
                  .then(() => toast("ออกจากระบบแล้ว", "success"))
                  .catch(() => toast("ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง", "error"));
              }}
              className="flex min-h-11 w-full cursor-pointer items-center rounded-xl px-3 text-left text-danger transition-colors hover:bg-fill"
            >
              ออกจากระบบ
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex min-h-11 items-center rounded-xl px-3 transition-colors hover:bg-fill"
    >
      {children}
    </Link>
  );
}

export function Avatar({ user, className = "" }: { user: AuthUser; className?: string }) {
  if (user.photo) {
    return (
      // no-referrer กันรูป Google โดน 429
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.photo}
        alt=""
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-ink text-sm font-bold text-onink ${className}`}
    >
      {user.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
