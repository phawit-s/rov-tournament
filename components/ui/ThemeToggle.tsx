"use client";

import { useSyncExternalStore } from "react";
import { themeStore } from "@/lib/theme";
import { IconMoon, IconSun } from "./icons";

/** สลับสว่าง/มืด — ไอคอนบอก "จะเปลี่ยนเป็นอะไร" ไม่ใช่ "ตอนนี้เป็นอะไร" */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );
  const next = theme === "dark" ? "สว่าง" : "มืด";

  return (
    <button
      type="button"
      onClick={() => themeStore.toggle()}
      aria-label={`เปลี่ยนเป็นธีม${next}`}
      title={`เปลี่ยนเป็นธีม${next}`}
      className={`grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-ink transition-colors hover:bg-fill ${className}`}
    >
      {theme === "dark" ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
    </button>
  );
}
