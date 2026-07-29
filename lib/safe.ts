/**
 * ตัวกรองค่าที่จะเอาไปใส่ href / src
 *
 * ข้อมูลทัวร์อาจมาจากลิงก์แชร์หรือจากคลาวด์ที่คนอื่นเป็นคนกรอก
 * ถ้าปล่อยให้ใส่ javascript: ลงไปแล้วมีคนกด = รันสคริปต์ในหน้าเราได้เลย
 */

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

/** คืน URL ถ้าปลอดภัย ไม่งั้นคืน null */
export function safeUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value, "https://example.invalid");
    // ลิงก์แบบ relative จะได้ base ปลอมด้านบน ถือว่าปลอดภัย
    if (!value.includes(":")) return value;
    return SAFE_PROTOCOLS.includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

/** รับเฉพาะรูปที่เป็น data URL จริงๆ กัน data:text/html แอบแฝง */
export function safeImageSrc(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (/^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(value)) {
    return value;
  }
  return safeUrl(value);
}

/** ตัดข้อมูลติดต่อออกก่อนเผยแพร่ — เบอร์/ไอดีไลน์ไม่ควรโผล่ในลิงก์สาธารณะ */
export function stripContacts<T extends { teams: { contact?: string }[] }>(
  data: T,
): T {
  return {
    ...data,
    teams: data.teams.map((team) => {
      const copy = { ...team };
      delete copy.contact;
      return copy;
    }),
  };
}
