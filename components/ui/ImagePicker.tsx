"use client";

import { useState, type ReactNode } from "react";
import { compressImage } from "@/lib/image";
import { safeImageSrc } from "@/lib/safe";
import { Label } from "../tournament/ui";

type Shape = "round" | "square" | "wide";

const BOX: Record<Shape, string> = {
  round: "h-16 w-16 rounded-full",
  square: "h-16 w-16 rounded-xl",
  wide: "h-16 w-28 rounded-lg",
};

/**
 * ช่องเลือกรูปที่ย่อรูปให้เองก่อนเก็บ
 *
 * ย่อในเครื่องเสมอ เพราะรูปทั้งหมดในระบบนี้ถูกเก็บเป็น data URL อยู่ในเอกสาร
 * ของ Firestore ไม่ได้อยู่บน storage แยก — รูปจากกล้องมือถือใบเดียวก็เกิน
 * ขนาดเอกสารสูงสุดได้สบายๆ ถ้าไม่ย่อ
 *
 * ทั้งหน้าตั้งค่าช่องและหน้าสมัครแข่งใช้ตัวเดียวกัน ต่างกันแค่ทรงกับขนาดที่ย่อ
 */
export default function ImagePicker({
  label,
  hint = "ไม่ใส่ก็ได้ ระบบย่อรูปให้เอง",
  value,
  onChange,
  shape = "square",
  placeholder,
  maxWidth = 900,
  maxBytes = 300_000,
}: {
  label: string;
  hint?: string;
  value?: string | null;
  /** undefined = เอารูปออก */
  onChange: (value: string | undefined) => void;
  shape?: Shape;
  /** สิ่งที่โชว์ในกรอบตอนยังไม่มีรูป — ไม่ส่งมาก็เป็นขีดกลางกรอบประ */
  placeholder?: ReactNode;
  maxWidth?: number;
  maxBytes?: number;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(value) ?? ""}
            alt=""
            className={`shrink-0 object-cover ${BOX[shape]}`}
          />
        ) : (
          <div
            className={`tile-dashed grid shrink-0 place-items-center text-xs text-muted ${BOX[shape]}`}
          >
            {placeholder ?? "—"}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="hover-tile tile inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3 py-2 text-xs text-ice/80 transition-colors">
            เลือกรูป
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                // ล้างค่าในช่องทุกครั้ง ไม่งั้นเลือกไฟล์เดิมซ้ำจะไม่ยิง change
                e.target.value = "";
                if (!file) return;
                try {
                  onChange(await compressImage(file, { maxWidth, maxBytes }));
                  setError(null);
                } catch {
                  setError("อ่านรูปไม่ได้ ลองรูปอื่น");
                }
              }}
            />
          </label>

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(undefined);
                setError(null);
              }}
              className="block cursor-pointer text-xs text-muted transition-colors hover:text-danger"
            >
              เอาออก
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}
