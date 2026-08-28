"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
import { formatThaiDate } from "@/lib/tournament/share";
import { safeUrl } from "@/lib/safe";
import AdminTeamPanel from "@/components/auth/AdminTeamPanel";
import UserPicker, { displayName } from "@/components/auth/UserPicker";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Panel, { PanelHeader } from "@/components/ui/Panel";
import Reveal from "@/components/ui/Reveal";
import PageHead from "./PageHead";
import { toast } from "@/components/ui/Toast";
import { IconExternal } from "@/components/ui/icons";
import { Badge, EmptyState, Input, Skeleton } from "@/components/tournament/ui";

/* อ้างอิงคงที่ ไม่งั้น setState ตอน error จะสร้างอาร์เรย์ใหม่แล้วรีเรนเดอร์ไม่จบ */
const NO_REQUESTS: StreamerRequest[] = [];
const NO_STREAMERS: StreamerEntry[] = [];
const NO_USERS: UserProfile[] = [];

/**
 * สิทธิ์และคำขอ — ที่เดียวที่ตัดสินว่าใครทำอะไรได้บ้างในเว็บนี้
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
    <div className="space-y-7">
      <PageHead
        eyebrow="Access"
        title="สิทธิ์และคำขอ"
        description="อนุมัติคนที่ขอเปิดช่อง ดูว่าใครเป็นสตรีมเมอร์อยู่บ้าง และจัดการผู้ดูแลระบบ"
        meta={`${streamers.length} สตรีมเมอร์`}
      />

      <Reveal>
        <Panel variant="feature" className="p-6 sm:p-7">
          <PanelHeader
            eyebrow="Requests"
            title="คำขอที่รออนุมัติ"
            count={pending.length || undefined}
          />

          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-xl" />
              ))}
            </div>
          ) : pending.length === 0 ? (
            <EmptyState
              title="ไม่มีใบค้าง"
              description="คำขอใหม่จะโผล่ตรงนี้ทันทีที่มีคนกดส่ง ไม่ต้องรีเฟรช"
            />
          ) : (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {pending.map((req) => (
                  <RequestCard
                    key={req.uid}
                    req={req}
                    profile={byUid.get(req.uid)}
                    me={me}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </Reveal>

      <Reveal index={1}>
        <StreamerRoster
          streamers={streamers}
          byUid={byUid}
          meUid={me?.uid}
          meLabel={me?.name ?? ""}
        />
      </Reveal>

      {decided.length > 0 && (
        <Reveal index={2}>
          <Panel className="p-6">
            <PanelHeader
              eyebrow="History"
              title="ใบที่ตัดสินแล้ว"
              count={decided.length}
            />
            <ul className="space-y-2">
              {decided.map((req) => (
                <li
                  key={req.uid}
                  className="tile flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ice">
                      {req.channelName || req.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {platformLabel(req.platform)} · ตัดสินเมื่อ{" "}
                      {formatThaiDate(req.decidedAt)}
                      {req.decidedBy ? ` โดย ${req.decidedBy}` : ""}
                      {req.reason ? ` · ${req.reason}` : ""}
                    </p>
                  </div>
                  {req.status === "approved" ? (
                    <Badge rgb="52 227 176">อนุมัติแล้ว</Badge>
                  ) : (
                    <Badge rgb="255 91 122">ไม่ผ่าน</Badge>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        </Reveal>
      )}

      <Reveal index={3}>
        <AdminTeamPanel />
      </Reveal>
    </div>
  );
}

/* =========================================================================
   ใบคำขอ
   ========================================================================= */

function RequestCard({
  req,
  profile,
  me,
}: {
  req: StreamerRequest;
  profile?: UserProfile;
  me: { uid: string; name: string } | null;
}) {
  const reduced = useReducedMotion();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const link = safeUrl(req.channelUrl);
  const by = { uid: me?.uid ?? "", label: me?.name ?? "ผู้ดูแล" };

  const decide = (
    decision: "approved" | "rejected",
    note?: string,
  ) => {
    setBusy(decision === "approved" ? "approve" : "reject");
    void decideStreamerRequest(req, decision, by, note)
      .then(() =>
        toast(
          decision === "approved"
            ? `ให้สิทธิ์สตรีมเมอร์กับ ${req.channelName || req.name} แล้ว`
            : "ปฏิเสธคำขอแล้ว",
          decision === "approved" ? "success" : "info",
        ),
      )
      .catch((err) =>
        toast(
          `ทำรายการไม่สำเร็จ — ${err instanceof Error ? err.message : err}`,
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
      layout
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="tile rounded-2xl p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="sunken grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl">
          {profile?.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="font-display text-sm text-iris">
              {(req.channelName || req.name || "?").slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-sm text-ice">
            {req.channelName}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {profile ? displayName(profile) : req.name} ·{" "}
            {req.email ?? "ไม่มีอีเมล"}
          </p>
        </div>

        <Badge rgb="169 155 255">{platformLabel(req.platform)}</Badge>
      </div>

      {req.note && (
        <p className="mt-3 text-sm leading-relaxed text-muted">{req.note}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        <span className="num">ส่งเมื่อ {formatThaiDate(req.createdAt)}</span>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-iris hover:underline"
          >
            เปิดช่อง
            <IconExternal className="h-3 w-3" />
          </a>
        )}
      </div>

      {rejecting ? (
        <div className="mt-4">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="บอกเหตุผลสั้นๆ ให้เขาแก้แล้วยื่นใหม่ได้ (ไม่ใส่ก็ได้)"
            maxLength={300}
            autoFocus
          />
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={busy === "reject"}
              onClick={() => decide("rejected", reason)}
            >
              ยืนยันปฏิเสธ
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={busy === "approve"}
            onClick={() => decide("approved")}
          >
            อนุมัติเป็นสตรีมเมอร์
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
            ปฏิเสธ
          </Button>
        </div>
      )}
    </motion.li>
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
  const [picked, setPicked] = useState<UserProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<StreamerEntry | null>(null);

  const add = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await grantStreamer(picked.uid, displayName(picked), {
        email: picked.email,
        grantedBy: meLabel,
      });
      setPicked(null);
      toast("ให้สิทธิ์สตรีมเมอร์แล้ว", "success");
    } catch {
      toast("ให้สิทธิ์ไม่สำเร็จ — ลองใหม่อีกครั้ง", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="p-6 sm:p-7">
      <PanelHeader
        eyebrow="Streamers"
        title="สตรีมเมอร์"
        count={streamers.length || undefined}
      />

      <p className="text-sm leading-relaxed text-muted">
        คนในรายชื่อนี้เปิดสตูดิโอได้ และจัดการ <b className="text-ice">ช่องของตัวเอง</b>{" "}
        ได้เท่านั้น — ไม่เห็นรายชื่อผู้ใช้ทั้งระบบ และแก้ช่องคนอื่นไม่ได้
      </p>

      <div className="mt-5">
        {streamers.length === 0 ? (
          <EmptyState
            title="ยังไม่มีสตรีมเมอร์"
            description="อนุมัติใบคำขอด้านบน หรือเพิ่มเองจากรายชื่อผู้ใช้ข้างล่างก็ได้"
          />
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {streamers.map((entry) => {
                const profile = byUid.get(entry.uid);
                const name = profile ? displayName(profile) : entry.label;
                return (
                  <motion.li
                    key={entry.uid}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="tile flex items-center gap-3 rounded-xl px-4 py-3"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-hair">
                      {profile?.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={profile.photo}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="font-display text-xs text-iris">
                          {name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ice">{name}</p>
                      <p className="truncate text-xs text-muted">
                        {profile?.email ?? entry.email ?? entry.uid}
                        {entry.grantedAt
                          ? ` · ให้สิทธิ์ ${formatThaiDate(entry.grantedAt)}`
                          : ""}
                      </p>
                    </div>

                    {entry.uid === meUid ? (
                      <span className="slug slug-2 shrink-0">คุณ</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setRemoving(entry)}
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
      </div>

      <div className="mt-6 border-t border-hair pt-5">
        <UserPicker
          label="เพิ่มสตรีมเมอร์เอง"
          hint="เลือกจากคนที่เคยล็อกอินเข้าเว็บแล้ว — ใช้ตอนคุยกันนอกเว็บมาแล้ว"
          value={picked?.uid ?? null}
          onChange={setPicked}
          exclude={streamers.map((s) => s.uid)}
        />
        <div className="mt-3 flex justify-end">
          <Button
            loading={busy}
            disabled={!picked}
            className="w-full sm:w-auto"
            onClick={() => void add()}
          >
            ให้สิทธิ์
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!removing}
        tone="danger"
        title="ถอดสิทธิ์สตรีมเมอร์คนนี้?"
        description="เขาจะเปิดสตูดิโอไม่ได้อีกและเปิดช่องใหม่ไม่ได้ — ช่องที่มีอยู่แล้วยังเป็นของเขาและยังแก้ได้ตามปกติ"
        confirmText="ถอดสิทธิ์"
        onConfirm={() => {
          if (!removing) return;
          void revokeStreamer(removing.uid)
            .then(() => toast("ถอดสิทธิ์แล้ว", "success"))
            .catch(() => toast("ถอดสิทธิ์ไม่สำเร็จ", "error"));
        }}
        onClose={() => setRemoving(null)}
      />
    </Panel>
  );
}
