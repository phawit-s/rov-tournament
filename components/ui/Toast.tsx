"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { uid } from "@/lib/random";
import { useHydrated } from "@/hooks/useClient";

type Tone = "success" | "error" | "info";
type Item = { id: string; text: string; tone: Tone; ttl: number };

let items: Item[] = [];
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

/** แจ้งผลสั้นๆ ที่ไม่ดันเลย์เอาต์ — ใช้แทน <p> สถานะที่เคยแทรกอยู่ในฟอร์ม */
export function toast(text: string, tone: Tone = "info", ttl = 2600) {
  const id = uid();
  items = [...items, { id, text, tone, ttl }];
  emit();
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ttl);
}

const GLYPH: Record<Tone, { mark: string; color: string }> = {
  success: { mark: "✓", color: "rgb(var(--st-win))" },
  error: { mark: "✕", color: "#e79a9a" },
  info: { mark: "◆", color: "var(--color-champagne)" },
};

/** วางครั้งเดียวใน AppShell */
export default function ToastHost() {
  const hydrated = useHydrated();
  const list = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.getSnapshot,
    toastStore.getServerSnapshot,
  );

  if (!hydrated) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-[calc(1rem+var(--sab))] left-1/2 z-90 flex w-[min(92vw,26rem)] -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence initial={false}>
        {list.map((t) => {
          const g = GLYPH[t.tone];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="surface hairline-top pointer-events-auto relative w-full overflow-hidden rounded-xl px-4 py-3 shadow-lift-2"
              role="status"
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="font-display text-sm leading-none"
                  style={{ color: g.color }}
                  aria-hidden
                >
                  {g.mark}
                </span>
                <span className="text-sm text-ice">{t.text}</span>
              </span>

              <motion.span
                className="absolute inset-x-0 bottom-0 h-px origin-left bg-[linear-gradient(90deg,rgb(var(--accent)/.7),transparent)]"
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: t.ttl / 1000, ease: "linear" }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
