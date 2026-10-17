"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { authStore } from "@/lib/backend/firebase";
import {
  PLATFORMS,
  platformLabel,
  submitStreamerRequest,
  watchMyStreamerRequest,
  withdrawStreamerRequest,
  type StreamerRequest,
} from "@/lib/backend/roles";
import { formatThaiDate } from "@/lib/format";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import { toast } from "@/components/ui/Toast";
import { Input, Label, Skeleton, Textarea } from "@/components/ui/kit";

/**
 * ขอสิทธิ์สตรีมเมอร์ — ประตูเดียวที่ผู้ใช้ทั่วไปเดินเข้าสตูดิโอได้
 *
 * ตั้งใจไม่ให้กดแล้วได้สิทธิ์ทันที เพราะสิทธิ์นี้เปิดคิวเพลงที่เล่นขึ้นจอไลฟ์
 * และวาง widget ลง OBS ได้ — ต้องมีคนกดรับรองเสมอ
 * กติกาฝั่งเซิร์ฟเวอร์บังคับไว้แล้วว่าใบที่คนขอเขียนเองตั้งได้แค่ 'pending'
 */
export default function StreamerRequestPanel() {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const user = authStore.user();
  const uid = user && !user.anonymous ? user.uid : null;

  const [req, setReq] = useState<StreamerRequest | null>(null);
  const [loaded, setLoaded] = useState(!uid);
  /** กดยื่นใหม่หลังโดนปฏิเสธ — เปิดฟอร์มทับใบเดิม */
  const [redo, setRedo] = useState(false);

  useEffect(() => {
    if (!uid) return;
    return watchMyStreamerRequest(uid, (r) => {
      setReq(r);
      setLoaded(true);
    });
  }, [uid]);

  if (!uid) return null;
  if (!loaded) return <RequestSkeleton />;

  if (req && req.status === "approved") return <ApprovedCard req={req} />;
  if (req && req.status === "pending") return <PendingCard req={req} />;
  if (req && req.status === "rejected" && !redo) {
    return <RejectedCard req={req} onRedo={() => setRedo(true)} />;
  }

  return (
    <RequestForm
      key={req?.uid ?? "new"}
      previous={req}
      onDone={() => setRedo(false)}
    />
  );
}

/* ---------------- ฟอร์ม ---------------- */

function RequestForm({
  previous,
  onDone,
}: {
  previous: StreamerRequest | null;
  onDone: () => void;
}) {
  const [channelName, setChannelName] = useState(
    () => previous?.channelName ?? "",
  );
  const [platform, setPlatform] = useState(() => previous?.platform ?? "tiktok");
  const [channelUrl, setChannelUrl] = useState(() => previous?.channelUrl ?? "");
  const [note, setNote] = useState(() => previous?.note ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!channelName.trim()) {
      toast("ใส่ชื่อช่องก่อนส่งคำขอ", "error");
      return;
    }
    setBusy(true);
    try {
      await submitStreamerRequest({ channelName, platform, channelUrl, note });
      toast("ส่งคำขอแล้ว รอผู้ดูแลอนุมัติ", "success");
      onDone();
    } catch (err) {
      /*
        สาเหตุที่พบบ่อยที่สุดคือกติกา firestore.rules รุ่นใหม่ยังไม่ถูก publish
        ซึ่งคนกดปุ่มไม่มีทางเดาถูกเลยถ้าขึ้นแค่ "ส่งไม่สำเร็จ"
      */
      const message = err instanceof Error ? err.message : String(err);
      toast(
        message.includes("permission")
          ? "ส่งไม่สำเร็จ ฐานข้อมูลไม่ยอมให้บันทึกคำขอ บอกคนดูแลเว็บให้ deploy firestore.rules รุ่นล่าสุด"
          : `ส่งไม่สำเร็จ (${message}) เช็กอินเทอร์เน็ตแล้วลองอีกครั้ง`,
        "error",
        7000,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6 sm:p-8">
      <h1 className="text-headline font-bold">
        {previous ? "แก้คำขอแล้วส่งใหม่" : "เปิดคิวเพลงให้ช่องของคุณ"}
      </h1>
      <p className="mt-3 max-w-prose text-muted">
        สตูดิโอเปิดให้สตรีมเมอร์ที่ผู้ดูแลอนุมัติแล้ว พออนุมัติ คุณจะเปิดคิวให้คนดูขอเพลง
        ใช้ตัวเล่นที่เปิดเพลงตามคิวให้เอง และได้ลิงก์สำหรับ OBS
        บอกเราว่าช่องของคุณอยู่ที่ไหน แล้วผู้ดูแลจะตรวจให้
      </p>

      <form
        className="mt-8 space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <Label htmlFor="req-channel" hint="ชื่อที่คนดูเรียกช่องคุณ เปลี่ยนทีหลังได้">
            ชื่อช่อง
          </Label>
          <Input
            id="req-channel"
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            placeholder="เช่น Affarain Live"
            maxLength={60}
            autoComplete="off"
            autoFocus
          />
        </div>

        <div role="group" aria-labelledby="req-platform">
          <Label hint="ที่ไลฟ์อยู่ประจำ">
            <span id="req-platform">แพลตฟอร์ม</span>
          </Label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => {
              const on = platform === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPlatform(p.key)}
                  aria-pressed={on}
                  className={`inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[0.94rem] font-medium transition-colors ${
                    on ? "bg-ink text-onink" : "bg-fill text-ink hover:bg-fill-2"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Label
            htmlFor="req-url"
            hint="ไม่ใส่ก็ได้ แต่ใส่แล้วผู้ดูแลตรวจได้เร็วขึ้นมาก"
          >
            ลิงก์ช่อง
          </Label>
          <Input
            id="req-url"
            value={channelUrl}
            onChange={(e) => setChannelUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@ชื่อช่อง"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            maxLength={200}
          />
        </div>

        <div>
          <Label htmlFor="req-note" hint="ไม่ใส่ก็ได้ ไลฟ์อะไร ไลฟ์บ่อยแค่ไหน บอกสั้นๆ พอ">
            เกี่ยวกับช่อง
          </Label>
          <Textarea
            id="req-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ไลฟ์ร้องเพลงทุกคืน อยากให้คนดูขอเพลงผ่านลิงก์แทนพิมพ์ในแชต"
            maxLength={300}
            rows={3}
          />
        </div>

        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {previous ? "ส่งคำขอใหม่" : "ส่งคำขอ"}
        </Button>
      </form>
    </Panel>
  );
}

/* ---------------- สถานะของใบ ---------------- */

function StatusShell({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel className="p-6 sm:p-8">
      <h1 className="text-headline font-bold">{title}</h1>
      <p className="mt-3 max-w-prose text-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </Panel>
  );
}

/** รายละเอียดของใบ — แถวคั่นเส้นบาง ชื่อซ้าย ค่าขวา */
function Details({ items }: { items: [label: string, value: string][] }) {
  return (
    <dl className="rows">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-3">
          <dt className="shrink-0 text-muted">{label}</dt>
          <dd className="num min-w-0 truncate text-right font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PendingCard({ req }: { req: StreamerRequest }) {
  const [busy, setBusy] = useState(false);

  return (
    <StatusShell
      title="ส่งคำขอแล้ว รอผู้ดูแลอนุมัติ"
      description="พออนุมัติแล้วหน้านี้จะเปลี่ยนเป็นสตูดิโอเอง ไม่ต้องรีเฟรช ระหว่างนี้ยังขอเพลงให้ช่องอื่นได้ตามปกติ"
    >
      <Details
        items={[
          ["ชื่อช่อง", req.channelName],
          ["แพลตฟอร์ม", platformLabel(req.platform)],
          ["ส่งเมื่อ", formatThaiDate(req.createdAt)],
        ]}
      />

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button
          variant="secondary"
          loading={busy}
          onClick={() => {
            setBusy(true);
            void withdrawStreamerRequest(req.uid)
              .then(() => toast("ถอนคำขอแล้ว", "success"))
              .catch(() =>
                toast("ถอนคำขอไม่สำเร็จ เช็กอินเทอร์เน็ตแล้วลองอีกครั้ง", "error"),
              )
              .finally(() => setBusy(false));
          }}
        >
          ถอนคำขอ
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-[0.94rem] font-medium transition-colors hover:bg-fill"
        >
          ดูช่องที่เปิดรับเพลง
        </Link>
      </div>
    </StatusShell>
  );
}

function RejectedCard({
  req,
  onRedo,
}: {
  req: StreamerRequest;
  onRedo: () => void;
}) {
  return (
    <StatusShell
      title="คำขอยังไม่ผ่าน"
      description="แก้ตามที่ผู้ดูแลบอกแล้วส่งใหม่ได้ ไม่จำกัดจำนวนครั้ง"
    >
      {req.reason && (
        <div className="mb-4 rounded-field bg-fill px-4 py-3">
          <p className="text-sm text-muted">เหตุผลจากผู้ดูแล</p>
          <p className="mt-1 whitespace-pre-line">{req.reason}</p>
        </div>
      )}

      <Details
        items={[
          ["ชื่อช่องที่ขอ", req.channelName],
          ["ตัดสินเมื่อ", formatThaiDate(req.decidedAt)],
        ]}
      />

      <Button size="lg" className="mt-6 w-full sm:w-auto" onClick={onRedo}>
        แก้คำขอ
      </Button>
    </StatusShell>
  );
}

/**
 * ใบที่อนุมัติแล้ว — ปกติผู้ใช้จะไม่เห็นการ์ดนี้ เพราะพอมีสิทธิ์แล้ว
 * ประตูจะพาเข้าสตูดิโอไปก่อน การ์ดนี้จึงเป็นทางออกกรณีสิทธิ์ยังมาไม่ถึงเครื่อง
 * (ถอดสิทธิ์ตอนนี้ลบใบทิ้งด้วยแล้ว — ดู revokeStreamer — ใบที่ค้างเป็นของที่ถอดก่อนแก้)
 */
function ApprovedCard({ req }: { req: StreamerRequest }) {
  return (
    <StatusShell
      title="อนุมัติแล้ว"
      description={
        <>
          บัญชีนี้เปิดคิวเพลงได้แล้ว เข้าสตูดิโอเพื่อตั้งค่าช่อง
          {req.channelName ? ` “${req.channelName}”` : "ของคุณ"}
        </>
      }
    >
      <Link
        href="/studio/"
        className="inline-flex min-h-13 w-full items-center justify-center rounded-full bg-ink px-7 font-medium text-onink transition-opacity hover:opacity-85 sm:w-auto"
      >
        เข้าสตูดิโอ
      </Link>
      <p className="mt-4 max-w-prose text-sm text-muted">
        ถ้ากดแล้วยังอยู่หน้านี้ ลองรีเฟรชหน้าอีกครั้ง ถ้ายังไม่ได้
        แปลว่าสิทธิ์ถูกถอนไปแล้ว ติดต่อผู้ดูแลเพื่อขอสิทธิ์คืน
      </p>
    </StatusShell>
  );
}

function RequestSkeleton() {
  return (
    <div className="rounded-sheet border border-line p-6 sm:p-8" aria-busy="true">
      <Skeleton className="h-9 w-64 max-w-full" />
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <Skeleton className="mt-8 h-5 w-24" />
      <Skeleton className="mt-2 h-12 w-full rounded-field" />
      <Skeleton className="mt-6 h-5 w-24" />
      <Skeleton className="mt-2 h-11 w-full rounded-full" />
      <Skeleton className="mt-8 h-13 w-full rounded-full" />
    </div>
  );
}
