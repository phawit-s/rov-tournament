"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { useAccess } from "@/hooks/useAdmin";
import { adminClaimStore } from "@/lib/backend/admin";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { watchUsers, type UserProfile } from "@/lib/backend/users";
import { watchAllChannels } from "@/lib/channel/store";
import type { Channel } from "@/lib/channel/types";
import { watchAllTournaments, type CloudTournament } from "@/lib/tournament/cloud";
import { formatThaiDate } from "@/lib/tournament/share";
import { safeImageSrc } from "@/lib/safe";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import Figure, { FigureRow } from "../ui/Figure";
import Reveal from "../ui/Reveal";
import PageHead from "../studio/PageHead";
import { toast } from "../ui/Toast";
import { IconCopy } from "../ui/icons";
import {
  Badge,
  EmptyState,
  Input,
  STATUS_META,
  Skeleton,
  StatusBadge,
} from "../tournament/ui";

/* อ้างอิงคงที่ ไม่งั้น setState ตอน error จะสร้างอาร์เรย์ใหม่แล้วรีเรนเดอร์ไม่จบ */
const NO_USERS: UserProfile[] = [];
const NO_CHANNELS: Channel[] = [];
const NO_TOURNAMENTS: CloudTournament[] = [];

type Tab = "overview" | "users" | "channels" | "tournaments";

/**
 * ภาพรวมทั้งระบบ — ผู้ใช้ ช่อง และทัวร์ทั้งหมดบนคลาวด์
 *
 * ของทุกอย่างในนี้อ่านจากคลาวด์ทั้งหมด กติกา Firestore เปิด list ให้เฉพาะผู้ดูแล
 * คนที่ปลดด้วยรหัสในเครื่อง (โหมด local) จะได้รายการว่างเปล่า ไม่ใช่ error
 * จึงต้องบอกให้ชัดว่าต้องล็อกอินบัญชีผู้ดูแลจริงถึงจะเห็นข้อมูล
 *
 * การให้/ถอดสิทธิ์ย้ายไปอยู่ที่ /studio/roles/ แล้ว — คนละงานกับการดูข้อมูล
 * และเป็นงานที่ต้องเห็นใบคำขอควบคู่ไปด้วย
 */
export default function Backoffice() {
  const access = useAccess();
  const verified = access === "verified";

  useSyncExternalStore(
    adminClaimStore.subscribe,
    adminClaimStore.getSnapshot,
    adminClaimStore.getServerSnapshot,
  );
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );

  const [tab, setTab] = useState<Tab>("overview");
  const [users, setUsers] = useState<UserProfile[]>(NO_USERS);
  const [channels, setChannels] = useState<Channel[]>(NO_CHANNELS);
  const [tournaments, setTournaments] = useState<CloudTournament[]>(NO_TOURNAMENTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!verified) return;
    const stops = [
      watchUsers(
        (list) => {
          setUsers(list);
          setLoading(false);
        },
        () => {
          setUsers(NO_USERS);
          setLoading(false);
        },
      ),
      watchAllChannels(setChannels, () => setChannels(NO_CHANNELS)),
      watchAllTournaments(setTournaments, () => setTournaments(NO_TOURNAMENTS)),
    ];
    return () => stops.forEach((stop) => stop());
  }, [verified]);

  const roster = adminClaimStore.roster();

  if (!hasBackend) {
    return (
      <EmptyState
        title="หลังบ้านต้องเชื่อม Firebase ก่อน"
        description="โหมดไม่มีหลังบ้านเก็บข้อมูลไว้ในเบราว์เซอร์เครื่องเดียว จึงไม่มีผู้ใช้ให้จัดการ"
      />
    );
  }

  if (!verified) {
    return (
      <EmptyState
        no="00"
        title="ต้องเป็นผู้ดูแลที่ยืนยันแล้ว"
        description="รายชื่อผู้ใช้ ช่อง และทัวร์ อ่านได้เฉพาะบัญชีที่อยู่ในรายชื่อผู้ดูแลบนคลาวด์ — รหัสผู้จัดในเครื่องเปิดได้แค่เครื่องมือที่ทำงานในเบราว์เซอร์"
        action={
          <Link href="/studio/channel/" className="font-display text-sm text-iris hover:underline">
            ไปหน้าช่อง →
          </Link>
        }
      />
    );
  }

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "overview", label: "ภาพรวม", count: 0 },
    { key: "users", label: "ผู้ใช้", count: users.length },
    { key: "channels", label: "ช่อง", count: channels.length },
    { key: "tournaments", label: "ทัวร์", count: tournaments.length },
  ];

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Backoffice"
        title="ทั้งระบบ"
        description="ผู้ใช้ทุกบัญชี ช่องที่เผยแพร่แล้ว และทัวร์ที่จัดอยู่บนคลาวด์"
        meta={`${users.length} บัญชี · ${channels.length} ช่อง · ${tournaments.length} ทัวร์`}
      />

      <div className="tile no-scrollbar flex gap-1 overflow-x-auto rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`relative shrink-0 grow cursor-pointer rounded-lg px-3 py-2.5 font-display text-xs whitespace-nowrap transition-colors sm:text-sm ${
              tab === t.key ? "text-onaccent" : "text-muted hover:text-ice"
            }`}
          >
            {tab === t.key && (
              <motion.span
                layoutId="backoffice-tab"
                className="absolute inset-0 rounded-lg accent-fill"
                transition={{ type: "spring", stiffness: 340, damping: 32 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {t.label}
              {t.count > 0 && (
                <span
                  className={`num text-eyebrow ${
                    tab === t.key ? "text-onaccent/60" : "text-muted/70"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <Overview
          users={users}
          channels={channels}
          tournaments={tournaments}
          staff={roster.length}
          loading={loading}
        />
      )}
      {tab === "users" && <Users users={users} loading={loading} />}
      {tab === "channels" && <Channels channels={channels} />}
      {tab === "tournaments" && <Tournaments tournaments={tournaments} />}
    </div>
  );
}

/* =========================================================================
   ภาพรวม
   ========================================================================= */

function Overview({
  users,
  channels,
  tournaments,
  staff,
  loading,
}: {
  users: UserProfile[];
  channels: Channel[];
  tournaments: CloudTournament[];
  staff: number;
  loading: boolean;
}) {
  /* บัญชีที่กรอกโปรไฟล์ครบพอให้ผู้จัดติดต่อกลับได้จริง
     ตัวเลขนี้บอกคุณภาพของฐานผู้ใช้ ไม่ใช่แค่จำนวนหัว */
  const reachable = users.filter((u) => u.contact?.trim()).length;
  const named = users.filter((u) => u.gameName?.trim()).length;
  const running = tournaments.filter((t) => t.status === "running").length;
  const songsOn = channels.filter((c) => c.songs?.enabled).length;

  if (loading) {
    return (
      <Panel className="p-6">
        <div className="grid gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Reveal>
        <Panel variant="feature" className="p-6 sm:p-7">
          <Panel.Header eyebrow="Ledger" title="ทั้งระบบ" />
          <FigureRow>
            <Figure value={users.length} label="บัญชีผู้ใช้" suffix="คน" />
            <Figure
              value={reachable}
              label="ติดต่อกลับได้"
              suffix="คน"
              tone="platinum"
              className="sm:pl-6"
              ratio={users.length > 0 ? reachable / users.length : 0}
            />
            <Figure
              value={channels.length}
              label="ช่องที่เผยแพร่"
              suffix="ช่อง"
              tone="platinum"
              className="sm:pl-6"
            />
            <Figure
              value={tournaments.length}
              label="ทัวร์บนคลาวด์"
              suffix="รายการ"
              tone="platinum"
              className="sm:pl-6"
            />
          </FigureRow>
        </Panel>
      </Reveal>

      <Reveal index={1}>
        <div className="grid gap-5 sm:grid-cols-3">
          <MiniStat
            label="กรอกชื่อในเกมแล้ว"
            value={`${named}/${users.length}`}
            hint="คนที่ไม่กรอกจะขึ้นเป็นชื่อบัญชีในรายชื่อทีม"
          />
          <MiniStat
            label="ทัวร์ที่กำลังแข่ง"
            value={String(running)}
            hint="นับจากสถานะบนคลาวด์"
          />
          <MiniStat
            label="ช่องที่เปิดขอเพลง"
            value={`${songsOn}/${channels.length}`}
            hint="ช่องที่เปิดระบบขอเพลงไว้"
          />
        </div>
      </Reveal>

      <Reveal index={2}>
        <Panel className="p-6">
          <Panel.Header eyebrow="Staff" title="ผู้ดูแลระบบ" count={staff} />
          <p className="text-sm text-muted">
            เจ้าของเว็บถูกกำหนดไว้ในกติกา Firestore โดยตรง จึงไม่โผล่ในรายการนี้ —
            ตัวเลขข้างบนคือคนที่ถูกเพิ่มเข้ามาทีหลัง ให้/ถอดสิทธิ์ได้ที่หน้าสิทธิ์และคำขอ
          </p>
        </Panel>
      </Reveal>
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Panel className="p-5">
      <p className="slug slug-2">{label}</p>
      <p className="num mt-2 font-display text-2xl text-ice">{value}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">{hint}</p>
    </Panel>
  );
}

/* =========================================================================
   ผู้ใช้
   ========================================================================= */

function Users({ users, loading }: { users: UserProfile[]; loading: boolean }) {
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const reduced = useReducedMotion();

  const found = useMemo(() => {
    const text = q.trim().toLocaleLowerCase("th");
    if (!text) return users;
    return users.filter((u) =>
      [u.gameName, u.name, u.email, u.contact]
        .filter(Boolean)
        .some((v) => v!.toLocaleLowerCase("th").includes(text)),
    );
  }, [users, q]);

  const copyUid = (uid: string) => {
    void navigator.clipboard
      .writeText(uid)
      .then(() => {
        setCopied(uid);
        toast("คัดลอกรหัสผู้ใช้แล้ว", "success", 1600);
        window.setTimeout(() => setCopied(null), 1600);
      })
      .catch(() => toast("คัดลอกไม่สำเร็จ", "error"));
  };

  return (
    <Panel className="p-6">
      <Panel.Header
        eyebrow="Accounts"
        title="ผู้ใช้ทั้งหมด"
        count={`${found.length}/${users.length}`}
      />

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นหาจากชื่อในเกม ชื่อบัญชี อีเมล หรือช่องทางติดต่อ"
        className="mb-5"
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : found.length === 0 ? (
        <EmptyState
          title={q ? "ไม่เจอบัญชีที่ตรงกับที่ค้นหา" : "ยังไม่มีใครสมัคร"}
          description={
            q
              ? "ลองค้นด้วยคำที่สั้นลง หรือเช็กว่าพิมพ์ถูกไหม"
              : "บัญชีจะโผล่ที่นี่หลังมีคนสมัครและกรอกโปรไฟล์"
          }
        />
      ) : (
        <ul className="space-y-2">
          {found.map((u, i) => (
            <motion.li
              key={u.uid}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 12) * 0.02, duration: 0.25 }}
              className="tile flex flex-wrap items-center gap-3 rounded-xl p-3"
            >
              {u.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={safeImageSrc(u.photo) ?? ""}
                  alt=""
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="sunken grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm text-iris">
                  {(u.gameName || u.name || u.email || "?").slice(0, 1).toUpperCase()}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm text-ice">
                    {u.gameName?.trim() || u.name?.trim() || "ยังไม่ได้ตั้งชื่อ"}
                  </p>
                  {!u.gameName?.trim() && (
                    <Badge rgb="169 155 255">ยังไม่กรอกชื่อในเกม</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {[u.email, u.contact].filter(Boolean).join(" · ") || "ไม่มีช่องทางติดต่อ"}
                </p>
              </div>

              <span className="num hidden shrink-0 text-xs text-muted sm:block">
                {formatThaiDate(u.createdAt)}
              </span>

              <Button
                size="sm"
                variant="ghost"
                icon={
                  copied === u.uid ? undefined : <IconCopy className="h-3.5 w-3.5" />
                }
                success={copied === u.uid}
                onClick={() => copyUid(u.uid)}
                className="shrink-0"
              >
                {copied === u.uid ? "คัดลอกแล้ว" : "รหัสผู้ใช้"}
              </Button>
            </motion.li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-xs leading-relaxed text-muted">
        อยากให้ใครเป็นสตรีมเมอร์หรือผู้ดูแล ไปที่หน้า “สิทธิ์และคำขอ” แล้วเลือกจาก
        รายชื่อได้เลย — รหัสผู้ใช้ตรงนี้มีไว้เผื่อต้องส่งให้คนอื่นทางแชท
      </p>
    </Panel>
  );
}

/* =========================================================================
   ช่อง
   ========================================================================= */

function Channels({ channels }: { channels: Channel[] }) {
  if (channels.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีช่องบนคลาวด์"
        description="ช่องจะโผล่ที่นี่หลังเจ้าของกดเผยแพร่ครั้งแรก"
      />
    );
  }

  return (
    <Panel className="p-6">
      <Panel.Header eyebrow="Channels" title="ช่องที่เผยแพร่แล้ว" count={channels.length} />
      <ul className="space-y-2">
        {channels.map((c) => (
          <li key={c.id} className="tile flex flex-wrap items-center gap-3 rounded-xl p-3">
            {c.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={safeImageSrc(c.avatar) ?? ""}
                alt=""
                loading="lazy"
                className="h-10 w-10 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="sunken grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-sm text-iris">
                {(c.name || c.handle || "?").slice(0, 1).toUpperCase()}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ice">{c.name || c.handle}</p>
              <p className="num mt-0.5 truncate text-xs text-muted">
                @{c.handle} · แก้ล่าสุด {formatThaiDate(c.updatedAt)}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap gap-1.5">
              {c.donate?.enabled && <Badge rgb="169 155 255">รับโดเนท</Badge>}
              {c.member?.enabled && <Badge rgb="196 130 255">สมาชิก</Badge>}
              {c.songs?.enabled && <Badge rgb="52 227 176">ขอเพลง</Badge>}
            </div>

            <Link
              href={`/c/#h=${c.handle || c.id}`}
              className="shrink-0 font-display text-xs text-iris hover:underline"
            >
              เปิดดู →
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* =========================================================================
   ทัวร์บนคลาวด์

   หน้า "ทั้งระบบ" เคยนับทัวร์เป็นตัวเลขในภาพรวมอย่างเดียว ไม่มีที่ให้กดดู
   ผู้ดูแลที่อยากรู้ว่า "ตอนนี้ใครจัดอะไรอยู่บ้าง" จึงต้องไปเดาจากหน้ารายการ
   ซึ่งเอาสำเนาในเครื่องขึ้นก่อน — เป็นอีกทางที่ทำให้รู้สึกว่าเห็นไม่ครบ
   ========================================================================= */

function Tournaments({ tournaments }: { tournaments: CloudTournament[] }) {
  const [q, setQ] = useState("");

  const found = useMemo(() => {
    const text = q.trim().toLocaleLowerCase("th");
    if (!text) return tournaments;
    return tournaments.filter((t) =>
      [t.name, t.tagline ?? "", t.ownerName ?? ""]
        .join(" ")
        .toLocaleLowerCase("th")
        .includes(text),
    );
  }, [tournaments, q]);

  if (tournaments.length === 0) {
    return (
      <EmptyState
        title="ยังไม่มีทัวร์บนคลาวด์"
        description="ทัวร์จะโผล่ที่นี่หลังผู้จัดกดเผยแพร่ครั้งแรก"
      />
    );
  }

  return (
    <Panel className="p-6">
      <Panel.Header
        eyebrow="Tournaments"
        title="ทัวร์ทั้งหมดบนคลาวด์"
        count={`${found.length}/${tournaments.length}`}
      />

      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="ค้นชื่อทัวร์หรือชื่อผู้จัด"
        className="mb-4"
      />

      <ul className="space-y-2">
        {found.map((t) => (
          <li
            key={t.id}
            className="tile flex flex-wrap items-center gap-3 rounded-xl p-3"
          >
            <span
              aria-hidden
              className="h-9 w-0.75 shrink-0 rounded-full"
              style={{ background: STATUS_META[t.status].hex }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ice">
                {t.name || "ทัวร์นาเมนต์ไม่มีชื่อ"}
              </p>
              <p className="num mt-0.5 truncate text-xs text-muted">
                {t.ownerName || "ไม่ทราบผู้จัด"} ·{" "}
                {t.entryMode === "solo"
                  ? `${t.soloPlayers?.length ?? 0} คน`
                  : `${t.teams?.length ?? 0} ทีม`}{" "}
                · แก้ล่าสุด {formatThaiDate(t.updatedAt)}
              </p>
            </div>

            <StatusBadge status={t.status} />

            <Link
              href={`/tournament/#c=${t.id}`}
              className="shrink-0 font-display text-xs text-iris hover:underline"
            >
              เปิดดู →
            </Link>
          </li>
        ))}
      </ul>

      {found.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          ไม่เจอทัวร์ที่ตรงกับคำค้น
        </p>
      )}
    </Panel>
  );
}
