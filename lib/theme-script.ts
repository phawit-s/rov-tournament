export type Theme = "dark" | "light";

/** คีย์ทั้งหมดของเว็บขึ้นต้นด้วยคำนี้ */
export const STORE_PREFIX = "tourney-hub/";

/** คีย์ชุดเดิมสมัยที่เว็บยังผูกกับเกมเดียว ต้องย้ายให้ผู้ใช้เก่าไม่เสียข้อมูล */
const LEGACY_PREFIX = "rov-randomizer/";

export const THEME_KEY = `${STORE_PREFIX}theme`;

/**
 * รันก่อนเบราว์เซอร์วาดหน้าจอ ทำสองอย่าง
 *  1. ย้ายข้อมูลจากคีย์ชุดเดิมมาชุดใหม่ครั้งเดียว ต้องทำก่อน store ตัวไหนอ่าน
 *  2. ตั้งธีมกันจอกระพริบตอนโหลด
 * ไฟล์นี้ตั้งใจไม่ใส่ "use client" เพราะ layout (server component) ต้อง import ค่านี้
 */
export const THEME_BOOT_SCRIPT = `(function(){try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf("${LEGACY_PREFIX}")===0){var n="${STORE_PREFIX}"+k.slice(${LEGACY_PREFIX.length});if(localStorage.getItem(n)===null){localStorage.setItem(n,localStorage.getItem(k));}}}}catch(e){}try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
