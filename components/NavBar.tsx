"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion, useScroll } from "motion/react";
import { BRAND, BRAND_MARK, BRAND_MONOGRAM } from "@/lib/brand";
import { ROLE_LABEL, useSiteRole, type SiteRole } from "@/hooks/useRole";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { recordActivity } from "@/lib/activity";
import Button from "@/components/ui/Button";
import ThemeSoundButtons from "@/components/ui/ThemeSound";
import { toast } from "@/components/ui/Toast";
import {
  IconDice,
  IconGauge,
  IconLogout,
  IconMusic,
  IconUsers,
  IconWheel,
} from "@/components/ui/icons";

type IconProps = { className?: string; strokeWidth?: number };

export type NavItem = {
  href: string;
  label: string;
  /** เลขบทชุดเดียวกับหัวหน้าเพจ เพื่อให้สารบัญท้ายเล่มอ้างเลขเดียวกัน */
  no: string;
  Icon: ComponentType<IconProps>;
  /**
   * เส้นทางอื่นที่ยังนับว่าอยู่ในเมนูนี้
   *
   * "ขอเพลง" มีสองหน้า: /songs/ คือสารบัญช่อง ส่วน /song/#h=... คือหน้าของช่องนั้น
   * ซึ่งไม่ใช่ลูกของ /songs/ ตามตัวอักษร ถ้าไม่บอกไว้ พอเข้าไปขอเพลงจริงแล้ว
   * เมนูจะดับหมดทั้งแถบ เหมือนหลุดออกไปนอกเว็บ
   */
  also?: string[];
};

/**
 * แถบเมนูสาธารณะ — เหลือเท่าที่ "คนที่เพิ่งเปิดเว็บครั้งแรก" ต้องใช้จริง
 *
 * ของเดิมแถบนี้แบกทุกหน้าในเว็บไว้ ทั้งหน้าจัดทัวร์ ตั้งค่าช่อง widget และหลังบ้าน
 * ซึ่งเป็นงานของคนที่ล็อกอินแล้วทั้งนั้น ผลคือแถบยาวจนต้องเลื่อนบนมือถือ
 * และผู้ชมทั่วไปเห็นเมนูที่กดแล้วเจอแต่หน้าล็อก
 *
 * ตอนนี้งานของผู้จัดย้ายไปอยู่หลังบ้านที่ /studio/ ทั้งหมด แถบนี้จึงเหลือ
 * แบรนด์ · เครื่องมือที่ใช้ได้ทันทีโดยไม่ต้องสมัคร · ปุ่มธีม/เสียง · บัญชี
 */
export const NAV: NavItem[] = [
  { href: "/draw/", label: "สุ่มทีม", no: "01", Icon: IconDice },
  { href: "/wheel/", label: "วงล้อ", no: "02", Icon: IconWheel },
  {
    href: "/songs/",
    label: "ขอเพลง",
    no: "06",
    Icon: IconMusic,
    also: ["/song/"],
  },
];

/** หน้าที่ไม่มีในเมนูแต่ต้องมีชื่อเวลาพลิกหน้า */
const EXTRA_TITLE: Record<string, string> = {
  "/": "หน้าแรก",
  "/tournament": "ทัวร์นาเมนต์",
  "/c": "สนับสนุนช่อง",
  "/song": "ขอเพลง",
  "/player": "เล่นเพลงตามคิว",
  "/account": "โปรไฟล์",
};

function cleanPath(path: string | null): string {
  return (path ?? "/").replace(/\/+$/, "") || "/";
}

/** ชื่อหน้าปลายทาง ใช้ทั้งใน AppShell ตอนพลิกหน้าและใน Footer */
export function navTitle(path: string | null): string {
  const current = cleanPath(path);
  if (EXTRA_TITLE[current]) return EXTRA_TITLE[current];
  const hit = NAV.find((item) => isActive(item.href, current, item.also));
  return hit?.label ?? BRAND;
}

function isActive(href: string, path: string | null, also: string[] = []) {
  const current = cleanPath(path);
  const hit = (raw: string) => {
    const clean = cleanPath(raw);
    return clean === "/" ? current === "/" : current.startsWith(clean);
  };
  return hit(href) || also.some(hit);
}

export default function NavBar({ wide = false }: { wide?: boolean }) {
  const pathname = usePathname();
  const [condensed, setCondensed] = useState(false);
  const [pending, setPending] = useState(false);
  const { scrollYProgress } = useScroll();

  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const { studio, role } = useSiteRole();

  // ย่อแถบลงเมื่อเลื่อนหน้าลง
  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    /*
      fixed ไม่ใช่ sticky — sticky ใช้ไม่ได้จริงบนหน้านี้

      body ตั้ง overflow-x ไว้กันแถบเลื่อนแนวนอน ซึ่งทำให้ body กลายเป็นกล่อง
      เลื่อนของตัวเอง แล้ว sticky จะยึดกับกล่องนั้นแทนที่จะยึดกับจอ ผลคือแถบ
      เลื่อนหายไปกับหน้า (แก้ overflow ที่ globals.css แล้ว แต่ fixed คือสิ่งที่
      ต้องการจริงอยู่ดี เพราะแถบต้องลอยอยู่เหนือเนื้อหาตลอดเวลา)
    */
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-[calc(0.75rem+var(--sat))] sm:px-5 lg:px-8">
      <div
        className={`mx-auto w-full ${wide ? "max-w-420" : "max-w-350"}`}
      >
        <div
          className={`nav-shell relative flex items-center gap-2 rounded-3xl ${
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
            <span className="hidden font-display text-sm font-medium tracking-[0.18em] sm:block">
              <span className="text-accent-grad">{BRAND_MARK}</span>
            </span>
          </Link>

          <span className="hidden h-6 w-px shrink-0 bg-[rgb(var(--hair)/var(--hair-a))] sm:block" />

          {/* เมนู — บทที่เปิดใช้ได้ทันทีโดยไม่ต้องสมัคร */}
          <nav className="flex min-w-0 flex-1 items-center gap-0.5">
            {NAV.map((item) => {
              const active = isActive(item.href, pathname, item.also);
              const Icon = item.Icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 font-display text-xs whitespace-nowrap transition-colors duration-300 sm:px-3.5 ${
                    active ? "text-onaccent" : "text-muted hover:text-ice"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl accent-fill shadow-[0_6px_20px_-8px_rgba(207,167,101,0.95)]"
                      transition={{ type: "spring", stiffness: 380, damping: 34 }}
                    />
                  )}
                  <span className="relative z-10 grid h-4 w-4 place-items-center opacity-90">
                    <Icon className="h-4 w-4" />
                  </span>
                  {/*
                    จอแคบเหลือแค่ไอคอน ยกเว้นเมนูที่กำลังเปิดอยู่ซึ่งยังโชว์ชื่อ

                    พอเมนูมีสามบท ป้ายครบทุกอันกินกว้างเกินแถบที่ 390px แล้วดัน
                    ปุ่มธีม/เสียง/บัญชีหลุดออกนอกกรอบไปเงียบๆ — เก็บป้ายของอันที่
                    เปิดอยู่ไว้ จะได้ยังรู้ว่าอยู่หน้าไหนโดยไม่ต้องเดาจากไอคอน
                  */}
                  <span
                    className={`relative z-10 ${active ? "inline" : "hidden sm:inline"}`}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>

          {/* ปุ่มขวา */}
          <div className="flex shrink-0 items-center gap-1">
            <ThemeSoundButtons />

            {hasBackend &&
              (user ? (
                <AccountMenu user={user} studio={studio} role={role} />
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  loading={pending}
                  aria-label="เข้าสู่ระบบ"
                  className="ml-0.5 shrink-0 whitespace-nowrap max-sm:px-2.5"
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
                  {/* จอเล็กเหลือแค่ไอคอน แถบจะได้ไม่ล้น */}
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
      </div>
    </header>
  );
}

/* =========================================================================
   เมนูบัญชี
   ========================================================================= */

type NavUser = {
  uid: string;
  name: string;
  email: string | null;
  photo?: string | null;
};

/**
 * กดรูปโปรไฟล์แล้วกางเมนู ไม่ใช่กระโดดไปหน้าบัญชีทันที
 *
 * รูปโปรไฟล์เป็นทางเข้าเดียวที่เหลือของแถบเมนูหลังรื้อ — มันจึงต้องพาไปได้
 * มากกว่าหนึ่งที่ ของเดิมกดแล้วไป /account/ อย่างเดียว แปลว่าคนที่อยากเข้าสตูดิโอ
 * หรือออกจากระบบต้องเดินผ่านหน้าบัญชีก่อนทุกครั้งโดยไม่มีเหตุผล
 */
function AccountMenu({
  user,
  studio,
  role,
}: {
  user: NavUser;
  studio: boolean;
  role: SiteRole;
}) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /* เปลี่ยนหน้าแล้วต้องปิด — ปรับ state ระหว่างเรนเดอร์ตามที่ React แนะนำ
     ไม่ใช่ setState ใน effect */
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  // คลิกนอกเมนู หรือกด Esc = ปิด
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
    <div ref={boxRef} className="relative ml-0.5 shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="เมนูบัญชี"
        title={`${user.name} — เมนูบัญชี`}
        className="relative grid h-9 w-9 cursor-pointer place-items-center"
      >
        <span
          className={`relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border transition-all duration-300 ${
            open ? "border-iris scale-105" : "border-iris/45 hover:scale-105"
          }`}
        >
          <span className="pointer-events-none absolute inset-0 animate-halo rounded-full" />
          <Avatar user={user} />
        </span>

        {/*
          จุดเล็กๆ บอกว่าบัญชีนี้มีสตูดิโอให้เข้า
          ต้องอยู่นอกวงกลมที่ overflow-hidden ไม่งั้นโดนตัดหายไปครึ่งเม็ด
        */}
        {studio && (
          <span
            aria-hidden
            style={{ boxShadow: "0 0 0 2px var(--color-ink)" }}
            className="accent-fill pointer-events-none absolute -right-px -bottom-px h-2.5 w-2.5 rounded-full"
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="เมนูบัญชี"
            initial={reduced ? false : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{ transformOrigin: "top right" }}
            className="glass-panel absolute top-full right-0 z-50 mt-2 w-60 rounded-2xl p-1.5"
          >
            {/* หัวเมนู — บอกว่ากำลังใช้บัญชีไหนอยู่ กันสลับบัญชีแล้วลืม */}
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-hair">
                <Avatar user={user} />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[13px] text-ice">
                  {user.name}
                </span>
                <span className="slug slug-2 mt-1 block leading-none">
                  {ROLE_LABEL[role]}
                </span>
              </span>
            </div>

            <span className="rule my-1 block h-px" />

            <MenuLink href="/account/" Icon={IconUsers} onDone={() => setOpen(false)}>
              โปรไฟล์ของฉัน
            </MenuLink>
            <MenuLink href="/studio/" Icon={IconGauge} onDone={() => setOpen(false)}>
              {studio ? "เข้าสตูดิโอ" : "ขอเปิดช่อง"}
            </MenuLink>

            <span className="rule my-1 block h-px" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void authStore
                  .signOut()
                  .then(() => {
                    recordActivity("auth.signout", "ออกจากระบบจากแถบเมนู");
                    toast("ออกจากระบบแล้ว", "success");
                  })
                  .catch(() => toast("ออกจากระบบไม่สำเร็จ", "error"));
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-left font-display text-[13px] text-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <IconLogout className="h-4 w-4 shrink-0" />
              ออกจากระบบ
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Avatar({ user }: { user: NavUser }) {
  if (user.photo) {
    return (
      // static export ใช้ next/image ไม่ได้ · no-referrer กันรูป Google โดน 429
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.photo}
        alt=""
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    );
  }
  return (
    <span className="font-display text-xs text-iris">{user.name.slice(0, 1)}</span>
  );
}

function MenuLink({
  href,
  Icon,
  onDone,
  children,
}: {
  href: string;
  Icon: ComponentType<IconProps>;
  onDone: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onDone}
      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 font-display text-[13px] text-muted transition-colors hover:bg-iris/10 hover:text-ice"
    >
      <Icon className="h-4 w-4 shrink-0" />
      {children}
    </Link>
  );
}

/** เดิมอยู่ในไฟล์นี้ — ย้ายไป components/ui/ThemeSound.tsx ให้สตูดิโอใช้ร่วมได้ */
export { default as ThemeSoundButtons } from "@/components/ui/ThemeSound";
