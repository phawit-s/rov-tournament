"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Skeleton } from "./kit";
import MiniBtn, { CopyBtn, MiniLink } from "./MiniBtn";

/*
  โหลดตัวสร้าง QR ตอนจะใช้จริงเท่านั้น — qrcode เป็นก้อนใหญ่
  import ไว้บนหัวไฟล์ = ทุกคนที่เปิดหน้านี้ต้องโหลดก้อนนั้นให้เสร็จก่อนหน้าจะเริ่มทำงาน
*/
export function useQr(text: string | null): string | null {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!text || map[text]) return;
    let alive = true;
    import("qrcode")
      .then((m) =>
        m.default.toDataURL(text, {
          margin: 1,
          width: 220,
          color: { dark: "#000000", light: "#ffffff" },
        }),
      )
      .then((url) => alive && setMap((p) => ({ ...p, [text]: url })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [text, map]);

  return text ? (map[text] ?? null) : null;
}

/**
 * แถวลิงก์ที่ต้องเอาไปใช้ต่อ
 *   public  ลิงก์ให้คนดู — มี QR ไว้แปะบนจอไลฟ์
 *   obs     ลิงก์สำหรับ Browser Source — บอกขนาดที่ควรตั้ง
 */
export default function LinkRow({
  label,
  url,
  kind = "public",
  size,
  hint,
  extra,
}: {
  label: string;
  url: string;
  kind?: "public" | "obs";
  size?: string;
  hint?: ReactNode;
  extra?: ReactNode;
}) {
  const qr = useQr(kind === "public" ? url : null);

  return (
    <div className="flex items-start gap-4 py-4">
      {kind === "public" && (
        <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-art bg-white p-1.5 ring-1 ring-line">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR ของ${label}`} className="h-full w-full" />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {label}
          {kind === "obs" && size && (
            <span className="num ml-2 text-sm font-normal text-muted">ขนาด {size}</span>
          )}
        </p>
        <code className="mt-1 block truncate text-sm text-muted">{url}</code>

        <div className="mt-3 flex flex-wrap gap-2">
          <CopyBtn text={url} />
          {kind === "public" && <MiniLink href={url}>เปิด</MiniLink>}
          {extra}
        </div>

        {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/** ลิงก์บรรทัดเดียว ชื่อซ้าย ลิงก์กลาง ปุ่มขวา */
export function LinkLine({
  label,
  url,
  onOpen,
}: {
  label: string;
  url: string;
  onOpen?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-2">
      <span className="w-40 shrink-0 text-sm text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate text-sm">{url}</code>
      <CopyBtn text={url} toastText={null} />
      {onOpen && <MiniBtn onClick={onOpen}>เปิด</MiniBtn>}
    </div>
  );
}
