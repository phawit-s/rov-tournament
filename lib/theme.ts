"use client";

import { THEME_KEY, type Theme } from "./theme-script";

export type { Theme };

let cache: Theme | null = null;
const listeners = new Set<() => void>();

function read(): Theme {
  if (cache) return cache;
  if (typeof document === "undefined") return "dark";
  cache = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  return cache;
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "light" ? "#f4f1ea" : "#0a0a0e");
}

/** external store สำหรับ useSyncExternalStore — จำธีมไว้ใน localStorage */
export const themeStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  },
  getSnapshot: (): Theme => read(),
  getServerSnapshot: (): Theme => "dark",
  set(theme: Theme) {
    cache = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* โหมดส่วนตัวก็ปล่อยไป */
    }
    apply(theme);
    listeners.forEach((listener) => listener());
  },
  toggle() {
    themeStore.set(read() === "dark" ? "light" : "dark");
  },
};
