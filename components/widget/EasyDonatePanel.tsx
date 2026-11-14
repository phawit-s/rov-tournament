"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNow } from "@/hooks/useClient";
import { getAuthClient } from "@/lib/backend/firebase";
import type { Channel } from "@/lib/channel/types";
import { timeAgo } from "@/lib/format";
import { savePaidSkip } from "@/lib/song/config";
import {
  baht,
  easyDonateUrl,
  watchDonateLog,
  type DonateLogEntry,
} from "@/lib/song/easydonate";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { CopyBtn, MiniLink } from "../ui/MiniBtn";
import Panel from "../ui/Panel";
import { toast } from "../ui/Toast";
import { Badge, Input, Label, NumberInput } from "../ui/kit";
import { PAIR_WHY } from "./ChatBridgePanel";

/** หน้าโซนผู้พัฒนาในแดชบอร์ด EasyDonate — ที่ตั้ง webhook */
const EZDN_DEVELOPER_URL = "https://easydonate.app/dashboard/developer";

/** เหตุผลที่ Worker ตอบตอนกดทดสอบลิงก์ (worker/easydonate.js) */
const TEST_WHY: Record<string, string> = {
  "bad-token": "ลิงก์ไม่ถูกต้อง ลองกดแสดงลิงก์ใหม่แล้วคัดลอกอีกครั้ง",
  "key-revoked": "ลิงก์นี้ถูกยกเลิกไปแล้ว ใช้ลิงก์ล่าสุด",
  "no-bot": "Worker ยังไม่ได้ตั้งบัญชีบอท (BOT_EMAIL / BOT_PASSWORD / FIREBASE_API_KEY)",
  "bot-login-failed": "บอทของ Worker ล็อกอินไม่ผ่าน",
  "db-quota": "ฐานข้อมูลใช้โควตาอ่านของวันนี้หมดแล้ว ลองใหม่ราวบ่ายสอง–บ่ายสามโมง",
  "rate-limited": "กดถี่เกินไป รอสักนาทีแล้วลองใหม่",
  "ingest-disabled": "Worker ยังไม่ได้ตั้ง INGEST_TOKEN",
};

/** ผลของแต่ละโดเนทในบันทึก — tone บอกว่าต้องทำอะไรไหม (danger = คนดูจ่ายแล้วแต่เพลงไม่เข้า) */
function describe(e: DonateLogEntry): { text: string; tone: "open" | "neutral" | "danger" } {
  switch (e.result) {
    case "queued":
      return { text: `ลัดคิวแล้ว: ${e.title ?? ""}`, tone: "open" };
    case "test":
      return { text: "ทดสอบจากสตูดิโอ ลิงก์ใช้ได้", tone: "open" };
    case "no-song":
      return { text: "โดเนทธรรมดา ไม่ได้ขอเพลง", tone: "neutral" };
    case "off":
      return { text: "ยังไม่ได้ตั้งยอดขั้นต่ำ เพลงเลยไม่เข้าคิว", tone: "danger" };
    case "below-min":
      return { text: `ยอดไม่ถึง ${baht(e.min ?? 0)} ไม่ได้ลัดคิว`, tone: "neutral" };
    case "songs-closed":
      return { text: "ปิดรับเพลงอยู่ เพลงเลยไม่เข้าคิว", tone: "danger" };
    case "video-not-found":
      return { text: "เปิดลิงก์ไม่ได้ (คลิปถูกลบหรือเป็นส่วนตัว)", tone: "danger" };
    case "no-match":
      return { text: "ค้นเพลงไม่เจอ", tone: "danger" };
    case "youtube-quota":
      return { text: "โควตาค้นหาวันนี้หมด", tone: "danger" };
    default:
      return { text: `ใส่เพลงเข้าคิวไม่ได้ (${e.result})`, tone: "danger" };
  }
}

/**
 * ลัดคิวด้วยโดเนท EasyDonate
 *
 * คนดูโดเนทถึงยอดที่ตั้งไว้ + พิมพ์ !เพลง หรือวางลิงก์ YouTube ในข้อความ
 * → EasyDonate ยิง webhook ไปที่ Worker → เพลงเข้าคิวหน้าเพลงที่ขอฟรีทั้งหมด
 *
 * ลิงก์ webhook มีกุญแจของช่องนี้ฝังอยู่ (ออกโดย Worker แบบเดียวกับรหัสสะพานแชท)
 * ใครได้ลิงก์ไปก็ยัดเพลงลัดคิวได้ จึงต้องอยู่แค่ในแดชบอร์ด EasyDonate
 */
export default function EasyDonatePanel({ channel }: { channel: Channel }) {
  const worker = (channel.songs?.searchEndpoint ?? "").trim().replace(/\/+$/, "");
  const saved = channel.songs?.paidSkip;
  const now = useNow(30_000);

  const [min, setMin] = useState(saved?.min ?? 0);
  const [user, setUser] = useState(saved?.user ?? "");
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [log, setLog] = useState<DonateLogEntry[] | null>(null);

  useEffect(() => watchDonateLog(channel.id, setLog), [channel.id]);

  const userClean = user.trim().replace(/^@/, "");
  const userOk = !userClean || !!easyDonateUrl(userClean);
  const dirty = min !== (saved?.min ?? 0) || userClean !== (saved?.user ?? "");
  const on = (saved?.min ?? 0) > 0;
  const songsOpen = channel.songs?.enabled === true;

  const hook = (() => {
    if (!key || !worker) return null;
    try {
      const url = new URL(worker);
      url.searchParams.set("easydonate", "1");
      url.searchParams.set("c", channel.id);
      url.searchParams.set("k", key);
      return url.toString();
    } catch {
      return null;
    }
  })();

  async function save() {
    setSaving(true);
    try {
      await savePaidSkip(channel.id, { min, user: userClean });
      toast(min > 0 ? `เปิดลัดคิวที่ ${baht(min)} แล้ว` : "ปิดลัดคิวแล้ว", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ", "error");
    } finally {
      setSaving(false);
    }
  }

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
        body: JSON.stringify({ channelId: channel.id, rotate, kind: "donate" }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; key?: string; reason?: string }
        | null;
      // Worker รุ่นก่อนไม่รู้จัก kind เลยออกรหัสแชท (k1.) มาให้ — ใช้กับ webhook ไม่ได้
      if (data?.ok && typeof data.key === "string" && data.key.startsWith("d1.")) {
        setKey(data.key);
        if (rotate) toast("สร้างลิงก์ใหม่แล้ว ลิงก์เก่าใช้ไม่ได้อีก", "success");
        return;
      }
      const reason = data?.reason ?? "";
      setError(
        PAIR_WHY[reason] ??
          (data?.ok || reason === "no-payload" || !reason
            ? "Worker ที่ใช้อยู่ยังไม่รองรับ EasyDonate — ต้อง deploy Worker ตัวล่าสุด (wrangler deploy)"
            : `สร้างลิงก์ไม่สำเร็จ (${reason})`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "เรียก Worker ไม่ได้");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!hook) return;
    setTesting(true);
    try {
      const res = await fetch(hook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; test?: boolean; reason?: string }
        | null;
      if (data?.ok && data.test) {
        toast("ลิงก์ใช้ได้ — ดูผลในรายการโดเนทล่าสุดด้านล่าง", "success");
      } else {
        const reason = data?.reason ?? "";
        toast(
          TEST_WHY[reason] ??
            (reason === "no-payload" || !reason
              ? "Worker ที่ใช้อยู่ยังไม่รองรับ EasyDonate — ต้อง deploy Worker ตัวล่าสุด"
              : `ทดสอบไม่ผ่าน (${reason})`),
          "error",
          5000,
        );
      }
    } catch {
      toast("เรียก Worker ไม่ได้", "error");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section aria-labelledby="easydonate" className="space-y-4">
      <div>
        <h2 id="easydonate" className="text-title font-bold">
          ลัดคิวด้วยโดเนท EasyDonate
        </h2>
        <p className="mt-1 max-w-prose text-muted">
          คนดูโดเนทผ่าน EasyDonate ถึงยอดที่ตั้งไว้ แล้วพิมพ์ในข้อความโดเนทว่า{" "}
          <b className="text-ink">!เพลง</b> ตามด้วยชื่อเพลง หรือวางลิงก์ YouTube
          เพลงจะเข้าคิวก่อนเพลงที่ขอฟรีทุกเพลง ไม่ต้องเปิดโปรแกรมอะไรค้างไว้
        </p>
      </div>

      {!worker ? (
        <Panel className="p-5 sm:p-6">
          <p className="max-w-prose">
            ช่องนี้ยังไม่ได้ใส่ลิงก์ Worker — ใส่ที่{" "}
            <Link href="/studio/channel/" className="font-medium underline underline-offset-4">
              ตั้งค่าช่อง
            </Link>{" "}
            (ช่องเดียวกับที่ใช้ค้นหาเพลง) แล้วกลับมาตั้งค่าที่นี่
          </p>
        </Panel>
      ) : (
        <Panel className="p-5 sm:p-6">
          <ol className="max-w-prose space-y-6">
            <li className="flex gap-3">
              <span className="num w-5 shrink-0 font-semibold text-muted">1</span>
              <div className="min-w-0 flex-1 space-y-4">
                <div>
                  <Label htmlFor="ezdn-min" hint="ใส่ 0 = ปิด โดเนทที่เข้ามาจะไม่กลายเป็นเพลง">
                    ยอดโดเนทขั้นต่ำที่ได้ลัดคิว (บาท)
                  </Label>
                  <NumberInput
                    id="ezdn-min"
                    value={min}
                    onChange={setMin}
                    min={0}
                    max={100000}
                    className="max-w-40"
                  />
                </div>
                <div>
                  <Label
                    htmlFor="ezdn-user"
                    hint="ชื่อในลิงก์ ezdn.app/ชื่อ ใส่แล้วหน้าขอเพลงจะมีปุ่มพาคนดูไปโดเนท"
                  >
                    ชื่อผู้ใช้ EasyDonate (ไม่ใส่ก็ได้)
                  </Label>
                  <Input
                    id="ezdn-user"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={!userOk}
                  />
                  {!userOk && (
                    <p className="mt-1 text-sm text-danger">
                      ใช้ได้แค่ตัวอักษรอังกฤษ ตัวเลข จุด ขีด และขีดล่าง
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void save()} loading={saving} disabled={!dirty || !userOk}>
                    บันทึก
                  </Button>
                  {on ? (
                    <Badge tone="open" dot>
                      เปิดอยู่ ตั้งแต่ {baht(saved?.min ?? 0)}
                    </Badge>
                  ) : (
                    <Badge>ปิดอยู่</Badge>
                  )}
                </div>
                {on && !songsOpen && (
                  <p className="text-sm text-danger">
                    ตอนนี้ปิดรับเพลงอยู่ โดเนทที่ขอเพลงจะไม่เข้าคิวจนกว่าจะเปิดรับเพลง
                  </p>
                )}
              </div>
            </li>

            <li className="flex gap-3">
              <span className="num w-5 shrink-0 font-semibold text-muted">2</span>
              <div className="min-w-0 flex-1 space-y-3">
                <p>สร้างลิงก์ webhook ของช่องนี้ แล้วคัดลอกไว้</p>
                {hook ? (
                  <div className="space-y-2">
                    <p className="max-h-24 overflow-y-auto rounded-field bg-fill px-3 py-2 font-mono text-xs break-all text-muted">
                      {hook}
                    </p>
                    <CopyBtn text={hook} label="คัดลอกลิงก์" toastText="คัดลอกลิงก์ webhook แล้ว" />
                  </div>
                ) : (
                  <Button onClick={() => void pair(false)} loading={busy}>
                    แสดงลิงก์ webhook
                  </Button>
                )}
              </div>
            </li>

            <li className="flex gap-3">
              <span className="num w-5 shrink-0 font-semibold text-muted">3</span>
              <div className="min-w-0 flex-1 space-y-3">
                <p>
                  ในแดชบอร์ด EasyDonate ไปที่ <b>โซนผู้พัฒนา</b> → <b>เพิ่มลิงก์ Webhook</b>{" "}
                  เลือกประเภท <b>ปกติ</b> แล้ววางลิงก์จากข้อ 2
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <MiniLink href={EZDN_DEVELOPER_URL}>เปิดแดชบอร์ด EasyDonate</MiniLink>
                  {hook && (
                    <Button size="sm" variant="secondary" onClick={() => void test()} loading={testing}>
                      ทดสอบลิงก์
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted">
                  ปุ่มทดสอบเช็คแค่ฝั่งเรา ไม่ใส่เพลงเข้าคิว อยากเช็คว่า EasyDonate ส่งมาถึงจริง
                  ให้ลองโดเนทยอดน้อยๆ เข้าช่องตัวเอง แล้วดูรายการด้านล่าง
                </p>
              </div>
            </li>
          </ol>

          {error && (
            <p role="alert" className="mt-5 max-w-prose text-danger">
              {error}
            </p>
          )}

          {hook && (
            <p className="mt-5 max-w-prose text-sm text-muted">
              ลิงก์นี้ใส่เพลงลัดคิวช่องนี้ได้โดยไม่ต้องจ่ายจริง อย่าโชว์บนจอไลฟ์ ถ้าหลุดไปให้กด{" "}
              <button
                type="button"
                onClick={() => setConfirmRotate(true)}
                disabled={busy}
                className="cursor-pointer font-medium text-ink underline underline-offset-4 disabled:opacity-40"
              >
                สร้างลิงก์ใหม่
              </button>{" "}
              แล้ววางลิงก์ใหม่ใน EasyDonate แทนอันเก่า
            </p>
          )}
        </Panel>
      )}

      {log && log.length > 0 && (
        <Panel className="p-5 sm:p-6">
          <h3 className="font-bold">โดเนทล่าสุดที่เข้ามา</h3>
          <p className="mt-0.5 text-sm text-muted">
            สีแดง = คนดูจ่ายแล้วแต่เพลงไม่เข้าคิว ใส่เพลงให้เองได้จากหน้าคิว
          </p>
          <ul className="rows mt-3">
            {log.map((e, i) => {
              const { text, tone } = describe(e);
              return (
                <li key={`${e.at}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="font-medium">{e.name}</span>
                    {e.amount > 0 && <span className="num ml-2 text-muted">{baht(e.amount)}</span>}
                    <span
                      className={`mt-0.5 block text-sm ${
                        tone === "danger" ? "text-danger" : tone === "open" ? "text-open" : "text-muted"
                      }`}
                    >
                      {text}
                      {e.query && e.result !== "queued" && <> — “{e.query}”</>}
                    </span>
                  </span>
                  <span className="text-sm text-muted">{timeAgo(e.at, now)}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <ConfirmDialog
        open={confirmRotate}
        title="ยกเลิกลิงก์เก่าแล้วสร้างใหม่?"
        description="ลิงก์ที่วางไว้ใน EasyDonate จะใช้ไม่ได้ทันที โดเนทที่เข้ามาหลังจากนี้จะไม่ลัดคิวจนกว่าจะวางลิงก์ใหม่"
        confirmText="สร้างลิงก์ใหม่"
        onConfirm={() => {
          setConfirmRotate(false);
          void pair(true);
        }}
        onClose={() => setConfirmRotate(false)}
      />
    </section>
  );
}
