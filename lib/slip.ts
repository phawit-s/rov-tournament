"use client";

/**
 * อ่าน QR บนสลิปโอนเงิน
 *
 * สลิปของธนาคารไทยมี QR เล็กๆ อยู่มุมล่าง ข้างในเป็นรหัสอ้างอิงรายการโอน
 * เราไม่แกะโครงสร้างข้างในเอง เพราะแต่ละธนาคารใส่ไม่เหมือนกันและเปลี่ยนได้
 * ใช้สตริงดิบทั้งก้อนเป็น "ลายนิ้วมือ" ของสลิปใบนั้นแทน ซึ่งพอสำหรับสองงานหลัก
 *
 *  1. กันสลิปซ้ำ — สลิปใบเดิมส่งได้ครั้งเดียว (บังคับที่ firestore.rules)
 *  2. ส่งต่อให้บริการตรวจสลิปยืนยันว่าเงินเข้าจริง (ถ้าตั้งค่าไว้)
 *
 * ข้อ 1 ทำงานได้เลยโดยไม่ต้องมีเซิร์ฟเวอร์และไม่มีค่าใช้จ่าย
 * ซึ่งกันการโกงที่เจอบ่อยที่สุดคือเอาสลิปเก่าหรือสลิปคนอื่นมาใช้ซ้ำ
 */

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
};

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

/** ความกว้างที่ย่อภาพลงก่อนสแกน ใหญ่ไปก็ช้า เล็กไป QR จะแตก */
const MAX_W = 1400;

async function toImageData(file: File | Blob): Promise<ImageData | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_W / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return ctx.getImageData(0, 0, w, h);
}

/**
 * คืนสตริงใน QR ของสลิป หรือ null ถ้าหาไม่เจอ
 * ลอง BarcodeDetector ของเบราว์เซอร์ก่อน (เร็วกว่าและไม่ต้องโหลดอะไรเพิ่ม)
 * ถ้าไม่มี (Safari / Firefox) ค่อยตกไปใช้ jsQR ที่โหลดแบบ dynamic
 */
export async function readSlipQr(file: File | Blob): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor })
    .BarcodeDetector;
  if (Detector) {
    try {
      const detector = new Detector({ formats: ["qr_code"] });
      const found = await detector.detect(file);
      if (found.length > 0 && found[0].rawValue) return found[0].rawValue;
    } catch {
      /* บางเบราว์เซอร์มีคลาสแต่ไม่รองรับ qr_code จริง ตกไปใช้ jsQR */
    }
  }

  try {
    const data = await toImageData(file);
    if (!data) return null;
    const { default: jsQR } = await import("jsqr");
    // สลิปบางใบ QR กลับหัวหรือคอนทราสต์ต่ำ ลองทั้งสองโหมด
    const hit =
      jsQR(data.data, data.width, data.height, { inversionAttempts: "dontInvert" }) ??
      jsQR(data.data, data.width, data.height, { inversionAttempts: "onlyInvert" });
    return hit?.data ?? null;
  } catch {
    return null;
  }
}

/**
 * ลายนิ้วมือของสลิป — SHA-256 ของสตริงใน QR
 * ใช้เป็น document id ได้ปลอดภัย (hex ล้วน) และไม่เปิดเผยเลขอ้างอิงจริงให้คนอื่น
 */
export async function slipFingerprint(payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload.trim());
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type SlipCheck =
  | { state: "no-qr" }
  | { state: "ok"; payload: string; fingerprint: string };

/** อ่าน QR แล้วทำลายนิ้วมือให้ในขั้นตอนเดียว */
export async function inspectSlip(file: File | Blob): Promise<SlipCheck> {
  const payload = await readSlipQr(file);
  if (!payload) return { state: "no-qr" };
  return { state: "ok", payload, fingerprint: await slipFingerprint(payload) };
}
