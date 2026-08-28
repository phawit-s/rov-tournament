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
 *
 * ★ ยังไม่เคยเลือกธีม = มืดเสมอ ไม่ตามค่าของเครื่อง ★
 * ของเดิมถาม prefers-color-scheme ก่อน คนที่ตั้งวินโดวส์เป็นธีมสว่าง (ซึ่งเป็น
 * ค่าเริ่มต้นของเครื่องส่วนใหญ่) จึงเปิดเว็บมาเจอธีมสว่างทั้งที่ตัวเว็บออกแบบ
 * มาบนพื้นหมึกดำ — ทั้งหน้าปก โปสเตอร์ทัวร์ และกราฟิกสำหรับสตรีมถูกวางสีบนพื้นเข้ม
 *
 * ธีมสว่างยังอยู่ครบและยังจำค่าที่เลือกไว้ ใครกดสลับก็ได้ของเขาต่อไปทุกครั้ง
 * — ที่เปลี่ยนคือ "ครั้งแรกที่ยังไม่เคยเลือก" เท่านั้น
 */
export const THEME_BOOT_SCRIPT = `(function(){try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf("${LEGACY_PREFIX}")===0){var n="${STORE_PREFIX}"+k.slice(${LEGACY_PREFIX.length});if(localStorage.getItem(n)===null){localStorage.setItem(n,localStorage.getItem(k));}}}}catch(e){}try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"){t="dark";}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
