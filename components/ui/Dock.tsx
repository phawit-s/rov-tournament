"use client";

import { useEffect, useRef, type ComponentType } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { IconExternal } from "./icons";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

export type DockItem = {
  id: string;
  href: string;
  /** ชื่อเต็ม — ป้ายลอยบนจอกว้าง และชื่อที่โปรแกรมอ่านจอใช้ */
  label: string;
  /** ชื่อสั้นใต้ไอคอนบนมือถือ (ที่มีแค่ ~60px ต่อช่อง) */
  short?: string;
  Icon: IconType;
  active?: boolean;
  /** ตัวเลขงานค้าง — 0 = ไม่โชว์ */
  badge?: number;
  /** เปิดหน้าต่างใหม่ (ตัวเล่นที่ต้องเปิดค้างไว้แยก) */
  external?: boolean;
};

/** ขนาดไอคอน / ช่องว่างระหว่างไอคอน (px) / ขยายสุดกี่เท่าตอนเมาส์ชี้ / ระยะที่ไอคอนข้างๆ ขยายตาม */
const BASE = 48;
const GAP = 12;
const PEAK = 1.3;
const REACH = 140;

/**
 * แถบเมนูแบบ dock (ตามแบบ macOS) — ลอยกลางขอบล่างของจอ
 *
 * จอกว้าง: ไอคอนขยายตามเมาส์ที่ชี้ ป้ายชื่อลอยเหนือไอคอน จุดใต้ไอคอนบอกหน้าที่อยู่
 * มือถือ: แถบเต็มกว้างระดับนิ้วโป้ง ไอคอน + ชื่อสั้น ไม่ขยาย (นิ้วไม่มี hover
 *   และ Safari ยิง mousemove ปลอมตอนแตะ ถ้าใช้ mousemove ไอคอนที่แตะจะค้างขยาย)
 *
 * สลับสองแบบด้วย CSS (sm:) ไม่ใช่ JS — เรนเดอร์ครั้งแรกจากเซิร์ฟเวอร์ถูกตั้งแต่แรก
 * ไม่มีจังหวะที่จอกว้างเห็นแถบมือถือแวบหนึ่ง
 *
 * ขยับด้วย motion value ไม่ใช่ state — เมาส์ขยับทุกเฟรมแต่ React ไม่ต้องเรนเดอร์ใหม่
 *
 * ★ ขยายด้วย transform: scale เท่านั้น ไม่แตะ width/height ★
 * รุ่นแรกขยายด้วย width/height แล้ววัดตำแหน่งไอคอนสดๆ ทุกครั้งที่เมาส์ขยับ —
 * ไอคอนที่ใหญ่ขึ้นดัน dock ให้กว้างขึ้นแล้วจัดกึ่งกลางใหม่ ตำแหน่งที่วัดได้เลยเลื่อน
 * ขนาดเลยเปลี่ยนตาม วนกันไปมาจนสั่น (และทุกเฟรมต้องจัดเลย์เอาต์ + วาดเงาใหม่)
 * ตอนนี้ dock ขนาดตายตัว ไอคอนขยายจากฐานขึ้นไปบน ระยะห่างคิดจาก "ตำแหน่งตอนพัก"
 * ซึ่งเป็นค่าคงที่ — ไม่มีวงวน และเบราว์เซอร์ทำบน compositor ไม่ต้องจัดหน้าใหม่
 *
 * ไม่มี backdrop-filter — dock ลอยทับวิดีโอที่เล่นอยู่ เบลอฉากหลังต้องคิดใหม่ทุกเฟรมของวิดีโอ
 *
 * จองที่ท้ายจอไว้ใน --dock-space บน <html> — toast กับแถบบันทึกลอยใช้ค่านี้
 * ยกตัวเองขึ้นพ้น dock (toast ถูก portal ไปที่ body จึงรับค่าจากตัวแม่ไม่ได้)
 */
export default function Dock({ items, label }: { items: DockItem[]; label: string }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--dock-space", "5.5rem");
    return () => {
      root.style.removeProperty("--dock-space");
    };
  }, []);

  return (
    <nav
      aria-label={label}
      className="pointer-events-none fixed inset-x-0 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-3"
    >
      <WideDock items={items} />
      <PhoneDock items={items} />
    </nav>
  );
}

/* ------------------------------ จอกว้าง ------------------------------ */

function WideDock({ items }: { items: DockItem[] }) {
  const calm = useReducedMotion();
  /* ตำแหน่งเมาส์นับจากกึ่งกลาง dock — Infinity = ไม่ได้ชี้ ไอคอนทุกตัวขนาดปกติ */
  const mouseX = useMotionValue(Infinity);
  const boxRef = useRef<HTMLDivElement>(null);
  /* กึ่งกลาง dock วัดครั้งเดียวตอนเมาส์เข้า — dock ไม่เปลี่ยนขนาดแล้ว ค่านี้นิ่งตลอดการชี้ */
  const centerRef = useRef(0);

  return (
    <div
      ref={boxRef}
      onPointerEnter={() => {
        const box = boxRef.current?.getBoundingClientRect();
        if (box) centerRef.current = box.left + box.width / 2;
      }}
      onPointerMove={(e) => {
        if (!calm && e.pointerType === "mouse") mouseX.set(e.clientX - centerRef.current);
      }}
      onPointerLeave={() => mouseX.set(Infinity)}
      style={{ height: BASE + 20, gap: GAP }}
      className="pointer-events-auto hidden items-end rounded-[1.6rem] bg-paper px-2.5 pb-2.5 shadow-raise sm:flex"
    >
      {items.map((item, i) => (
        <WideTile
          key={item.id}
          item={item}
          mouseX={mouseX}
          /* กึ่งกลางของไอคอนนี้ตอนพัก นับจากกึ่งกลาง dock (padding ซ้ายขวาเท่ากัน) */
          rest={(i - (items.length - 1) / 2) * (BASE + GAP)}
        />
      ))}
    </div>
  );
}

function WideTile({
  item,
  mouseX,
  rest,
}: {
  item: DockItem;
  mouseX: MotionValue<number>;
  rest: number;
}) {
  /* ใกล้เมาส์ = ใหญ่ แล้วผ่านสปริงให้นุ่ม — ขึ้นกับเมาส์กับค่าคงที่เท่านั้น */
  const target = useTransform(mouseX, [rest - REACH, rest, rest + REACH], [1, PEAK, 1]);
  const scale = useSpring(target, { mass: 0.1, stiffness: 220, damping: 18 });
  /* ป้ายชื่อยกตามความสูงที่ไอคอนงอกขึ้น ไม่งั้นไอคอนที่ขยายจะทับป้าย */
  const lift = useTransform(scale, (v) => -(v - 1) * BASE);
  const { Icon } = item;
  const name = item.external ? `${item.label} (เปิดหน้าต่างใหม่)` : item.label;

  return (
    <Link
      href={item.href}
      aria-label={name}
      aria-current={item.active ? "page" : undefined}
      target={item.external ? "_blank" : undefined}
      rel={item.external ? "noopener" : undefined}
      className="group relative flex flex-col items-center outline-none"
      style={{ width: BASE, height: BASE }}
    >
      {/* ป้ายชื่อ — โผล่ตอนชี้หรือเลื่อนโฟกัสด้วยคีย์บอร์ด */}
      <motion.span
        aria-hidden
        style={{ y: lift }}
        className="pointer-events-none absolute bottom-full mb-2.5 rounded-full bg-ink px-3 py-1 text-sm font-medium whitespace-nowrap text-onink opacity-0 shadow-float transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        {item.label}
      </motion.span>

      <motion.span
        style={{ scale, originY: 1, width: BASE, height: BASE }}
        whileTap={{ scale: 0.9 }}
        className={`relative grid place-items-center rounded-[28%] transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ink ${
          item.active ? "bg-ink text-onink shadow-btn" : "bg-fill text-ink group-hover:bg-fill-2"
        }`}
      >
        <Icon className="h-[46%] w-[46%]" />
        {item.external && (
          <IconExternal className="absolute right-[14%] bottom-[14%] h-[20%] w-[20%] opacity-60" />
        )}
        {!!item.badge && <CountBubble n={item.badge} />}
      </motion.span>

      {/* จุดใต้ไอคอน = หน้าที่อยู่ (แบบแอปที่เปิดอยู่บน dock) */}
      <span
        aria-hidden
        className={`absolute -bottom-2 h-1 w-1 rounded-full bg-ink transition-opacity ${item.active ? "opacity-100" : "opacity-0"}`}
      />
    </Link>
  );
}

/* ------------------------------ มือถือ ------------------------------ */

function PhoneDock({ items }: { items: DockItem[] }) {
  return (
    <div className="pointer-events-auto flex w-full max-w-md items-stretch gap-1 rounded-[1.6rem] bg-paper p-1.5 shadow-raise sm:hidden">
      {items.map((item) => {
        const { Icon } = item;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener" : undefined}
            aria-label={item.external ? `${item.label} (เปิดหน้าต่างใหม่)` : item.label}
            className={`relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.15rem] px-1 transition-colors active:scale-[0.96] ${
              item.active ? "bg-ink text-onink" : "text-muted active:bg-fill"
            }`}
          >
            <span className="relative">
              <Icon className="h-6 w-6" />
              {!!item.badge && <CountBubble n={item.badge} />}
            </span>
            {/* ขั้นต่ำ 13px ตาม DESIGN.md · ชื่อยาวตัดท้ายแทนการดันช่องข้างๆ */}
            <span className={`max-w-full truncate text-[0.8rem] leading-tight ${item.active ? "font-semibold" : ""}`}>
              {item.short ?? item.label}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function CountBubble({ n }: { n: number }) {
  return (
    <span className="num absolute -top-1.5 -right-2 grid h-5 min-w-5 place-items-center rounded-full bg-live px-1.5 text-[0.75rem] leading-none font-semibold text-white ring-2 ring-paper">
      {n > 99 ? "99+" : n}
    </span>
  );
}
