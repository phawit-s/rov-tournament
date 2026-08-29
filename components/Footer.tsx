"use client";

import Link from "next/link";
import { gateStore } from "@/lib/gate";
import { useSiteRole } from "@/hooks/useRole";
import ThemeSoundButtons from "./ui/ThemeSound";
import { IconLock, IconUnlock } from "./ui/icons";
import { NAV } from "./NavBar";
import { studioNavFor } from "./studio/nav";

/** บรรทัดข้อมูลเล่ม — ข้อเท็จจริงของเว็บ ไม่ใช่คำโฆษณา */
const COLOPHON = [
  "ทำงานออฟไลน์ได้",
  "ข้อมูลเก็บในเบราว์เซอร์",
  "เผยแพร่เมื่อกดเอง",
];

/** หน้าสาธารณะที่ไม่ได้อยู่ในแถบเมนู แต่ควรหาเจอจากท้ายเล่ม */
const PUBLIC_EXTRA = [
  { href: "/c/", label: "สนับสนุนช่อง", no: "03" },
  { href: "/account/", label: "โปรไฟล์ของฉัน", no: "04" },
];

/**
 * องก์ปิดของทุกหน้า — สารบัญท้ายเล่ม ข้อมูลเล่ม
 *
 * ตั้งแต่แถบเมนูถูกรื้อให้เหลือเท่าที่คนเปิดเว็บครั้งแรกต้องใช้
 * ท้ายเล่มกลายเป็นที่เดียวที่เห็น "ทั้งเล่ม" — ทั้งหน้าสาธารณะและทางเข้าสตูดิโอ
 * ปีที่แสดงเป็นค่าคงที่ ไม่ใช้ new Date() เพราะ static export จะ prerender ค่าไว้ตอน build
 */
export default function Footer() {
  const { role, local, studio } = useSiteRole();
  const admin = role === "admin";
  const studioNav = studioNavFor(admin);

  return (
    <footer className="relative mt-16">
      <div className="hairline-top relative border-t border-hair pt-8">
        <div className="flex items-baseline justify-between gap-4">
          <p className="slug">ท้ายเล่ม · COLOPHON</p>
          <p className="slug slug-2 num">ฉบับ 2026</p>
        </div>

        <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-4">
          <FooterColumn
            title="เครื่องมือ"
            items={NAV.map((item) => ({
              href: item.href,
              label: item.label,
              no: item.no,
            }))}
          />

          <FooterColumn title="สำหรับผู้ชม" items={PUBLIC_EXTRA} />

          {/* ทางเข้าหลังบ้าน — โผล่เฉพาะคนที่มีสิทธิ์จริง คนอื่นไม่ต้องเห็นเมนูที่กดแล้วเจอหน้าล็อก */}
          {studio ? (
            <FooterColumn
              title="สตูดิโอ"
              items={studioNav
                .slice(0, 6)
                .map((item, i) => ({
                  href: item.href,
                  label: item.label,
                  no: String(i + 1).padStart(2, "0"),
                }))}
            />
          ) : (
            <div>
              <p className="slug">เป็นสตรีมเมอร์</p>
              <span className="rule mt-3 block h-px" />
              <p className="mt-3 text-sm leading-relaxed text-muted">
                เปิดช่องรับโดเนท เปิดคิวขอเพลง และจัดทัวร์นาเมนต์ได้
                จากหลังบ้านชุดเดียว
              </p>
              <Link
                href="/studio/"
                className="mt-3 inline-flex items-center gap-2 font-display text-xs text-iris transition-colors hover:text-ice"
              >
                ขอเปิดช่อง
                <span aria-hidden>→</span>
              </Link>
            </div>
          )}

          <div>
            <p className="slug">เกี่ยวกับ</p>
            <span className="rule mt-3 block h-px" />
            <p className="mt-3 text-sm leading-relaxed text-muted">
              เครื่องมือจัดทัวร์นาเมนต์ครบชุดในหน้าเดียว ใช้ได้กับทุกเกม —
              สุ่มทีม จัดสาย วงล้อ และกราฟิกสำหรับสตรีม
            </p>
            <Link
              href="/"
              className="mt-3 inline-flex items-center gap-2 font-display text-xs text-iris transition-colors hover:text-ice"
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
            {studio ? (
              <Link
                href="/studio/"
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-display text-xs text-iris transition-colors hover:bg-iris/10"
              >
                <IconUnlock className="h-3.5 w-3.5" />
                เข้าสตูดิโอ
              </Link>
            ) : (
              <Link
                href="/studio/"
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-display text-xs text-muted transition-colors hover:text-iris"
              >
                <IconLock className="h-3.5 w-3.5" />
                สตรีมเมอร์
              </Link>
            )}
            {local && (
              <button
                type="button"
                onClick={() => gateStore.lock()}
                className="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 font-display text-xs text-muted transition-colors hover:text-iris"
              >
                ออกจากโหมดผู้จัด
              </button>
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
    </footer>
  );
}

function FooterColumn({
  title,
  items,
}: {
  title: string;
  items: { href: string; label: string; no: string }[];
}) {
  return (
    <div>
      <p className="slug">{title}</p>
      <span className="rule mt-3 block h-px" />
      <ul className="mt-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="group flex items-baseline gap-2.5 py-1.5 text-sm text-muted transition-colors hover:text-ice"
            >
              <span className="num text-eyebrow text-iris/45 transition-colors group-hover:text-iris">
                {item.no}
              </span>
              <span className="truncate">{item.label}</span>
              <span className="h-px flex-1 self-center border-b border-dotted border-hair transition-colors group-hover:border-[rgb(var(--accent)/.6)]" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
