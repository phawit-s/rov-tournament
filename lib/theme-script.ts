export type Theme = "dark" | "light";

/**
 * คีย์ธีมชุดใหม่ (ตุลาคม 2569 เปลี่ยนเป็นดีไซน์สว่าง)
 *
 * ตั้งใจไม่ใช้คีย์เดิม "tourney-hub/theme" — คนที่เคยกดเลือกธีมมืดไว้สมัยธีมม่วงหมึก
 * จะได้เห็นดีไซน์ใหม่ในโหมดที่มันออกแบบมาก่อน แล้วค่อยสลับเองถ้าชอบมืด
 */
export const THEME_KEY = "kiew/theme";

/**
 * รันก่อนเบราว์เซอร์วาดหน้าจอ ตั้งธีมกันจอกระพริบตอนโหลด
 * ไฟล์นี้ตั้งใจไม่ใส่ "use client" เพราะ layout (server component) ต้อง import ค่านี้
 *
 * ยังไม่เคยเลือก = สว่างเสมอ ไม่ตามค่าของเครื่อง — ดีไซน์ตั้งต้นบนพื้นขาว
 */
export const THEME_BOOT_SCRIPT = `(function(){var t="light";try{if(localStorage.getItem("${THEME_KEY}")==="dark"){t="dark";}}catch(e){}document.documentElement.dataset.theme=t;})();`;
