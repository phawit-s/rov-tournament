"use client";

import { useState, type ReactNode } from "react";
import { compressImage } from "@/lib/image";
import { safeImageSrc } from "@/lib/safe";
import { Label } from "./kit";

type Shape = "round" | "square" | "wide";

const BOX: Record<Shape, string> = {
  round: "h-20 w-20 rounded-full",
  square: "h-20 w-20 rounded-art",
  wide: "h-20 w-36 rounded-art",
};

/**
 * เลือกรูปจากเครื่อง — ย่อขนาดให้เองก่อนเก็บ (เอกสาร Firestore ใหญ่ได้ไม่เกิน 1MB)
 * เก็บเป็น data URL ในเอกสารช่องเลย ไม่ต้องมีที่เก็บไฟล์แยก
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
  onChange: (value: string | undefined) => void;
  shape?: Shape;
  placeholder?: ReactNode;
  maxWidth?: number;
  maxBytes?: number;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div className="flex items-center gap-4">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(value) ?? ""}
            alt=""
            className={`shrink-0 bg-fill object-cover ${BOX[shape]}`}
          />
        ) : (
          <div className={`grid shrink-0 place-items-center bg-fill text-sm text-faint ${BOX[shape]}`}>
            {placeholder ?? "ไม่มีรูป"}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full bg-fill px-4 text-sm font-medium transition-colors hover:bg-fill-2 focus-within:outline-2 focus-within:outline-ink">
            {value ? "เปลี่ยนรูป" : "เลือกรูป"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                // ล้างค่าในช่องทุกครั้ง ไม่งั้นเลือกไฟล์เดิมซ้ำจะไม่ยิง change
                e.target.value = "";
                if (!file) return;
                try {
                  onChange(await compressImage(file, { maxWidth, maxBytes }));
                  setError(null);
                } catch {
                  setError("อ่านรูปนี้ไม่ได้ ลองรูป JPG หรือ PNG แทน");
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
              className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm text-muted transition-colors hover:bg-fill hover:text-danger"
            >
              เอารูปออก
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
