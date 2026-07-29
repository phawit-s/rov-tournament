"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { BRAND_MARK } from "@/lib/brand";
import { gateStore } from "@/lib/gate";
import { IconLock, IconUnlock } from "./ui/icons";
import { NAV_GROUPS, ThemeSoundButtons, visibleNav } from "./NavBar";

/** บรรทัดข้อมูลเล่ม — ข้อเท็จจริงของเว็บ ไม่ใช่คำโฆษณา */
const COLOPHON = [
  "ทำงานออฟไลน์ได้",
  "ข้อมูลเก็บในเบราว์เซอร์",
  "เผยแพร่เมื่อกดเอง",
];

/**
 * องก์ปิดของทุกหน้า — สารบัญท้ายเล่ม ข้อมูลเล่ม แล้วปิดด้วย wordmark ที่จมขอบจอ
 * ปีที่แสดงเป็นค่าคงที่ ไม่ใช้ new Date() เพราะ static export จะ prerender ค่าไว้ตอน build
 */
export default function Footer() {
  const admin = useSyncExternalStore(
    gateStore.subscribe,
    gateStore.getSnapshot,
    gateStore.getServerSnapshot,
  );
  const nav = visibleNav(admin);
  const groups = NAV_GROUPS.filter((g) =>
    nav.some((item) => item.group === g.key),
  );

  return (
    <footer className="relative mt-16">
      <div className="hairline-top relative border-t border-hair pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <p className="slug">ท้ายเล่ม · COLOPHON</p>
          <p className="slug slug-2 num">ฉบับ 2026</p>
        </div>

        {/* สารบัญท้ายเล่ม — สร้างจาก NAV ชุดเดียวกับแถบเมนู */}
        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-4">
          {groups.map((group) => (
            <div key={group.key}>
              <p className="slug">{group.title}</p>
              <span className="rule mt-3 block h-px" />
              <ul className="mt-2">
                {nav
                  .filter((item) => item.group === group.key)
                  .map((item) => {
                    const Icon = item.Icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="group flex items-baseline gap-2.5 py-1.5 text-sm text-muted transition-colors hover:text-ice"
                        >
                          <span className="num text-eyebrow text-champagne/45 transition-colors group-hover:text-champagne">
                            {item.no}
                          </span>
                          <span className="truncate">{item.label}</span>
                          <span className="h-px flex-1 self-center border-b border-dotted border-hair transition-colors group-hover:border-[rgb(var(--accent)/.6)]" />
                          <Icon className="h-3.5 w-3.5 self-center opacity-35 transition-opacity group-hover:opacity-90" />
                        </Link>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}

          <div>
            <p className="slug">เกี่ยวกับ</p>
            <span className="rule mt-3 block h-px" />
            <p className="mt-3 text-sm leading-relaxed text-muted">
              เครื่องมือจัดทัวร์นาเมนต์ครบชุดในหน้าเดียว ใช้ได้กับทุกเกม —
              สุ่มทีม จัดสาย วงล้อ และกราฟิกสำหรับสตรีม
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center gap-2 font-display text-xs text-champagne transition-colors hover:text-ice"
            >
              กลับหน้าแรก
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        {/* บรรทัดข้อมูลเล่ม + ปุ่มธีม/เสียงชุดเดียวกับแถบเมนู */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-hair pt-5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            {COLOPHON.map((text, i) => (
              <span key={text} className="flex items-center gap-2">
                {i > 0 && (
                  <span
                    aria-hidden
                    className="inline-block h-[3px] w-[3px] rotate-45 bg-[rgb(var(--accent)/.5)]"
                  />
                )}
                {text}
              </span>
            ))}
          </p>
          <div className="flex items-center gap-1">
            {/* ทางเข้าโหมดผู้จัด — วางท้ายเล่มไว้ ผู้ชมทั่วไปไม่ต้องสนใจ */}
            {admin ? (
              <button
                type="button"
                onClick={() => gateStore.lock()}
                className="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 font-display text-xs text-champagne transition-colors hover:bg-champagne/10"
              >
                <IconUnlock className="h-3.5 w-3.5" />
                ออกจากโหมดผู้จัด
              </button>
            ) : (
              <Link
                href="/tournaments/"
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-display text-xs text-muted transition-colors hover:text-champagne"
              >
                <IconLock className="h-3.5 w-3.5" />
                ผู้จัดแข่ง
              </Link>
            )}
            <ThemeSoundButtons />
          </div>
        </div>

        {/* ขีดไม้บรรทัด — รายละเอียดเล็กๆ ที่ทำให้ท้ายเล่มดูเป็นงานพิมพ์ */}
        <div className="mt-7 flex items-end gap-1.5 opacity-45" aria-hidden>
          {Array.from({ length: 28 }).map((_, i) => (
            <span
              key={i}
              className={`w-px bg-[rgb(var(--hair)/var(--hair-a))] ${
                i % 7 === 0 ? "h-3" : "h-1.5"
              }`}
            />
          ))}
        </div>
      </div>

      {/* wordmark ปิดเล่ม — ตัดครึ่งตัวอักษรให้จมขอบล่างจอ */}
      <div className="band mt-6 overflow-hidden">
        <p
          aria-hidden
          className="fig text-gold-grad h-[0.62em] overflow-hidden text-center text-[clamp(2.2rem,12vw,8rem)] leading-none whitespace-nowrap select-none"
        >
          {BRAND_MARK}
        </p>
      </div>
    </footer>
  );
}
