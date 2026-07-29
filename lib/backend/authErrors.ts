/** แปลรหัสข้อผิดพลาดของ Firebase Auth เป็นข้อความที่คนอ่านรู้เรื่อง */
const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
  "auth/user-disabled": "บัญชีนี้ถูกระงับ",
  "auth/user-not-found": "ไม่พบบัญชีนี้ ลองสมัครใหม่",
  "auth/wrong-password": "รหัสผ่านไม่ถูกต้อง",
  "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
  "auth/email-already-in-use": "อีเมลนี้มีบัญชีอยู่แล้ว ลองเข้าสู่ระบบแทน",
  "auth/weak-password": "รหัสผ่านสั้นเกินไป ต้องอย่างน้อย 6 ตัว",
  "auth/too-many-requests": "ลองผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่",
  "auth/network-request-failed": "เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตอีกที",
  "auth/popup-closed-by-user": "ปิดหน้าต่างล็อกอินไปก่อน",
  "auth/popup-blocked": "เบราว์เซอร์บล็อกป็อปอัป ลองอนุญาตแล้วกดใหม่",
  "auth/unauthorized-domain":
    "โดเมนนี้ยังไม่ได้อนุญาตใน Firebase (Authentication → Settings → Authorized domains)",
  "auth/operation-not-allowed":
    "ยังไม่ได้เปิดวิธีล็อกอินนี้ใน Firebase Console",
};

export function authErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return MESSAGES[code] ?? (err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
}
