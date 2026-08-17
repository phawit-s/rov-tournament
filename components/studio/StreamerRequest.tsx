"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { authStore } from "@/lib/backend/firebase";
import {
  PLATFORMS,
  platformLabel,
  submitStreamerRequest,
  watchMyStreamerRequest,
  withdrawStreamerRequest,
  type StreamerRequest,
} from "@/lib/backend/roles";
import { formatThaiDate } from "@/lib/tournament/share";
import Button from "@/components/ui/Button";
import Panel from "@/components/ui/Panel";
import Corners from "@/components/ui/Corners";
import { toast } from "@/components/ui/Toast";
import { IconCheck, IconShield } from "@/components/ui/icons";
import { Input, Label, Skeleton, Textarea } from "@/components/tournament/ui";

/**
 * ขอสิทธิ์สตรีมเมอร์ — ประตูเดียวที่ผู้ใช้ทั่วไปเดินเข้าสตูดิโอได้
 *
 * ตั้งใจไม่ให้กดแล้วได้สิทธิ์ทันที เพราะสิทธิ์นี้เปิดช่องรับเงิน (พร้อมเพย์)
 * และเขียนกราฟิกที่ขึ้นจอไลฟ์ได้ — ต้องมีคนกดรับรองเสมอ
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
  const reduced = useReducedMotion();
  const [channelName, setChannelName] = useState(
    () => previous?.channelName ?? "",
  );
  const [platform, setPlatform] = useState(() => previous?.platform ?? "tiktok");
  const [channelUrl, setChannelUrl] = useState(() => previous?.channelUrl ?? "");
  const [note, setNote] = useState(() => previous?.note ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!channelName.trim()) {
      toast("ใส่ชื่อช่องก่อนนะ", "error");
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
          ? "ส่งไม่สำเร็จ — กติกาความปลอดภัยของ Firestore ยังไม่ถูกอัปเดต บอกคนที่ดูแลเว็บให้ deploy firestore.rules"
          : `ส่งไม่สำเร็จ — ${message}`,
        "error",
        7000,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <Panel variant="feature" interactive={false} className="relative p-7 sm:p-8">
        <Corners len={18} o={0.45} />

        <p className="slug">Become a streamer</p>
        <h2 className="mt-2 font-display text-2xl font-light text-ice">
          ขอเปิดช่องของคุณ
        </h2>
        <p className="mt-2.5 text-sm leading-relaxed text-muted">
          สตูดิโอเปิดให้สตรีมเมอร์ — ตั้งค่าพร้อมเพย์ รับโดเนท เปิดคิวขอเพลง
          จับเวลาบนสตรีม และสร้าง widget ลง OBS ได้ทั้งชุด
          บอกเราหน่อยว่าช่องของคุณอยู่ที่ไหน แล้วผู้ดูแลจะกดอนุมัติให้
        </p>

        <div className="mt-7 space-y-5">
          <div>
            <Label hint="ชื่อที่คนดูเรียกช่องคุณ เปลี่ยนทีหลังได้">ชื่อช่อง</Label>
            <Input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="เช่น Affarain Live"
              maxLength={60}
              autoFocus
            />
          </div>

          <div>
            <Label hint="ที่ไลฟ์อยู่ประจำ">แพลตฟอร์ม</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {PLATFORMS.map((p) => {
                const on = platform === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPlatform(p.key)}
                    aria-pressed={on}
                    className={`cursor-pointer rounded-full px-4 py-2 font-display text-xs transition-colors ${
                      on
                        ? "accent-fill text-onaccent"
                        : "tile text-muted hover:text-ice"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label hint="ไม่ใส่ก็ได้ แต่ใส่แล้วผู้ดูแลตรวจให้ได้เร็วกว่ามาก">
              ลิงก์ช่อง
            </Label>
            <Input
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@yourname"
              maxLength={200}
            />
          </div>

          <div>
            <Label hint="จัดทัวร์อยู่ไหม ไลฟ์เกมอะไร บอกสั้นๆ พอ">
              เล่าให้ฟังหน่อย
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ไลฟ์ RoV ทุกคืน จัดทัวร์เดือนละครั้ง อยากได้สกอร์บอร์ดกับคิวขอเพลง"
              maxLength={300}
              rows={3}
            />
          </div>

          <Button
            size="lg"
            className="w-full"
            loading={busy}
            onClick={() => void submit()}
          >
            {previous ? "ยื่นคำขอใหม่" : "ส่งคำขอ"}
          </Button>
        </div>

        <p className="mt-5 text-xs leading-relaxed text-muted">
          ระหว่างรออนุมัติ ใช้เครื่องมือฟรีได้ตามปกติ —{" "}
          <Link href="/draw/" className="text-iris hover:underline">
            สุ่มแบ่งทีม
          </Link>{" "}
          และ{" "}
          <Link href="/wheel/" className="text-iris hover:underline">
            วงล้อสุ่ม
          </Link>{" "}
          ไม่ต้องใช้สิทธิ์อะไรเลย
        </p>
      </Panel>
    </motion.div>
  );
}

/* ---------------- สถานะของใบ ---------------- */

function StatusShell({
  eyebrow,
  title,
  tone,
  children,
}: {
  eyebrow: string;
  title: string;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <Panel
      variant="feature"
      interactive={false}
      className="relative p-7 sm:p-8"
      style={{ ["--st" as string]: tone }}
    >
      <Corners len={18} o={0.4} />
      <div className="flex items-start gap-4">
        <span
          className="sunken grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
          style={{ color: `rgb(${tone})` }}
        >
          <IconShield className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="slug">{eyebrow}</p>
          <h2 className="mt-1.5 font-display text-xl font-light text-ice">
            {title}
          </h2>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </Panel>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile flex items-center justify-between gap-4 rounded-xl px-4 py-3">
      <span className="slug slug-2 shrink-0">{label}</span>
      <span className="min-w-0 truncate text-right text-sm text-ice">{value}</span>
    </div>
  );
}

function PendingCard({ req }: { req: StreamerRequest }) {
  const [busy, setBusy] = useState(false);

  return (
    <StatusShell eyebrow="Pending" title="ส่งคำขอแล้ว รอผู้ดูแลอนุมัติ" tone="var(--st-next)">
      <p className="text-sm leading-relaxed text-muted">
        พออนุมัติแล้วหน้านี้จะเปลี่ยนเป็นสตูดิโอให้เองทันที ไม่ต้องรีเฟรช
        ระหว่างนี้ยังใช้เครื่องมือฟรีและสมัครแข่งได้ตามปกติ
      </p>

      <div className="mt-5 space-y-2">
        <DetailRow label="ชื่อช่อง" value={req.channelName} />
        <DetailRow label="แพลตฟอร์ม" value={platformLabel(req.platform)} />
        <DetailRow label="ส่งเมื่อ" value={formatThaiDate(req.createdAt)} />
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="mt-5"
        loading={busy}
        onClick={() => {
          setBusy(true);
          void withdrawStreamerRequest(req.uid)
            .then(() => toast("ถอนคำขอแล้ว", "success"))
            .catch(() => toast("ถอนไม่สำเร็จ", "error"))
            .finally(() => setBusy(false));
        }}
      >
        ถอนคำขอ
      </Button>
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
    <StatusShell eyebrow="Not approved" title="คำขอยังไม่ผ่าน" tone="var(--st-live)">
      <p className="text-sm leading-relaxed text-muted">
        แก้ตามที่ผู้ดูแลบอกแล้วยื่นใหม่ได้เลย ไม่จำกัดจำนวนครั้ง
      </p>

      {req.reason && (
        <div className="tally sunken mt-5 rounded-xl py-3 pr-4 pl-5">
          <p className="slug slug-2">เหตุผลจากผู้ดูแล</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ice">{req.reason}</p>
        </div>
      )}

      <div className="mt-5 space-y-2">
        <DetailRow label="ชื่อช่องที่ขอ" value={req.channelName} />
        <DetailRow label="ตัดสินเมื่อ" value={formatThaiDate(req.decidedAt)} />
      </div>

      <Button className="mt-5" onClick={onRedo}>
        แก้แล้วยื่นใหม่
      </Button>
    </StatusShell>
  );
}

/**
 * ใบที่อนุมัติแล้ว — ปกติผู้ใช้จะไม่เห็นการ์ดนี้ เพราะพอมีสิทธิ์แล้ว
 * ประตูจะพาเข้าสตูดิโอไปก่อน การ์ดนี้จึงเป็นทางออกกรณีสิทธิ์ยังมาไม่ถึงเครื่อง
 */
function ApprovedCard({ req }: { req: StreamerRequest }) {
  return (
    <StatusShell eyebrow="Approved" title="อนุมัติแล้ว" tone="var(--st-win)">
      <p className="text-sm leading-relaxed text-muted">
        บัญชีนี้เป็นสตรีมเมอร์แล้ว เปิดสตูดิโอเพื่อตั้งค่าช่อง{" "}
        {req.channelName ? `“${req.channelName}”` : ""} ได้เลย
      </p>
      <Link href="/studio/" className="mt-5 inline-flex">
        <Button icon={<IconCheck className="h-4 w-4" strokeWidth={2} />}>
          เข้าสตูดิโอ
        </Button>
      </Link>
    </StatusShell>
  );
}

function RequestSkeleton() {
  return (
    <div className="surface hairline-top rounded-2xl p-7 sm:p-8" aria-busy="true">
      <Skeleton className="h-2.5 w-24" />
      <Skeleton className="mt-3 h-7 w-56" />
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <Skeleton className="mt-7 h-3 w-20" />
      <Skeleton className="mt-2 h-11 w-full rounded-xl" />
      <Skeleton className="mt-5 h-3 w-24" />
      <Skeleton className="mt-2 h-11 w-full rounded-xl" />
      <Skeleton className="mt-6 h-12 w-full rounded-xl" />
    </div>
  );
}
