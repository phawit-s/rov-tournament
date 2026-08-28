"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { IconExternal, IconSearch } from "@/components/ui/icons";
import {
  STUDIO_GROUPS,
  searchStudio,
  studioNavFor,
  type StudioItem,
} from "./nav";

/**
 * ตัวค้นหาเมนู (Ctrl/⌘ + K)
 *
 * หลังบ้านมีสิบกว่าหน้า แถบข้างจัดกลุ่มไว้ก็จริงแต่ต้องรู้ก่อนว่าของที่หาอยู่
 * "อยู่กลุ่มไหน" — คนที่นึกออกแค่ว่าอยากตั้ง "พร้อมเพย์" ต้องเดาว่ามันอยู่ใต้
 * ช่องของฉัน ที่นี่พิมพ์คำที่นึกออกแล้วกด Enter จบ
 *
 * ค้นจาก STUDIO_NAV ชุดเดียวกับแถบข้าง จึงไม่มีทางมีเมนูที่ค้นเจอแต่กดไม่ได้
 * (หรือกลับกัน) และไม่ต้องมาตามอัปเดตสองที่
 */
export default function CommandPalette({
  open,
  admin,
  badges,
  onClose,
}: {
  open: boolean;
  admin: boolean;
  badges: { streamerRequests: number };
  onClose: () => void;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const nav = useMemo(() => studioNavFor(admin), [admin]);
  const hits = useMemo(() => searchStudio(nav, q), [nav, q]);

  /* เปิดใหม่ทุกครั้ง = เริ่มจากคำค้นเปล่า ไม่ใช่ของค้างจากรอบก่อน
     ล้างระหว่างเรนเดอร์ตามที่ React แนะนำ ไม่ใช่ setState ใน effect */
  const [seenOpen, setSeenOpen] = useState(open);
  if (seenOpen !== open) {
    setSeenOpen(open);
    if (open) {
      setQ("");
      setCursor(0);
    }
  }

  useEffect(() => {
    if (!open) return;
    // โฟกัสหลังแอนิเมชันเริ่ม ไม่งั้นบางเบราว์เซอร์เลื่อนหน้าตามช่องที่ยังไม่นิ่ง
    const id = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [open]);

  /* คำค้นเปลี่ยน แถวที่เลือกอยู่ต้องกลับไปแถวแรกเสมอ
     ปรับ state ระหว่างเรนเดอร์ตามที่ React แนะนำ ไม่ใช่ setState ใน effect */
  const [seenQ, setSeenQ] = useState(q);
  if (seenQ !== q) {
    setSeenQ(q);
    setCursor(0);
  }

  const go = (item: StudioItem) => {
    onClose();
    if (item.external) window.open(item.href, "_blank", "noopener");
    else router.push(item.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (hits.length ? (c + 1) % hits.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (hits.length ? (c - 1 + hits.length) % hits.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[cursor];
      if (hit) go(hit);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
          <motion.button
            type="button"
            aria-label="ปิดตัวค้นหา"
            onClick={onClose}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[2px]"
          />

          <motion.div
            role="dialog"
            aria-label="ค้นหาเมนูในสตูดิโอ"
            initial={reduced ? false : { opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="surface relative w-full max-w-xl overflow-hidden rounded-2xl shadow-lift-3"
            onKeyDown={onKeyDown}
          >
            <div className="flex items-center gap-3 border-b border-hair px-4 py-3">
              <IconSearch className="h-4 w-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="พิมพ์ชื่อหน้า หรือสิ่งที่อยากทำ — เช่น โดเนท, สาย, OBS"
                className="min-w-0 grow bg-transparent text-sm text-ice outline-none placeholder:text-muted/70"
              />
              <kbd className="num shrink-0 rounded-md border border-hair px-1.5 py-0.5 text-[0.625rem] text-muted/80">
                Esc
              </kbd>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-1.5">
              {hits.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  ไม่เจอเมนูที่ตรงกับ &ldquo;{q}&rdquo;
                </p>
              ) : (
                STUDIO_GROUPS.filter((g) =>
                  hits.some((h) => h.group === g.key),
                ).map((group) => (
                  <div key={group.key} className="mb-1 last:mb-0">
                    <p className="slug px-3 pt-2 pb-1.5">{group.title}</p>
                    {hits
                      .filter((h) => h.group === group.key)
                      .map((item) => {
                        const index = hits.indexOf(item);
                        const on = index === cursor;
                        const Icon = item.Icon;
                        const count = item.badge ? badges[item.badge] : 0;
                        return (
                          <button
                            key={item.href}
                            type="button"
                            onMouseEnter={() => setCursor(index)}
                            onClick={() => go(item)}
                            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                              on ? "bg-iris/14 text-ice" : "text-ice/80"
                            }`}
                          >
                            <span
                              className={`sunken grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                                on ? "text-iris" : "text-muted"
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5 font-display text-sm">
                                {item.label}
                                {item.external && (
                                  <IconExternal className="h-3 w-3 shrink-0 opacity-50" />
                                )}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted">
                                {item.detail}
                              </span>
                            </span>
                            {count > 0 && (
                              <span className="num shrink-0 rounded-full bg-iris/18 px-2 py-0.5 text-[0.625rem] text-iris">
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-3 border-t border-hair px-4 py-2.5 text-eyebrow text-muted">
              <span className="flex items-center gap-1.5">
                <kbd className="num rounded border border-hair px-1">↑</kbd>
                <kbd className="num rounded border border-hair px-1">↓</kbd>
                เลื่อน
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="num rounded border border-hair px-1">Enter</kbd>
                เปิด
              </span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
