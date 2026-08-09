"use client";

import { useId, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * แถบแท็บมาตรฐานของทั้งเว็บ
 *
 * ก่อนหน้านี้แต่ละหน้าเขียนแท็บเองหมด (หน้าช่อง 1 ชุด, คอนโซลเพลง 1 ชุด,
 * หน้าเล่นเพลงอีก 1 ชุด) ซึ่งไม่ตรงกันสักที่ — บางชุดกดด้วยคีย์บอร์ดไม่ได้
 * บางชุดสูงไม่ถึง 44px และเม็ดยาที่เลื่อนตามก็ใช้ layoutId ชื่อชนกันได้ถ้าเผลอ
 * เอาสองชุดมาไว้หน้าเดียวกัน ตัวนี้จึงคุมทั้งสามเรื่องไว้ที่เดียว
 *
 * - เม็ดยาเลื่อนด้วย layoutId ที่ผูกกับ useId จึงไม่ชนกันแม้มีหลายชุดในหน้าเดียว
 * - ปุ่มสูงอย่างน้อย 44px ตามขนาดนิ้วขั้นต่ำ
 * - ลูกศรซ้าย/ขวา + Home/End เลื่อนแท็บได้ตามสเปก ARIA tablist
 */

export type TabItem<K extends string = string> = {
  key: K;
  label: string;
  /** ตัวเลขต่อท้ายชื่อแท็บ — ส่ง null เมื่อไม่อยากให้โชว์ */
  count?: number | null;
  /** "R G B" — จุดสีเล็กหน้าชื่อ ใช้บอกว่าแท็บนี้มีของค้างรออยู่ */
  dot?: string;
  icon?: ReactNode;
};

type Size = "sm" | "md";

const SIZE: Record<Size, string> = {
  sm: "px-3 py-2 text-xs",
  md: "px-3.5 py-2.5 text-sm",
};

const PILL = "accent-fill";

export default function Tabs<K extends string>({
  items,
  value,
  onChange,
  size = "sm",
  grow = true,
  bare = false,
  label,
  className = "",
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  size?: Size;
  /** true = ทุกแท็บกว้างเท่ากันเต็มแถว, false = กว้างตามชื่อแล้วเลื่อนแนวนอน */
  grow?: boolean;
  /** ไม่ต้องมีรางพื้นหลัง — ใช้ตอนวางซ้อนบนพื้นที่มีสีของตัวเองอยู่แล้ว */
  bare?: boolean;
  label: string;
  className?: string;
}) {
  const uid = useId();
  const reduced = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (to: number) => {
    const next = ((to % items.length) + items.length) % items.length;
    onChange(items[next].key);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`no-scrollbar flex gap-1 overflow-x-auto rounded-xl ${
        bare ? "" : "tile p-1"
      } ${className}`}
    >
      {items.map((tab, i) => {
        const on = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              else if (e.key === "ArrowLeft") move(i - 1);
              else if (e.key === "Home") move(0);
              else if (e.key === "End") move(items.length - 1);
              else return;
              e.preventDefault();
            }}
            className={`relative min-h-11 shrink-0 cursor-pointer rounded-lg font-display whitespace-nowrap transition-colors ${
              grow ? "grow basis-0" : ""
            } ${SIZE[size]} ${on ? "text-onaccent" : "text-muted hover:text-ice"}`}
          >
            {on &&
              (reduced ? (
                <span className={`absolute inset-0 rounded-lg ${PILL}`} />
              ) : (
                <motion.span
                  layoutId={`tabs-${uid}`}
                  className={`absolute inset-0 rounded-lg ${PILL}`}
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                />
              ))}

            <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
              {/* จุดสีบอกของค้าง — ซ่อนตอนแท็บนี้เปิดอยู่แล้ว เพราะเห็นของอยู่ตรงหน้า */}
              {tab.dot && !on && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: `rgb(${tab.dot})` }}
                />
              )}
              {tab.icon}
              {tab.label}
              {tab.count != null && (
                <span
                  className={`num text-eyebrow ${
                    on ? "text-onaccent/60" : "text-muted/70"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * แถบแท็บประจำหน้า — เกาะอยู่ใต้เมนูหลักตอนเลื่อนหน้า
 *
 * ใช้กับหน้าที่ยาวมากจนต้องแบ่งเป็นส่วนๆ (หน้าช่อง) พื้นหลังใช้ .nav-shell
 * ตัวเดียวกับเมนูหลัก เนื้อหาที่เลื่อนผ่านข้างล่างจะได้ไม่ทะลุขึ้นมาเห็น
 */
export function StickyTabs<K extends string>(props: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    /* -mx-1/px-1 กันเงาของแถบไม่ให้ถูกเฉือนตอนพ่อมี overflow ซ่อนอยู่ */
    <div className="sticky top-19 z-30 -mx-1 px-1 py-2">
      <div className="nav-shell rounded-2xl p-1">
        <Tabs {...props} size="md" grow bare />
      </div>
    </div>
  );
}
