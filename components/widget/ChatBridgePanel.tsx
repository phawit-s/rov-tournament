"use client";

import { useState } from "react";
import Link from "next/link";
import { getAuthClient } from "@/lib/backend/firebase";
import type { Channel } from "@/lib/channel/types";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { CopyBtn, MiniLink } from "../ui/MiniBtn";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { Input, Label } from "../ui/kit";

/** ตัวโปรแกรมรุ่นล่าสุดบน GitHub Releases — สร้างโดย .github/workflows/bridge-release.yml */
export const BRIDGE_DOWNLOAD_URL =
  "https://github.com/phawit-s/rov-tournament/releases/latest/download/kiew-bridge-windows.zip";

/** ชื่อผู้ใช้ TikTok — ตัวอักษร ตัวเลข จุด ขีดล่าง ยาวไม่เกิน 24 */
const TIKTOK_USER = /^[A-Za-z0-9._]{2,24}$/;

/** เหตุผลที่ Worker ตอบกลับตอนออกรหัส (?pair=1 ใน worker/song-ingest.js) */
const PAIR_WHY: Record<string, string> = {
  "signed-out": "การล็อกอินหมดอายุ — ออกจากระบบแล้วล็อกอินใหม่อีกครั้ง",
  "not-owner": "บัญชีนี้ไม่มีสิทธิ์จัดการช่องนี้",
  "channel-not-found": "หาช่องนี้ไม่เจอ",
  "db-quota": "ฐานข้อมูลใช้โควตาอ่านของวันนี้หมดแล้ว ลองใหม่ราวบ่ายสอง–บ่ายสามโมง",
  "ingest-disabled": "Worker ยังไม่ได้ตั้ง INGEST_TOKEN (wrangler secret put INGEST_TOKEN)",
  "no-bot": "Worker ยังไม่ได้ตั้ง FIREBASE_API_KEY",
  "rate-limited": "กดถี่เกินไป รอสักนาทีแล้วลองใหม่",
};

/**
 * รหัสที่วางในโปรแกรม — ทุกอย่างที่โปรแกรมต้องรู้อัดเป็นก้อนเดียว คัดลอกครั้งเดียวจบ
 * ไม่ต้องให้สตรีมเมอร์ไปหาลิงก์ Worker หรือไอดีช่องเอง (ตัวถอดอยู่ใน bridge/app.mjs)
 *   w ลิงก์ Worker · c ไอดีช่อง · h handle (ไว้โชว์) · t ชื่อ TikTok · k กุญแจต่อช่อง
 */
function encodeCode(payload: { w: string; c: string; h: string; t: string; k: string }): string {
  let bin = "";
  for (const b of new TextEncoder().encode(JSON.stringify(payload))) bin += String.fromCharCode(b);
  return `kiew1.${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/**
 * รับคำขอเพลงจากแชท TikTok — ออกรหัสเชื่อมต่อให้โปรแกรมสะพานบนเครื่องสตรีมเมอร์
 *
 * กุญแจผูกกับช่องนี้ช่องเดียว (Worker ตรวจ) ต่างจาก INGEST_TOKEN ที่เขียนได้ทุกช่อง
 * จึงแจกให้สตรีมเมอร์ได้โดยไม่ต้องกลัวว่าเขาจะยัดเพลงเข้าช่องคนอื่น
 * ถ้ารหัสหลุด (เผลอโชว์บนจอไลฟ์) กดสร้างใหม่ — รหัสเก่าใช้ไม่ได้ทันที
 */
export default function ChatBridgePanel({ channel }: { channel: Channel }) {
  const worker = (channel.songs?.searchEndpoint ?? "").trim().replace(/\/+$/, "");
  const [tiktok, setTiktok] = useState(channel.handle ?? "");
  const [issued, setIssued] = useState<{ channelId: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  // กุญแจของช่องที่เลือกอยู่เท่านั้น — สลับช่องแล้วต้องไม่เห็นรหัสของช่องก่อน
  const key = issued?.channelId === channel.id ? issued.key : null;
  const user = tiktok.trim().replace(/^@/, "");
  const userOk = TIKTOK_USER.test(user);
  const code =
    key && userOk
      ? encodeCode({ w: worker, c: channel.id, h: channel.handle ?? "", t: user, k: key })
      : null;

  async function pair(rotate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const account = getAuthClient()?.currentUser;
      if (!account) throw new Error(PAIR_WHY["signed-out"]);
      const url = new URL(worker);
      url.searchParams.set("pair", "1");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await account.getIdToken()}`,
        },
        body: JSON.stringify({ channelId: channel.id, rotate }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; key?: string; reason?: string }
        | null;
      if (data?.ok && typeof data.key === "string") {
        setIssued({ channelId: channel.id, key: data.key });
        if (rotate) toast("สร้างรหัสใหม่แล้ว รหัสเก่าใช้ไม่ได้อีก", "success");
        return;
      }
      const reason = data?.reason ?? "";
      setError(
        PAIR_WHY[reason] ??
          // Worker รุ่นก่อนไม่รู้จัก ?pair=1 เลยตกไปทางตรวจสลิป แล้วตอบว่าไม่มีสลิป
          (reason === "no-payload" || !reason
            ? "Worker ที่ใช้อยู่ยังไม่รองรับรหัสเชื่อมต่อ — ต้อง deploy Worker ตัวล่าสุด (wrangler deploy)"
            : `ออกรหัสไม่สำเร็จ (${reason})`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "เรียก Worker ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="chat-bridge" className="space-y-4">
      <div>
        <h2 id="chat-bridge" className="text-title font-bold">
          รับคำขอเพลงจากแชท TikTok
        </h2>
        <p className="mt-1 max-w-prose text-muted">
          คนดูพิมพ์ <b className="text-ink">!เพลง ชื่อเพลง</b> หรือวางลิงก์ YouTube ในแชทไลฟ์
          แล้วเพลงเข้าคิวเอง ต้องเปิดโปรแกรมเล็กๆ ค้างไว้บนเครื่องที่ไลฟ์ (Windows)
        </p>
      </div>

      {!worker ? (
        <Panel className="p-5 sm:p-6">
          <p className="max-w-prose">
            ช่องนี้ยังไม่ได้ใส่ลิงก์ Worker — ใส่ที่{" "}
            <Link href="/studio/channel/" className="font-medium underline underline-offset-4">
              ตั้งค่าช่อง
            </Link>{" "}
            (ช่องเดียวกับที่ใช้ค้นหาเพลง) แล้วกลับมาสร้างรหัสที่นี่
          </p>
        </Panel>
      ) : (
        <Panel className="p-5 sm:p-6">
          <ol className="max-w-prose space-y-5">
            <li className="flex gap-3">
              <span className="num w-5 shrink-0 font-semibold text-muted">1</span>
              <div className="min-w-0 flex-1 space-y-2">
                <p>
                  ดาวน์โหลดโปรแกรม แตกไฟล์ แล้วเปิด <b>kiew-bridge.exe</b>
                </p>
                <MiniLink href={BRIDGE_DOWNLOAD_URL}>ดาวน์โหลดสำหรับ Windows</MiniLink>
                <p className="text-sm text-muted">
                  ครั้งแรก Windows อาจขึ้นหน้าฟ้า “Windows protected your PC” เพราะโปรแกรมยังไม่ได้ซื้อใบรับรอง
                  กด <b>More info</b> แล้ว <b>Run anyway</b>
                </p>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="num w-5 shrink-0 font-semibold text-muted">2</span>
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <Label htmlFor="chat-tiktok" hint="ชื่อในลิงก์ tiktok.com/@ชื่อ ไม่ต้องใส่ @">
                    ชื่อ TikTok ที่ใช้ไลฟ์
                  </Label>
                  <Input
                    id="chat-tiktok"
                    value={tiktok}
                    onChange={(e) => setTiktok(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!!user && !userOk}
                  />
                  {!!user && !userOk && (
                    <p className="mt-1 text-sm text-danger">
                      ใช้ได้แค่ตัวอักษรอังกฤษ ตัวเลข จุด และขีดล่าง
                    </p>
                  )}
                </div>

                {code ? (
                  <div className="space-y-2">
                    <Label>รหัสเชื่อมต่อ</Label>
                    <p className="max-h-24 overflow-y-auto rounded-field bg-fill px-3 py-2 font-mono text-xs break-all text-muted">
                      {code}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyBtn text={code} label="คัดลอกรหัส" toastText="คัดลอกรหัสแล้ว" />
                    </div>
                  </div>
                ) : (
                  <Button onClick={() => void pair(false)} loading={busy} disabled={!userOk}>
                    สร้างรหัสเชื่อมต่อ
                  </Button>
                )}
              </div>
            </li>

            <li className="flex gap-3">
              <span className="num w-5 shrink-0 font-semibold text-muted">3</span>
              <p className="min-w-0 flex-1">
                วางรหัสในโปรแกรมแล้วกดบันทึก เปิดค้างไว้ระหว่างไลฟ์
                (ติ๊ก “เปิดเองตอนเปิดเครื่อง” ในโปรแกรมได้ จะได้ไม่ต้องจำ)
                — โปรแกรมรอเองจนเริ่มไลฟ์ แล้วต่อให้อัตโนมัติ
              </p>
            </li>
          </ol>

          {error && (
            <p role="alert" className="mt-5 max-w-prose text-danger">
              {error}
            </p>
          )}

          {code && (
            <p className="mt-5 max-w-prose text-sm text-muted">
              รหัสนี้ส่งเพลงเข้าคิวช่องนี้ได้ อย่าโชว์บนจอไลฟ์ ถ้าหลุดไปให้กด{" "}
              <button
                type="button"
                onClick={() => setConfirmRotate(true)}
                disabled={busy}
                className="cursor-pointer font-medium text-ink underline underline-offset-4 disabled:opacity-40"
              >
                สร้างรหัสใหม่
              </button>{" "}
              รหัสเก่าจะใช้ไม่ได้ทันที
            </p>
          )}
        </Panel>
      )}

      <ConfirmDialog
        open={confirmRotate}
        title="ยกเลิกรหัสเก่าแล้วสร้างใหม่?"
        description="โปรแกรมที่ใช้รหัสเก่าอยู่จะส่งเพลงเข้าคิวไม่ได้ทันที ต้องวางรหัสใหม่ในโปรแกรมทุกเครื่องที่ใช้"
        confirmText="สร้างรหัสใหม่"
        onConfirm={() => {
          setConfirmRotate(false);
          void pair(true);
        }}
        onClose={() => setConfirmRotate(false)}
      />
    </section>
  );
}
