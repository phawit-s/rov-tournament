"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BRAND_MONOGRAM } from "@/lib/brand";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import { recordActivity } from "@/lib/activity";
import { gateStore } from "@/lib/gate";
import { useHashParam } from "@/hooks/useClient";
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
  IconLogout,
  IconMenu,
} from "@/components/ui/icons";
import { Skeleton } from "@/components/tournament/ui";
import StreamerRequestPanel from "./StreamerRequest";
import {
  STUDIO_GROUPS,
  isStudioActive,
  studioNavFor,
  studioTitle,
  type StudioSub,
} from "./nav";

/**
 * เปลือกของหลังบ้าน — แถบข้างถาวรบนจอใหญ่ ลิ้นชักบนจอเล็ก
 *
 * ตั้งใจไม่ใช้ AppShell ของหน้าสาธารณะ เพราะสองที่นี้คนละงานกัน:
 * หน้าสาธารณะขายของ (ฉากหลังเคลื่อนไหว หน้าปก แอนิเมชันพลิกหน้า)
 * ส่วนหลังบ้านคือที่ทำงาน — เปิดค้างไว้ทั้งไลฟ์ ต้องนิ่ง เบา และหาเมนูเจอเสมอ
 */
export default function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/studio";
  const info = useSiteRole();
  const [open, setOpen] = useState(false);

  /* ปิดลิ้นชักเมื่อเปลี่ยนหน้า (รวมกรณีกดปุ่มย้อนกลับ)
     ปรับ state ระหว่างเรนเดอร์ตามที่ React แนะนำ ไม่ใช่ setState ใน effect */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  if (!info.studio) {
    return (
      <>
        <StudioLocked info={info} />
        <ToastHost />
      </>
    );
  }

  const admin = info.role === "admin";
  const title = studioTitle(pathname);

  return (
    <div className="relative min-h-dvh lg:flex">
      {/* ---- แถบข้าง (จอใหญ่) ---- */}
      <aside
        className="sticky top-0 hidden h-dvh w-66 shrink-0 flex-col border-r border-hair lg:flex"
        style={{ background: "var(--color-ink-2)" }}
      >
        <SidebarBody admin={admin} info={info} />
      </aside>

      {/* ---- เนื้อหา ---- */}
      <div className="flex min-w-0 grow flex-col">
        {/*
          พื้นทึบ ไม่ใช่เบลอ — แถบนี้ค้างอยู่ทั้งวันระหว่างไลฟ์ การเบลอฉากหลัง
          แปลว่าต้องสุ่มพื้นหลังมาวาดใหม่ทุกครั้งที่เนื้อหาข้างหลังขยับ
        */}
        <header
          className="sticky top-0 z-30 flex items-center gap-3 border-b border-hair px-4 lg:hidden"
          style={{
            background: "var(--color-ink)",
            paddingTop: "var(--sat)",
            height: "calc(3.5rem + var(--sat))",
          }}
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="เปิดเมนูสตูดิโอ"
            className="-ml-1.5 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-xl text-muted transition-colors hover:bg-iris/12 hover:text-iris"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <Mark />
          <p className="min-w-0 grow truncate font-display text-sm text-ice">
            {title}
          </p>
          <ThemeSoundButtons />
        </header>

        <main className="mx-auto w-full max-w-420 grow px-4 py-6 pb-[calc(2.5rem+var(--sab))] sm:px-6 lg:px-8 lg:py-9">
          {info.local && hasBackend && info.role === "viewer" && <LocalModeNotice />}
          <ProfileGate>{children}</ProfileGate>
        </main>
      </div>

      {/* ---- ลิ้นชัก (จอเล็ก) ---- */}
      <Drawer open={open} onClose={() => setOpen(false)}>
        <SidebarBody admin={admin} info={info} onNavigate={() => setOpen(false)} />
      </Drawer>

      <ToastHost />
    </div>
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

function SidebarBody({
  admin,
  info,
  onNavigate,
}: {
  admin: boolean;
  info: RoleInfo;
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
        className="flex shrink-0 items-center gap-2.5 border-b border-hair px-4"
        style={{ height: "calc(4rem + var(--sat))", paddingTop: "var(--sat)" }}
      >
        <Mark />
        <div className="min-w-0">
          <p className="font-display text-sm leading-none font-medium text-ice">
            สตูดิโอ
          </p>
          <p className="slug slug-2 mt-1.5 leading-none">Studio</p>
        </div>
      </div>

      <nav className="grow overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.key} className="mb-5 last:mb-0">
            <p className="slug px-3 pb-2">{group.title}</p>
            <ul>
              {nav
                .filter((item) => item.group === group.key)
                .map((item) => {
                  const active = isStudioActive(item.href, pathname);
                  const Icon = item.Icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        title={item.detail}
                        className={`group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 font-display text-[13px] transition-colors ${
                          active
                            ? "text-onaccent"
                            : "text-muted hover:bg-iris/8 hover:text-ice"
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId="studio-active"
                            className="accent-fill absolute inset-0 rounded-xl"
                            transition={{
                              type: "spring",
                              stiffness: 380,
                              damping: 34,
                            }}
                          />
                        )}
                        <span className="relative z-10 grid h-4 w-4 shrink-0 place-items-center">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="relative z-10 truncate">{item.label}</span>
                        {item.external && (
                          <span
                            aria-hidden
                            className={`relative z-10 ml-auto text-[10px] ${
                              active ? "text-onaccent/60" : "text-muted/60"
                            }`}
                          >
                            ↗
                          </span>
                        )}
                      </Link>

                      {/* ส่วนย่อยของหน้านั้น — กางเฉพาะตอนอยู่ในหน้านั้นจริง
                          ถ้ากางค้างไว้ตลอด แถบข้างจะยาวจนเมนูจริงหาย */}
                      {active && item.sub && (
                        <SubNav items={item.sub} onNavigate={onNavigate} />
                      )}
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>

      <SidebarFooter info={info} />
    </>
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
                window.location.hash = `tab=${sub.hash}`;
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

function SidebarFooter({ info }: { info: RoleInfo }) {
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
          {user?.photo ? (
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
          )}
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
