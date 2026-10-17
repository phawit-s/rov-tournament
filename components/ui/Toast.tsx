"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useHydrated } from "@/hooks/useClient";
import { IconCheck } from "./icons";

type Tone = "success" | "error" | "info";
type Item = { id: string; text: string; tone: Tone; ttl: number };

let items: Item[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const EMPTY: Item[] = [];

function emit() {
  listeners.forEach((l) => l());
}

export const toastStore = {
  subscribe(f: () => void) {
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  },
  getSnapshot: () => items,
  getServerSnapshot: () => EMPTY,
};

/** แจ้งผลสั้นๆ ที่ไม่ดันเลย์เอาต์ ลอยขึ้นจากขอบล่างกลางจอ */
export function toast(text: string, tone: Tone = "info", ttl = 2600) {
  const id = `t${++seq}`;
  items = [...items, { id, text, tone, ttl }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ttl);
}

/** วางครั้งเดียวในเปลือกของหน้า */
export default function ToastHost() {
  const hydrated = useHydrated();
  const list = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getServerSnapshot,
  );

  if (!hydrated) return null;

  return createPortal(
    /* --dock-space = ความสูงของ dock ในสตูดิโอ (ไม่มี dock = 0) — toast ต้องไม่ขึ้นทับเมนู */
    <div
      className="pointer-events-none fixed bottom-[calc(1rem+var(--dock-space,0px)+env(safe-area-inset-bottom))] left-1/2 z-90 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col items-center gap-2"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {list.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-[0.94rem] text-onink shadow-float"
            role={t.tone === "error" ? "alert" : "status"}
          >
            {t.tone === "success" && <IconCheck className="h-4 w-4 shrink-0" strokeWidth={2.4} />}
            {t.tone === "error" && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-live" aria-hidden />
            )}
            <span className="min-w-0">{t.text}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
