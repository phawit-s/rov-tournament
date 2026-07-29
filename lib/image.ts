"use client";

/**
 * ย่อรูปฝั่ง client ก่อนเก็บ — สลิปโอนเงินจากมือถือมักใหญ่ 2-5MB
 * Firestore เก็บได้ 1MB ต่อ document เลยต้องบีบให้เหลือหลักแสนไบต์
 */
export async function compressImage(
  file: File,
  { maxWidth = 900, maxBytes = 260_000 } = {},
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  // ไล่ลดคุณภาพจนกว่าจะเล็กพอ
  for (const quality of [0.82, 0.7, 0.58, 0.46, 0.34]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= maxBytes) return url;
  }
  return canvas.toDataURL("image/jpeg", 0.28);
}
