/**
 * ชื่อแบรนด์อยู่ที่เดียว — เว็บนี้ไม่ผูกกับเกมใดเกมหนึ่ง
 * อยากเปลี่ยนชื่อทั้งเว็บให้แก้ที่ไฟล์นี้ไฟล์เดียว
 */
export const BRAND = "Steamer Hub";

/** ตัวพิมพ์ใหญ่ ใช้เป็น wordmark บนหน้าปก ท้ายเล่ม และลายน้ำในรูป */
export const BRAND_MARK = "STEAMER HUB";

/** แยกคำไว้ให้หน้าปกเผยทีละคำ */
export const BRAND_WORDS = ["STEAMER", "HUB"];

/** อักษรเดียวในวงกลมของแถบเมนู */
export const BRAND_MONOGRAM = "S";

/** ต่อท้าย title ของทุกหน้า */
export const pageTitle = (name: string) => `${name} — ${BRAND}`;
