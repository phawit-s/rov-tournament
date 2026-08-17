"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { muteStore, sfx } from "@/lib/sound";
import { themeStore } from "@/lib/theme";
import {
  IconMoon,
  IconMute,
  IconSun,
  IconVolume,
} from "@/components/ui/icons";

/**
 * ปุ่มธีมกับเสียง — แถบเมนู ท้ายเล่ม และแถบข้างของสตูดิโอใช้ชุดเดียวกันนี้
 * แยกออกมาจาก NavBar เพราะสตูดิโอไม่มี NavBar แต่ยังต้องมีปุ่มสองตัวนี้
 */
export default function ThemeSoundButtons({
  className = "",
}: {
  className?: string;
}) {
  const reduced = useReducedMotion();
  const muted = useSyncExternalStore(
    muteStore.subscribe,
    muteStore.getSnapshot,
    muteStore.getServerSnapshot,
  );
  const theme = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    themeStore.getServerSnapshot,
  );

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <IconButton
        onClick={() => {
          sfx.play("click");
          themeStore.toggle();
        }}
        label={theme === "dark" ? "ธีมสว่าง" : "ธีมมืด"}
      >
        <SwapIcon swapKey={theme} reduced={reduced}>
          {theme === "dark" ? (
            <IconSun className="h-4 w-4" />
          ) : (
            <IconMoon className="h-4 w-4" />
          )}
        </SwapIcon>
      </IconButton>

      <IconButton
        onClick={() => muteStore.toggle()}
        label={muted ? "เปิดเสียง" : "ปิดเสียง"}
      >
        <SwapIcon swapKey={muted ? "mute" : "on"} reduced={reduced}>
          {muted ? (
            <IconMute className="h-4 w-4" />
          ) : (
            <IconVolume className="h-4 w-4" />
          )}
        </SwapIcon>
      </IconButton>
    </div>
  );
}

/** สลับไอคอนแบบหมุนเข้า-ออก ให้การกดปุ่มมีน้ำหนักกว่าการเปลี่ยนตัวอักษรเฉยๆ */
function SwapIcon({
  swapKey,
  reduced,
  children,
}: {
  swapKey: string;
  reduced: boolean | null;
  children: ReactNode;
}) {
  if (reduced) {
    return <span className="grid h-4 w-4 place-items-center">{children}</span>;
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={swapKey}
        initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        className="grid h-4 w-4 place-items-center"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

export function IconButton({
  children,
  onClick,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-all duration-300 hover:bg-iris/12 hover:text-iris active:scale-90"
    >
      {children}
    </button>
  );
}
