/**
 * สร้าง payload พร้อมเพย์ (มาตรฐาน EMVCo QR)
 * ใช้สร้าง QR ให้คนสแกนโอนได้เลย ทำงานฝั่ง client ล้วน ไม่ต้องมีเซิร์ฟเวอร์
 */

const AID_PROMPTPAY = "A000000677010111";

function tag(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

/** CRC16-CCITT (init 0xFFFF, poly 0x1021) ตามสเปกของ EMVCo */
function crc16(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type PromptPayTarget =
  | { kind: "phone"; value: string }
  | { kind: "nationalId"; value: string }
  | { kind: "ewallet"; value: string };

/** เดาให้ว่าเลขที่กรอกมาเป็นเบอร์ เลขบัตร หรือ e-wallet */
export function detectTarget(raw: string): PromptPayTarget | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return { kind: "phone", value: digits };
  }
  if (digits.length === 13) return { kind: "nationalId", value: digits };
  if (digits.length === 15) return { kind: "ewallet", value: digits };
  if (digits.length === 9) return { kind: "phone", value: `0${digits}` };
  return null;
}

function targetTag(target: PromptPayTarget): string {
  if (target.kind === "phone") {
    // 0066 + เบอร์ 9 หลัก (ตัด 0 นำหน้าออก) รวมเป็น 13 หลัก
    const nine = target.value.replace(/\D/g, "").replace(/^0/, "");
    return tag("01", `0066${nine}`.padStart(13, "0"));
  }
  if (target.kind === "nationalId") return tag("02", target.value);
  return tag("03", target.value);
}

/**
 * คืนสตริงที่เอาไปทำ QR ได้เลย
 * ใส่ amount = ไม่ระบุ ถ้าอยากให้ผู้โอนกรอกเอง
 */
export function promptPayPayload(rawId: string, amount?: number): string | null {
  const target = detectTarget(rawId);
  if (!target) return null;

  const hasAmount = typeof amount === "number" && amount > 0;

  const payload =
    tag("00", "01") +
    // 11 = สแกนซ้ำได้ / 12 = ครั้งเดียว (ใช้ตอนระบุจำนวนเงิน)
    tag("01", hasAmount ? "12" : "11") +
    tag("29", tag("00", AID_PROMPTPAY) + targetTag(target)) +
    tag("53", "764") +
    (hasAmount ? tag("54", amount.toFixed(2)) : "") +
    tag("58", "TH");

  const withCrcTag = `${payload}6304`;
  return withCrcTag + crc16(withCrcTag);
}

export function formatPromptPayId(rawId: string): string {
  const target = detectTarget(rawId);
  if (!target) return rawId;
  if (target.kind === "phone") {
    const d = target.value;
    return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  }
  if (target.kind === "nationalId") {
    const d = target.value;
    return `${d.slice(0, 1)}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d.slice(12)}`;
  }
  return target.value;
}
