"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { IconDice, IconMonitor, IconTrophy, IconWheel } from "../ui/icons";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

type Entry = {
  no: string;
  title: string;
  detail: string;
  href: string;
  /** ปลายทางแบบอ่านได้ ใช้เป็นเลขหน้าในสารบัญ */
  slug: string;
  Icon: IconType;
};

const INDEX: Entry[] = [
  {
    no: "01",
    title: "สุ่มแบ่งทีม",
    detail: "จับสลากทีละคน ล็อกผลด้วย seed",
    href: "/draw/",
    slug: "/draw",
    Icon: IconDice,
  },
  {
    no: "02",
    title: "วงล้อเสี่ยงโชค",
    detail: "สะบัดหมุนได้ ถ่วงน้ำหนักชื่อได้",
    href: "/wheel/",
    slug: "/wheel",
    Icon: IconWheel,
  },
  {
    no: "03",
    title: "จัดทัวร์นาเมนต์",
    detail: "รับสมัคร จัดสาย กรอกผล คิดเงินรางวัล",
    href: "/tournaments/",
    slug: "/tournaments",
    Icon: IconTrophy,
  },
  {
    no: "04",
    title: "Widget สตรีม",
    detail: "สกอร์บอร์ด คิวถัดไป ป้ายแชมป์",
    href: "/widgets/",
    slug: "/widgets",
    Icon: IconMonitor,
  },
];

/**
 * เลขบทสองชั้น — ตัวโปร่งเป็นฐาน แล้วซ้อนตัวทึบทับตอน hover
 * ทำแบบนี้เพราะ .text-outline เขียนไว้นอก @layer จึงชนะคลาสสีของ Tailwind เสมอ
 */
function IndexNo({ no }: { no: string }) {
  return (
    <span className="relative block">
      <span className="fig text-outline block text-xl transition-opacity duration-500 group-hover:opacity-0">
        {no}
      </span>
      <span
        aria-hidden
        className="fig absolute inset-0 block text-xl text-champagne opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      >
        {no}
      </span>
    </span>
  );
}

/**
 * สารบัญของเล่ม — ทำให้ครึ่งขวาของฮีโร่มีเนื้อหาจริงแทนงานอาร์ตที่เคยถูกซ่อนบนมือถือ
 * เส้นจุดนำสายตาแบบสูจิบัตร: ชื่อบท … เลขหน้า
 */
export default function HeroIndex({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="สารบัญเครื่องมือ" className={className}>
      <div className="flex items-baseline justify-between gap-4 border-b border-hair pb-2">
        <p className="slug">สารบัญ</p>
        <p className="slug slug-2 num">04 บท</p>
      </div>

      <ul>
        {INDEX.map((e) => (
          <li key={e.no}>
            <Link
              href={e.href}
              className="group grid grid-cols-[2.5rem_auto_1fr_auto] items-baseline gap-x-3 border-b border-hair py-3"
            >
              <IndexNo no={e.no} />

              <span className="flex min-w-0 items-baseline gap-2">
                <e.Icon
                  className="h-3.5 w-3.5 translate-y-[0.15em] shrink-0 text-champagne/70 transition-colors duration-500 group-hover:text-champagne"
                  strokeWidth={1.4}
                />
                <span className="min-w-0">
                  <span className="block truncate font-display text-lg font-light text-ice transition-transform duration-500 group-hover:translate-x-0.5">
                    {e.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    {e.detail}
                  </span>
                </span>
              </span>

              {/* เส้นจุดนำสายตา — วางให้อยู่ระดับเดียวกับเส้นฐานตัวอักษร */}
              <span className="translate-y-[-0.3em] border-b border-dotted border-hair transition-colors duration-500 group-hover:border-[rgb(var(--accent)/.6)]" />

              {/* ใช้คู่สีแพลทินัมแทน text-muted เพราะ .slug กำหนด color ไว้นอก @layer จึงชนะคลาสสีเสมอ */}
              <span className="slug slug-2 shrink-0 opacity-70 transition-opacity duration-500 group-hover:opacity-100">
                {e.slug}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted">
        ทุกบทเปิดใช้ได้ทันที ไม่ต้องสมัคร — ข้อมูลอยู่ในเบราว์เซอร์เครื่องนี้
      </p>
    </nav>
  );
}
