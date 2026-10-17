"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { authStore } from "@/lib/backend/firebase";
import {
  decideStreamerRequest,
  grantStreamer,
  platformLabel,
  revokeStreamer,
  watchStreamerRequests,
  watchStreamers,
  type StreamerEntry,
  type StreamerRequest,
} from "@/lib/backend/roles";
import { watchUsers, type UserProfile } from "@/lib/backend/users";
import { formatThaiDate } from "@/lib/format";
import { safeUrl } from "@/lib/safe";
import AdminTeamPanel from "@/components/auth/AdminTeamPanel";
import UserPicker, { PersonAvatar, displayName } from "@/components/auth/UserPicker";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PageHead from "./PageHead";
import { toast } from "@/components/ui/Toast";
import { IconExternal } from "@/components/ui/icons";
import { Badge, EmptyState, Input, Skeleton } from "@/components/ui/kit";

/* อ้างอิงคงที่ ไม่งั้น setState ตอน error จะสร้างอาร์เรย์ใหม่แล้วรีเรนเดอร์ไม่จบ */
const NO_REQUESTS: StreamerRequest[] = [];
const NO_STREAMERS: StreamerEntry[] = [];
const NO_USERS: UserProfile[] = [];

/** ขยับเฉพาะตอนแถวเข้า/ออกเพราะมีคนกด — ค่าเดียวกับคิวเพลง */
const ROW_EASE: Transition = { duration: 0.22, ease: [0.16, 1, 0.3, 1] };

/**
 * สิทธิ์และคำขอ — ที่เดียวที่ตัดสินว่าใครเปิดคิวเพลงได้ และใครดูแลระบบ
 *
 * เรียงจากงานที่ต้องทำก่อน (ใบที่รออนุมัติ) ลงไปหาข้อมูลอ้างอิง (รายชื่อ)
 * ไม่ทำเป็นแท็บเพราะงานหลักคือ "กดอนุมัติแล้วเช็กว่าเข้ารายชื่อจริงไหม"
 * ซึ่งต้องเห็นสองอย่างพร้อมกัน
 */
export default function RolesPanel() {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  const me = authStore.user();

  const [requests, setRequests] = useState<StreamerRequest[]>(NO_REQUESTS);
  const [streamers, setStreamers] = useState<StreamerEntry[]>(NO_STREAMERS);
  const [users, setUsers] = useState<UserProfile[]>(NO_USERS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stops = [
      watchStreamerRequests(
        (list) => {
          setRequests(list);
          setLoading(false);
        },
        () => {
          setRequests(NO_REQUESTS);
          setLoading(false);
        },
      ),
      watchStreamers(setStreamers, () => setStreamers(NO_STREAMERS)),
      watchUsers(setUsers, () => setUsers(NO_USERS)),
    ];
    return () => stops.forEach((stop) => stop());
  }, []);

  const byUid = useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach((u) => map.set(u.uid, u));
    return map;
  }, [users]);

  const pending = requests.filter((r) => r.status === "pending");
  const decided = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-14">
      <PageHead
        title="สิทธิ์และคำขอ"
        description="อนุมัติคนที่ขอเปิดคิวเพลงให้ช่องของตัวเอง ดูว่าใครเป็นสตรีมเมอร์อยู่บ้าง และจัดการผู้ดูแลระบบ"
      />

      <Section
        id="requests-title"
        title="คำขอที่รออนุมัติ"
        count={loading ? null : pending.length}
      >
        {loading ? (
          <div className="space-y-6" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/2" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-3 h-11 w-48 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <EmptyState
            title="ไม่มีคำขอค้าง"
            description="คำขอใหม่จะขึ้นตรงนี้ทันทีที่มีคนกดส่ง ไม่ต้องรีเฟรช"
          />
        ) : (
          <ul className="rows">
            <AnimatePresence initial={false}>
              {pending.map((req) => (
                <RequestRow
                  key={req.uid}
                  req={req}
                  profile={byUid.get(req.uid)}
                  me={me}
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </Section>

      <StreamerRoster
        streamers={streamers}
        byUid={byUid}
        meUid={me?.uid}
        meLabel={me?.name ?? ""}
      />

      {decided.length > 0 && (
        <Section id="history-title" title="คำขอที่ตัดสินแล้ว" count={decided.length}>
          <ul className="rows">
            {decided.map((req) => (
              <DecidedRow key={req.uid} req={req} />
            ))}
          </ul>
        </Section>
      )}

      <AdminTeamPanel />
    </div>
  );
}

/** หัวกลุ่มในหน้านี้ — หัวข้อหนา จำนวนต่อท้าย คำอธิบายสั้น ปุ่มชิดขวา */
function Section({
  id,
  title,
  count,
  description,
  action,
  children,
}: {
  id: string;
  title: string;
  count?: number | null;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 id={id} className="text-title font-bold">
            {title}
            {count != null && count > 0 && (
              <span className="num ml-2 font-normal text-muted">{count}</span>
            )}
          </h2>
          {description && <p className="mt-1 max-w-prose text-muted">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/* =========================================================================
   ใบคำขอ
   ========================================================================= */

function RequestRow({
  req,
  profile,
  me,
}: {
  req: StreamerRequest;
  profile?: UserProfile;
  me: { uid: string; name: string } | null;
}) {
  const calm = useReducedMotion();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const link = safeUrl(req.channelUrl);
  const by = { uid: me?.uid ?? "", label: me?.name ?? "ผู้ดูแล" };
  const channel = req.channelName || req.name;
  const person = profile ? displayName(profile) : req.name;

  const decide = (
    decision: "approved" | "rejected",
    note?: string,
  ) => {
    setBusy(decision === "approved" ? "approve" : "reject");
    void decideStreamerRequest(req, decision, by, note)
      .then(() =>
        toast(
          decision === "approved"
            ? `อนุมัติแล้ว ${channel} เปิดคิวเพลงได้ทันที`
            : "ปฏิเสธคำขอแล้ว",
          decision === "approved" ? "success" : "info",
        ),
      )
      .catch((err) =>
        toast(
          `${decision === "approved" ? "อนุมัติ" : "ปฏิเสธ"}ไม่สำเร็จ (${
            err instanceof Error ? err.message : String(err)
          }) ลองกดอีกครั้ง`,
          "error",
          6000,
        ),
      )
      .finally(() => {
        setBusy(null);
        setRejecting(false);
      });
  };

  return (
    <motion.li
      layout={!calm}
      initial={{ opacity: 0, y: calm ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={ROW_EASE}
      className="flex items-start gap-3 py-5 first:pt-0"
    >
      <PersonAvatar name={channel} photo={profile?.photo} className="h-11 w-11" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate font-semibold">{req.channelName}</p>
          <Badge>{platformLabel(req.platform)}</Badge>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          ขอโดย {person}
          {req.email ? ` (${req.email})` : ""}
        </p>
        <p className="num text-sm text-muted">ส่งเมื่อ {formatThaiDate(req.createdAt)}</p>

        {req.note && (
          <p className="mt-3 max-w-prose whitespace-pre-line">{req.note}</p>
        )}

        {rejecting ? (
          <div className="mt-4 max-w-xl">
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เหตุผลสั้นๆ ให้เขาแก้แล้วส่งใหม่ได้ (ไม่ใส่ก็ได้)"
              aria-label="เหตุผลที่ไม่อนุมัติ"
              maxLength={300}
              autoFocus
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="danger"
                loading={busy === "reject"}
                onClick={() => decide("rejected", reason)}
              >
                ปฏิเสธคำขอ
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                ยกเลิก
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              loading={busy === "approve"}
              disabled={busy !== null}
              onClick={() => decide("approved")}
            >
              อนุมัติ
            </Button>
            <Button
              variant="secondary"
              disabled={busy !== null}
              onClick={() => setRejecting(true)}
            >
              ปฏิเสธ
            </Button>
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[0.94rem] font-medium transition-colors hover:bg-fill"
              >
                <IconExternal className="h-4 w-4" />
                ดูช่อง
              </a>
            )}
          </div>
        )}
      </div>
    </motion.li>
  );
}

/** ใบที่ตัดสินไปแล้ว — เอาไว้ย้อนดูว่าใครอนุมัติใคร และปฏิเสธเพราะอะไร */
function DecidedRow({ req }: { req: StreamerRequest }) {
  const approved = req.status === "approved";
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{req.channelName || req.name}</p>
        <p className="num text-sm text-muted">
          {approved ? "อนุมัติ" : "ปฏิเสธ"}เมื่อ {formatThaiDate(req.decidedAt)}
          {req.decidedBy ? ` โดย ${req.decidedBy}` : ""}
        </p>
        {req.reason && (
          <p className="mt-0.5 text-sm text-muted">เหตุผล: {req.reason}</p>
        )}
      </div>
      {approved ? <Badge tone="open">อนุมัติแล้ว</Badge> : <Badge>ไม่ผ่าน</Badge>}
    </li>
  );
}

/* =========================================================================
   รายชื่อสตรีมเมอร์
   ========================================================================= */

function StreamerRoster({
  streamers,
  byUid,
  meUid,
  meLabel,
}: {
  streamers: StreamerEntry[];
  byUid: Map<string, UserProfile>;
  meUid?: string;
  meLabel: string;
}) {
  const calm = useReducedMotion();
  const [picked, setPicked] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<StreamerEntry | null>(null);
  /* แยกจาก removing — ชื่อในกล่องยืนยันต้องค้างอยู่ระหว่างที่กล่องกำลังปิด */
  const [confirming, setConfirming] = useState(false);
  /** ตัวเลือกคนกางเฉพาะตอนจะเพิ่ม — รายชื่อผู้ใช้ทั้งระบบยาวเกินจะวางค้างไว้ */
  const [adding, setAdding] = useState(false);

  const add = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await grantStreamer(picked.uid, displayName(picked), {
        email: picked.email,
        grantedBy: meLabel,
      });
      setPicked(null);
      setAdding(false);
      toast("เพิ่มเป็นสตรีมเมอร์แล้ว", "success");
    } catch {
      toast("เพิ่มไม่สำเร็จ เช็กอินเทอร์เน็ตแล้วลองอีกครั้ง", "error");
    } finally {
      setBusy(false);
    }
  };

  const removingName = removing
    ? (() => {
        const profile = byUid.get(removing.uid);
        return profile ? displayName(profile) : removing.label;
      })()
    : "";

  return (
    <Section
      id="streamers-title"
      title="สตรีมเมอร์"
      count={streamers.length}
      description="คนในรายชื่อนี้เข้าสตูดิโอได้ และจัดการคิวเพลงของช่องตัวเองได้เท่านั้น ไม่เห็นผู้ใช้คนอื่นและแก้ช่องของคนอื่นไม่ได้"
      action={
        !adding && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            เพิ่มสตรีมเมอร์เอง
          </Button>
        )
      }
    >
      {adding && (
        <div className="mb-8 max-w-xl">
          <UserPicker
            label="เลือกคนที่จะเป็นสตรีมเมอร์"
            hint="ใช้ตอนคุยกันนอกเว็บมาแล้ว เขาไม่ต้องส่งคำขอ เลือกได้เฉพาะคนที่เคยล็อกอินเข้าเว็บ"
            value={picked?.uid ?? null}
            onChange={setPicked}
            exclude={streamers.map((s) => s.uid)}
          />
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setPicked(null);
              }}
            >
              ยกเลิก
            </Button>
            <Button loading={busy} disabled={!picked} onClick={() => void add()}>
              เพิ่มเป็นสตรีมเมอร์
            </Button>
          </div>
        </div>
      )}

      {streamers.length === 0 ? (
        <EmptyState
          title="ยังไม่มีสตรีมเมอร์"
          description="อนุมัติคำขอด้านบน หรือกด “เพิ่มสตรีมเมอร์เอง” แล้วเลือกจากคนที่เคยล็อกอินเข้าเว็บ"
        />
      ) : (
        <ul className="rows">
          <AnimatePresence initial={false}>
            {streamers.map((entry) => {
              const profile = byUid.get(entry.uid);
              const name = profile ? displayName(profile) : entry.label;
              const contact = profile?.email ?? entry.email ?? null;
              return (
                <motion.li
                  key={entry.uid}
                  layout={!calm}
                  initial={{ opacity: 0, y: calm ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={ROW_EASE}
                  className="flex items-center gap-3 py-3"
                >
                  <PersonAvatar name={name} photo={profile?.photo} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{name}</p>
                    {contact && contact !== name && (
                      <p className="truncate text-sm text-muted">{contact}</p>
                    )}
                    {entry.grantedAt && (
                      <p className="num truncate text-sm text-muted">
                        ได้สิทธิ์เมื่อ {formatThaiDate(entry.grantedAt)}
                      </p>
                    )}
                  </div>

                  {entry.uid === meUid ? (
                    <Badge tone="ink">คุณ</Badge>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => {
                        setRemoving(entry);
                        setConfirming(true);
                      }}
                    >
                      ถอดสิทธิ์
                    </Button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <ConfirmDialog
        open={confirming && !!removing}
        tone="danger"
        title={removingName ? `ถอดสิทธิ์สตรีมเมอร์ของ ${removingName}?` : "ถอดสิทธิ์สตรีมเมอร์คนนี้?"}
        description="เขาจะเข้าสตูดิโอและเปิดช่องใหม่ไม่ได้อีก ช่องที่มีอยู่แล้วยังเป็นของเขา ไม่ถูกลบ"
        confirmText="ถอดสิทธิ์"
        onConfirm={() => {
          if (!removing) return;
          void revokeStreamer(removing.uid)
            .then(() => toast("ถอดสิทธิ์สตรีมเมอร์แล้ว", "success"))
            .catch(() => toast("ถอดสิทธิ์ไม่สำเร็จ เช็กอินเทอร์เน็ตแล้วลองอีกครั้ง", "error"));
        }}
        onClose={() => setConfirming(false)}
      />
    </Section>
  );
}
