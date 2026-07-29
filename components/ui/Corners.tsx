import type { CSSProperties } from "react";

/**
 * มุมกล้องรูปตัว L สี่มุม — ใช้เฉพาะพื้นที่ที่ควร "รู้สึกเป็นจอ"
 * (ตู้จับสลาก / กรอบ QR / การ์ดแชมป์ / hero ทัวร์) ไม่เกินสองจุดต่อหน้า
 * วาดด้วย border ไม่ใช่ SVG จะได้คมทุกความละเอียดจอ
 */
export default function Corners({ len = 16, o = 0.5 }: { len?: number; o?: number }) {
  const b = `1px solid rgb(var(--st, var(--accent)) / ${o})`;
  const s: CSSProperties = { width: len, height: len, position: "absolute" };

  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      <span style={{ ...s, top: 0, left: 0, borderTop: b, borderLeft: b }} />
      <span style={{ ...s, top: 0, right: 0, borderTop: b, borderRight: b }} />
      <span style={{ ...s, bottom: 0, left: 0, borderBottom: b, borderLeft: b }} />
      <span style={{ ...s, bottom: 0, right: 0, borderBottom: b, borderRight: b }} />
    </span>
  );
}
