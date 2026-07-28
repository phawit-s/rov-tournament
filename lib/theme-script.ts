export type Theme = "dark" | "light";

export const THEME_KEY = "rov-randomizer/theme";

/**
 * รันก่อนเบราว์เซอร์วาดหน้าจอ กันจอกระพริบตอนโหลด
 * ไฟล์นี้ตั้งใจไม่ใส่ "use client" เพราะ layout (server component) ต้อง import ค่านี้
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
