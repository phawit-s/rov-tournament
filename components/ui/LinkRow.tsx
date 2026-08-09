"use client";

import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { Skeleton } from "../tournament/ui";
import MiniBtn, { CopyBtn, MiniLink } from "./MiniBtn";
import { IconMonitor } from "./icons";

/**
 * QR ของลิงก์สาธารณะ
 *
 * เป็น hook เพราะ toDataURL เป็น async — setState อยู่ใน .then() ไม่ใช่ในตัว effect
 * แคชไว้ต่อข้อความ ลิงก์เดิมจะได้ไม่ต้องวาดใหม่ทุกครั้งที่หน้ารีเรนเดอร์
 */
export function useQr(text: string | null): string | null {
  const [map, setMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!text || map[text]) return;
    let alive = true;
    QRCode.toDataURL(text, {
      margin: 1,
      width: 180,
      color: { dark: "#12100b", light: "#ffffff" },
    })
      .then((url) => alive && setMap((p) => ({ ...p, [text]: url })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [text, map]);

  return text ? (map[text] ?? null) : null;
}

/**
 * แถวลิงก์ที่เอาไปแปะที่อื่น — เห็นลิงก์ คัดลอกได้ เปิดดูได้ จบในแถวเดียว
 *
 * kind บอกว่าลิงก์นี้เอาไปใช้ที่ไหน ซึ่งเปลี่ยนสิ่งที่ควรอยู่ในแถว:
 *   public = คนดูเปิดจากมือถือ จึงมี QR ให้สแกนจากจอ
 *   obs    = เอาไปวางใน Browser Source จึงบอกขนาดที่แนะนำแทน แล้วไม่ต้องมี QR
 *            (และไม่ต้องมีปุ่มเปิด เพราะเปิดในเบราว์เซอร์ปกติแล้วเห็นแต่จอใส)
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
  /** ขนาด Browser Source ที่แนะนำ เช่น "1280 × 720" */
  size?: string;
  hint?: ReactNode;
  /** ปุ่มเพิ่มเติมท้ายแถว */
  extra?: ReactNode;
}) {
  const qr = useQr(kind === "public" ? url : null);

  return (
    <div className="flex items-start gap-3.5 rounded-xl tile p-3.5">
      {kind === "public" && (
        <span className="relative grid h-18 w-18 shrink-0 place-items-center overflow-hidden rounded-lg bg-white p-1">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR ${label}`} className="h-full w-full" />
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="slug">{label}</span>
          {kind === "obs" && (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgb(109_146_219/0.14)] px-2 py-0.5 font-display text-eyebrow text-info">
                <IconMonitor className="h-3 w-3" />
                Browser Source
              </span>
              {size && (
                <span className="num text-eyebrow text-muted">แนะนำ {size}</span>
              )}
            </>
          )}
        </div>

        <code className="mt-1.5 block truncate text-xs text-ice/75">{url}</code>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <CopyBtn text={url} />
          {kind === "public" && <MiniLink href={url}>เปิด</MiniLink>}
          {extra}
        </div>

        {hint && <p className="mt-2 text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
    </div>
  );
}

/** แถวลิงก์แบบผอม ไม่มี QR ไม่มีป้าย ใช้ในลิสต์ที่มีหลายลิงก์เรียงกัน */
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
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-40 shrink-0 text-xs text-muted">{label}</span>
      <code className="min-w-0 flex-1 truncate text-xs text-ice/75">{url}</code>
      <CopyBtn text={url} toastText={null} />
      {onOpen && <MiniBtn onClick={onOpen}>เปิด</MiniBtn>}
    </div>
  );
}
