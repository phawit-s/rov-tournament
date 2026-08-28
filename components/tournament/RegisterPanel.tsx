"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useNow } from "@/hooks/useClient";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import { LANES, identityFor, laneByLabel } from "@/lib/game";
import { safeImageSrc } from "@/lib/safe";
import {
  cloudReady,
  submitRegistration,
  watchMyRegistrations,
  withdrawRegistration,
  type Registration,
} from "@/lib/tournament/cloud";
import {
  GATE_TEXT,
  findMyEntry,
  nameTaken,
  registerGate,
  slotsLeft,
  type MyEntry,
} from "@/lib/tournament/registration";
import { formatThaiDate } from "@/lib/tournament/share";
import type { Tournament } from "@/lib/tournament/types";
import AuthPanel from "../auth/AuthPanel";
import Crest from "../team/Crest";
import Button from "../ui/Button";
import ImagePicker from "../ui/ImagePicker";
import Panel from "../ui/Panel";
import { IconCheck, LANE_ICON } from "../ui/icons";
import { toast } from "../ui/Toast";
import ConfirmDialog from "../ui/ConfirmDialog";
import { Countdown } from "./SchedulePanel";
import { ArtCalendar, ArtShield, Badge, EmptyState, Input, Label, Textarea } from "./ui";

type Props = { tournament: Tournament };

const MAX_MEMBERS = 12;

export default function RegisterPanel({ tournament }: Props) {
  useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );
  useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );

  const signedIn = authStore.user();
  // บัญชีนิรนาม (ติดมาจากหน้าโดเนท) ตามตัวกลับไม่ได้ ถือว่ายังไม่มีบัญชี
  const account = signedIn && !signedIn.anonymous ? signedIn : null;

  /* นาฬิกาเดินเอง เวลาเปิด/ปิดรับสมัครจะได้พลิกเองโดยไม่ต้องรีเฟรช */
  const now = useNow();

  /* ใบของตัวเองบนคลาวด์ — ตัวนี้คือความจริง ไม่ใช่สำเนาในเครื่อง */
  const [myRegs, setMyRegs] = useState<Registration[] | null>(null);
  const uid = account?.uid ?? null;
  useEffect(() => {
    if (!uid || !cloudReady()) return;
    return watchMyRegistrations(
      tournament.id,
      uid,
      (list) => setMyRegs(list),
      () => setMyRegs([]),
    );
  }, [tournament.id, uid]);

  const online = hasBackend && cloudReady() && !!tournament.ownerUid;
  const gate = registerGate(tournament, now, online);
  const accepted = findMyEntry(tournament, uid);
  // ใบล่าสุดที่ยังมีผลอยู่ ใบที่ถูกปฏิเสธไม่นับ จะได้สมัครใหม่ได้
  const openReg = myRegs?.find((r) => r.status !== "rejected") ?? null;
  const rejected = !openReg ? (myRegs?.find((r) => r.status === "rejected") ?? null) : null;

  /* ---- 1. รับเข้าไปแล้ว หรือส่งใบไปแล้ว = ไม่ต้องเห็นฟอร์มอีก ---- */
  if (accepted || openReg) {
    return (
      <MyApplication
        tournament={tournament}
        entry={accepted}
        registration={openReg}
      />
    );
  }

  /* ---- 2. ปิดรับด้วยเหตุผลอะไรสักอย่าง = บอกเหตุผล ไม่ต้องโชว์ฟอร์มตาย ---- */
  if (!gate.open) return <GateCard tournament={tournament} gate={gate} />;

  /* ---- 3. ยังไม่มีบัญชี = ต้องมีก่อน ผู้จัดถึงจะตามตัวกลับได้ ---- */
  if (!account) return <SignInFirst tournament={tournament} />;

  /* ---- 4. กรอกใบสมัคร ---- */
  return (
    <Wizard
      tournament={tournament}
      account={{ uid: account.uid, name: account.name, email: account.email }}
      rejected={rejected}
    />
  );
}

/* =========================================================================
   สถานะใบของฉัน
   ========================================================================= */

function MyApplication({
  tournament,
  entry,
  registration,
}: {
  tournament: Tournament;
  entry: MyEntry | null;
  registration: Registration | null;
}) {
  const [withdrawing, setWithdrawing] = useState(false);
  const [asking, setAsking] = useState(false);

  // รับเข้ารายชื่อแล้วถือว่าผ่าน แม้ใบจะยังค้างสถานะ pending อยู่ก็ตาม
  const approved = !!entry || registration?.status === "approved";
  const solo = entry?.kind === "solo" || registration?.kind === "solo";

  const name =
    entry?.entry.name ?? registration?.teamName ?? "ใบสมัครของคุณ";
  const members =
    entry?.kind === "team" ? entry.entry.members : (registration?.members ?? []);
  const image =
    entry?.kind === "team"
      ? entry.entry.logo
      : entry?.kind === "solo"
        ? entry.entry.avatar
        : (registration?.image ?? undefined);
  const ign = entry?.kind === "solo" ? entry.entry.ign : (registration?.ign ?? undefined);
  const lane =
    entry?.kind === "solo" ? entry.entry.lane : (registration?.lane ?? undefined);
  const contact = entry?.entry.contact ?? registration?.contact ?? undefined;
  const at = entry?.entry.registeredAt ?? registration?.createdAt;

  /* คิวของเรา — นับเฉพาะใบที่ส่งก่อนหน้าเรา ให้รู้ว่าต้องรออีกกี่ราย */
  const queueAhead =
    !approved && registration
      ? (solo ? tournament.soloPlayers : tournament.teams).filter((e) => !e.approved)
          .length
      : 0;

  const canWithdraw = !approved && !!registration && registration.status === "pending";
  const cover = image ? safeImageSrc(image) : null;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Panel
        variant="feature"
        interactive={false}
        state={approved ? "win" : "next"}
        className="overflow-hidden p-0"
      >
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt=""
                  className="h-16 w-16 rounded-2xl object-cover sm:h-20 sm:w-20"
                />
              ) : (
                <div className="tile grid h-16 w-16 place-items-center rounded-2xl sm:h-20 sm:w-20">
                  <Crest identity={identityFor(0)} size={38} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="slug">ใบสมัครของคุณ</p>
              <h3 className="mt-1 truncate font-display text-h2 leading-tight font-light text-ice">
                {name}
              </h3>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {approved ? (
                  <Badge rgb="52 227 176" tone="done">
                    ผ่านแล้ว · อยู่ในรายชื่อ
                  </Badge>
                ) : (
                  <Badge rgb="169 155 255">รอผู้จัดตรวจ</Badge>
                )}
                {at && (
                  <span className="num text-xs text-muted">
                    ส่งเมื่อ {formatThaiDate(at)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <p className="mt-5 text-sm leading-relaxed text-muted">
            {approved
              ? "ผู้จัดรับคุณเข้าทัวร์แล้ว รอประกาศสายแข่งได้เลย ถ้าสายออกแล้วจะเห็นคู่ของคุณในแท็บสายแข่ง"
              : `ใบส่งถึงผู้จัดเรียบร้อย ผู้จัดจะตรวจแล้วกดรับเข้ารายชื่อ${
                  queueAhead > 1 ? ` ตอนนี้มีใบรอตรวจอยู่ ${queueAhead} ใบ` : ""
                } หน้านี้จะเปลี่ยนเองเมื่อผลออก ไม่ต้องรีเฟรช`}
          </p>
        </div>

        <dl className="grid gap-px border-t border-hair bg-[rgb(var(--hair)/var(--hair-a))] sm:grid-cols-2">
          {solo ? (
            <>
              <Cell label="ชื่อในเกม">{ign || "—"}</Cell>
              <Cell label="เลนที่ถนัด">{lane || "ไม่ระบุ"}</Cell>
            </>
          ) : (
            <Cell label={`ผู้เล่น ${members.length} คน`} span>
              {members.length ? members.join(" · ") : "—"}
            </Cell>
          )}
          <Cell label="ช่องทางติดต่อ">{contact || "ไม่ได้ใส่ไว้"}</Cell>
          <Cell label="วันแข่ง">{formatThaiDate(tournament.startAt) || "ยังไม่กำหนด"}</Cell>
        </dl>
      </Panel>

      {canWithdraw && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="danger"
            size="sm"
            loading={withdrawing}
            onClick={() => setAsking(true)}
          >
            ถอนใบสมัคร
          </Button>
          <p className="text-xs text-muted">
            ถอนได้จนกว่าผู้จัดจะกดรับ ถอนแล้วสมัครใหม่ได้
          </p>
        </div>
      )}

      {approved && (
        <p className="text-center text-xs text-muted">
          ต้องการแก้ข้อมูลทีม ติดต่อผู้จัดโดยตรง — รับเข้ารายชื่อแล้วแก้เองไม่ได้
        </p>
      )}

      <ConfirmDialog
        open={asking}
        title="ถอนใบสมัคร?"
        description={`ใบของ "${name}" จะถูกลบออกจากคิวของผู้จัด สมัครใหม่ได้ตราบใดที่ยังเปิดรับอยู่`}
        confirmText="ถอนใบสมัคร"
        onClose={() => setAsking(false)}
        onConfirm={() => {
          if (!registration) return;
          setAsking(false);
          setWithdrawing(true);
          void withdrawRegistration(tournament.id, registration.id)
            .then(() => toast("ถอนใบสมัครแล้ว", "success"))
            .catch(() => toast("ถอนไม่สำเร็จ ลองใหม่อีกครั้ง", "error"))
            .finally(() => setWithdrawing(false));
        }}
      />
    </div>
  );
}

function Cell({
  label,
  children,
  span,
}: {
  label: string;
  children: React.ReactNode;
  span?: boolean;
}) {
  return (
    <div className={`bg-ink px-6 py-4 ${span ? "sm:col-span-2" : ""}`}>
      <dt className="slug slug-2">{label}</dt>
      <dd className="mt-1 text-sm wrap-break-word text-ice/85">{children}</dd>
    </div>
  );
}

/* =========================================================================
   ปิดรับสมัคร
   ========================================================================= */

function GateCard({
  tournament,
  gate,
}: {
  tournament: Tournament;
  gate: { open: false; reason: keyof typeof GATE_TEXT; at?: string };
}) {
  const text = GATE_TEXT[gate.reason];
  const left = slotsLeft(tournament);

  return (
    <div className="mx-auto max-w-2xl">
      <EmptyState
        art={gate.reason === "not-open" ? <ArtCalendar /> : <ArtShield />}
        no="01"
        title={text.title}
        description={text.detail}
        action={
          gate.reason === "not-open" && gate.at ? (
            <div className="text-center">
              <p className="slug slug-2">เปิดรับใน</p>
              <Countdown
                iso={gate.at}
                className="num mt-1 block font-display text-2xl text-iris"
              />
              <p className="num mt-1 text-xs text-muted">{formatThaiDate(gate.at)}</p>
            </div>
          ) : gate.reason === "full" && left === 0 ? (
            <p className="num text-sm text-muted">
              รับ {tournament.maxTeams}{" "}
              {tournament.entryMode === "solo" ? "คน" : "ทีม"} · เต็มแล้ว
            </p>
          ) : undefined
        }
      />
    </div>
  );
}

/* =========================================================================
   ต้องล็อกอินก่อน
   ========================================================================= */

function SignInFirst({ tournament }: { tournament: Tournament }) {
  const solo = tournament.entryMode === "solo";
  return (
    /* กว้างเท่า AuthPanel (max-w-md) สองใบจะได้เรียงตรงกันเป็นแถบเดียว */
    <div className="mx-auto max-w-md space-y-5">
      <Panel interactive={false} className="p-6 text-center">
        <p className="slug">ก่อนสมัคร</p>
        <h3 className="mt-2 font-display text-xl font-light text-ice">
          สมัครด้วยบัญชีของคุณ
        </h3>
        <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-muted">
          ผู้จัดต้องติดต่อกลับได้ตอนประกาศสาย และคุณจะได้เห็นสถานะใบของตัวเอง
          กับถอนใบเองได้ ใช้บัญชีเดิมสมัครทัวร์อื่นได้ทุกทัวร์ ไม่ต้องกรอกซ้ำ
        </p>
      </Panel>

      <AuthPanel
        title="เข้าสู่ระบบเพื่อสมัคร"
        description={
          solo
            ? "ล็อกอินแล้วกรอกชื่อในเกมกับเลนที่ถนัด ใช้เวลาไม่ถึงนาที"
            : "ล็อกอินแล้วกรอกชื่อทีมกับรายชื่อผู้เล่น ใช้เวลาไม่ถึงนาที"
        }
      />
    </div>
  );
}

/* =========================================================================
   ฟอร์มสมัครแบบทีละขั้น
   ========================================================================= */

type Account = { uid: string; name: string; email: string | null };

function Wizard({
  tournament,
  account,
  rejected,
}: {
  tournament: Tournament;
  account: Account;
  rejected: Registration | null;
}) {
  const reduced = useReducedMotion();
  const solo = tournament.entryMode === "solo";
  const teamSize = Math.min(MAX_MEMBERS, Math.max(1, tournament.teamSize));
  const profile = profileStore.profile();

  /*
    ค่าเริ่มต้นมาจากโปรไฟล์ แต่โปรไฟล์โหลดทีหลังได้
    จึงเก็บ null แปลว่า "ยังไม่แตะ" แล้วค่อยตกไปใช้ค่าจากโปรไฟล์ตอนแสดงผล
    วิธีนี้ไม่ต้อง setState ใน effect ซึ่งกฎ react-hooks ห้ามอยู่แล้ว
  */
  const myGameName = profile?.gameName?.trim() ?? "";
  const myContact = profile?.contact?.trim() ?? "";

  const [nameRaw, setNameRaw] = useState<string | null>(null);
  const [ignRaw, setIgnRaw] = useState<string | null>(null);
  const [contactRaw, setContactRaw] = useState<string | null>(null);
  const [slotsRaw, setSlotsRaw] = useState<string[] | null>(null);
  const [lane, setLane] = useState<string>("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);

  const name = nameRaw ?? (solo ? myGameName : "");
  const ign = ignRaw ?? myGameName;
  const contact = contactRaw ?? myContact;

  const defaultSlots = useMemo(() => {
    const arr = Array.from({ length: teamSize }, () => "");
    if (myGameName) arr[0] = myGameName;
    return arr;
  }, [teamSize, myGameName]);
  const slots = slotsRaw ?? defaultSlots;

  const setSlot = (index: number, value: string) =>
    setSlotsRaw(slots.map((s, i) => (i === index ? value : s)));

  /**
   * วางรายชื่อทีเดียวได้เลย
   *
   * คนที่มาสมัครเกือบทุกคนมีรายชื่อทีมอยู่แล้วในแชท — ก๊อปมาทั้งก้อนแล้ววาง
   * ช่องแรก ของเดิมจะยัดทั้งก้อนลงช่องเดียวแล้วโดนตัดที่ 30 ตัวอักษร
   * ต้องมานั่งพิมพ์ทีละคนใหม่ห้ารอบ
   *
   * ตอนนี้ถ้าสิ่งที่วางมีหลายบรรทัด/คั่นด้วยจุลภาค จะกระจายลงช่องถัดๆ ไปให้เอง
   * และเพิ่มช่องสำรองให้พอ (ไม่เกิน MAX_MEMBERS)
   */
  const pasteRoster = (index: number, text: string): boolean => {
    const names = text
      .split(/[\n\r,;\t]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length < 2) return false;

    const next = [...slots];
    for (let i = 0; i < names.length; i++) {
      const at = index + i;
      if (at >= MAX_MEMBERS) break;
      if (at >= next.length) next.push("");
      next[at] = names[i].slice(0, 30);
    }
    setSlotsRaw(next);
    return true;
  };

  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const steps = solo
    ? [
        { key: "you", label: "ตัวคุณ" },
        { key: "review", label: "ทวนแล้วส่ง" },
      ]
    : [
        { key: "team", label: "ทีม" },
        { key: "roster", label: "ผู้เล่น" },
        { key: "review", label: "ทวนแล้วส่ง" },
      ];

  const filled = slots.filter((s) => s.trim()).length;

  /** เหตุผลที่ไปต่อไม่ได้ — คืน null แปลว่าผ่าน */
  const blockedAt = (index: number): string | null => {
    const key = steps[index].key;
    if (key === "you" || key === "team") {
      if (!name.trim()) return solo ? "ใส่ชื่อที่จะให้คนอื่นเห็น" : "ใส่ชื่อทีมก่อน";
      if (name.trim().length > 40) return "ชื่อยาวเกิน 40 ตัวอักษร";
      if (nameTaken(tournament, name)) {
        return solo ? "ชื่อนี้มีคนใช้แล้วในทัวร์นี้" : "ชื่อทีมนี้สมัครไปแล้ว";
      }
    }
    if (key === "roster" && filled === 0) return "ใส่ชื่อผู้เล่นอย่างน้อย 1 คน";
    return null;
  };

  const blocked = blockedAt(step);
  const last = step === steps.length - 1;

  const send = async () => {
    setSending(true);
    setSendError(null);
    try {
      await submitRegistration(
        tournament.id,
        {
          kind: solo ? "solo" : "team",
          teamName: name.trim(),
          members: solo ? [] : slots.map((s) => s.trim()).filter(Boolean),
          ...(contact.trim() ? { contact: contact.trim() } : {}),
          ...(solo && ign.trim() ? { ign: ign.trim() } : {}),
          ...(solo && lane ? { lane } : {}),
          ...(image ? { image } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        {
          uid: account.uid,
          name: myGameName || account.name || account.email || "ผู้สมัคร",
        },
      );
      toast("ส่งใบสมัครถึงผู้จัดแล้ว", "success");
      // ไม่ต้อง reset อะไร — snapshot ของใบจะพาไปหน้าสถานะเอง
    } catch {
      setSendError(
        "ส่งไม่สำเร็จ — เช็กอินเทอร์เน็ตแล้วลองใหม่ ถ้ายังไม่ได้แปลว่าผู้จัดปิดรับไปแล้ว",
      );
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {rejected && (
        <Panel interactive={false} state="out" className="p-5">
          <p className="slug">ใบก่อนหน้า</p>
          <p className="mt-1 text-sm text-muted">
            ใบของ &ldquo;{rejected.teamName}&rdquo; ไม่ผ่านการตรวจ
            สมัครใหม่ได้เลย ลองเช็กว่ากรอกครบตามที่ผู้จัดกำหนดหรือยัง
          </p>
        </Panel>
      )}

      <Panel variant="feature" interactive={false} className="p-6 sm:p-8">
        <StepRail steps={steps} current={step} onJump={(i) => i < step && setStep(i)} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={steps[step].key}
            initial={reduced ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduced ? undefined : { opacity: 0, x: -16 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="mt-7 space-y-5"
          >
            {steps[step].key === "team" && (
              <>
                <Field
                  label="ชื่อทีม"
                  hint="ชื่อนี้จะขึ้นบนสายแข่งและบนจอสตรีม"
                  error={nameRaw !== null ? blocked : null}
                >
                  <Input
                    value={name}
                    onChange={(e) => setNameRaw(e.target.value)}
                    placeholder="เช่น Rainmaker"
                    maxLength={40}
                    autoFocus
                  />
                </Field>
                <ImagePicker
                  label="โลโก้ทีม"
                  value={image}
                  onChange={(v) => setImage(v ?? null)}
                  placeholder={<Crest identity={identityFor(0)} size={34} />}
                  maxWidth={400}
                  maxBytes={90_000}
                />
              </>
            )}

            {steps[step].key === "you" && (
              <>
                <Field
                  label="ชื่อที่จะให้คนอื่นเห็น"
                  hint="ขึ้นบนรายชื่อผู้สมัครและบนสายแข่ง"
                  error={nameRaw !== null ? blocked : null}
                >
                  <Input
                    value={name}
                    onChange={(e) => setNameRaw(e.target.value)}
                    placeholder="ชื่อเล่น"
                    maxLength={40}
                    autoFocus
                  />
                </Field>
                <Field label="ชื่อในเกม" hint="ไว้ให้ผู้จัดหาตัวคุณในเกมเจอ">
                  <Input
                    value={ign}
                    onChange={(e) => setIgnRaw(e.target.value)}
                    placeholder="IGN"
                    maxLength={30}
                  />
                </Field>
                <div>
                  <Label hint="เลือกได้ตัวเดียว ไม่เลือกก็ได้">เลนที่ถนัด</Label>
                  <LanePicker value={lane} onChange={setLane} />
                </div>
                <ImagePicker
                  label="รูปโปรไฟล์"
                  value={image}
                  onChange={(v) => setImage(v ?? null)}
                  placeholder={<Crest identity={identityFor(0)} size={34} />}
                  maxWidth={400}
                  maxBytes={90_000}
                />
              </>
            )}

            {steps[step].key === "roster" && (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <Label hint="ช่องแรกเติมชื่อในเกมของคุณไว้ให้แล้ว · ก๊อปรายชื่อทั้งก้อนมาวางได้เลย ระบบจะแยกให้เอง">
                    รายชื่อผู้เล่น
                  </Label>
                  <span
                    className={`num shrink-0 font-display text-sm ${
                      filled >= teamSize ? "text-win" : "text-iris"
                    }`}
                  >
                    {filled}/{teamSize}
                  </span>
                </div>

                <ul className="space-y-2">
                  {slots.map((value, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <span
                        className={`num grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-xs ${
                          i < teamSize
                            ? "tile text-iris"
                            : "tile-dashed text-muted"
                        }`}
                      >
                        {i < teamSize ? i + 1 : "S"}
                      </span>
                      <Input
                        value={value}
                        onChange={(e) => setSlot(i, e.target.value)}
                        onPaste={(e) => {
                          const text = e.clipboardData.getData("text");
                          if (pasteRoster(i, text)) e.preventDefault();
                        }}
                        placeholder={
                          i < teamSize ? `ผู้เล่นคนที่ ${i + 1}` : "ตัวสำรอง"
                        }
                        maxLength={30}
                        className="min-w-0 flex-1"
                      />
                      {i >= teamSize && (
                        <button
                          type="button"
                          onClick={() => setSlotsRaw(slots.filter((_, j) => j !== i))}
                          className="shrink-0 cursor-pointer px-1 text-xs text-muted transition-colors hover:text-danger"
                          aria-label="เอาช่องนี้ออก"
                        >
                          ✕
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                {slots.length < MAX_MEMBERS && (
                  <button
                    type="button"
                    onClick={() => setSlotsRaw([...slots, ""])}
                    className="cursor-pointer text-xs text-iris/85 transition-colors hover:text-iris"
                  >
                    + เพิ่มตัวสำรอง
                  </button>
                )}

                {filled > 0 && filled < teamSize && (
                  <p className="text-xs text-muted">
                    ยังขาดอีก {teamSize - filled} คน — ส่งไปก่อนได้
                    แล้วแจ้งผู้จัดเพิ่มทีหลัง
                  </p>
                )}
              </>
            )}

            {steps[step].key === "review" && (
              <>
                <Field
                  label="ช่องทางติดต่อ"
                  hint="ไลน์ / เบอร์ / ดิสคอร์ด — ผู้จัดใช้ตอนประกาศสายและนัดเวลา"
                >
                  <Input
                    value={contact}
                    onChange={(e) => setContactRaw(e.target.value)}
                    placeholder="ไอดีไลน์ / เบอร์ / @tiktok"
                    maxLength={60}
                  />
                </Field>

                <Field label="อยากบอกอะไรผู้จัดไหม" hint="ไม่ใส่ก็ได้">
                  <Textarea
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="เช่น ติดธุระวันเสาร์เช้า ขอคู่รอบบ่าย"
                    maxLength={200}
                  />
                </Field>

                <Summary
                  solo={solo}
                  name={name}
                  ign={ign}
                  lane={lane}
                  members={slots.map((s) => s.trim()).filter(Boolean)}
                  teamSize={teamSize}
                  contact={contact}
                  image={image}
                  onEdit={() => setStep(0)}
                />

                {sendError && <p className="text-sm text-danger">{sendError}</p>}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ---- ปุ่มเดินหน้า ---- */}
        <div className="mt-8 flex items-center gap-3 border-t border-hair pt-5">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              ย้อนกลับ
            </Button>
          ) : (
            <span className="text-xs text-muted">
              สมัครในนาม {myGameName || account.name || account.email}
            </span>
          )}
          <span className="flex-1" />
          {last ? (
            <Button onClick={send} loading={sending} disabled={!!blocked}>
              ส่งใบสมัคร
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)} disabled={!!blocked}>
              ถัดไป
            </Button>
          )}
        </div>

        {blocked && !last && (
          <p className="mt-3 text-right text-xs text-muted">{blocked}</p>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- ชิ้นส่วนของฟอร์ม ---------------- */

function StepRail({
  steps,
  current,
  onJump,
}: {
  steps: { key: string; label: string }[];
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onJump(i)}
              disabled={!done}
              className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors ${
                done ? "cursor-pointer hover:bg-iris/8" : "cursor-default"
              }`}
            >
              <span
                className={`num grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-xs transition-colors ${
                  active
                    ? "accent-fill"
                    : done
                      ? "bg-win/18 text-win"
                      : "tile text-muted"
                }`}
              >
                {done ? <IconCheck className="h-3.5 w-3.5" strokeWidth={2.4} /> : i + 1}
              </span>
              <span
                className={`hidden min-w-0 truncate font-display text-xs sm:block ${
                  active ? "text-ice" : "text-muted"
                }`}
              >
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                className="hidden h-px w-4 shrink-0 sm:block"
                style={{
                  background: done
                    ? "rgb(52 227 176 / 0.5)"
                    : "rgb(var(--hair) / var(--hair-a))",
                }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      {children}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}

function LanePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {LANES.map((l) => {
        const Icon = LANE_ICON[l.key];
        const on = value === l.label;
        return (
          <button
            key={l.key}
            type="button"
            onClick={() => onChange(on ? "" : l.label)}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl px-2 py-3 transition-all duration-200 ${
              on
                ? "bg-iris/14 text-iris ring-1 ring-iris/45"
                : "tile hover-tile text-muted hover:text-ice"
            }`}
          >
            {Icon && <Icon className="h-5 w-5" />}
            <span className="font-display text-xs">{l.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** ทวนของที่จะส่ง — กันกดส่งแล้วค่อยรู้ว่ากรอกผิด */
function Summary({
  solo,
  name,
  ign,
  lane,
  members,
  teamSize,
  contact,
  image,
  onEdit,
}: {
  solo: boolean;
  name: string;
  ign: string;
  lane: string;
  members: string[];
  teamSize: number;
  contact: string;
  image: string | null;
  onEdit: () => void;
}) {
  const laneMeta = lane ? laneByLabel(lane) : null;
  const cover = image ? safeImageSrc(image) : null;

  return (
    <div className="sunken hairline-top rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="slug">สิ่งที่จะส่ง</p>
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer text-xs text-iris/85 transition-colors hover:text-iris"
        >
          กลับไปแก้
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-12 w-12 rounded-xl object-cover" />
        ) : (
          <div className="tile grid h-12 w-12 place-items-center rounded-xl">
            <Crest identity={identityFor(0)} size={26} />
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-display text-base text-ice">{name || "—"}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {solo
              ? [ign || null, laneMeta?.label ?? null].filter(Boolean).join(" · ") ||
                "ไม่ได้ใส่ชื่อในเกม"
              : `${members.length}/${teamSize} คน`}
          </p>
        </div>
      </div>

      {!solo && members.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {members.map((m, i) => (
            <li
              key={`${m}-${i}`}
              className="tile rounded-lg px-2.5 py-1 text-xs text-ice/85"
            >
              {m}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-muted">
        ติดต่อ: {contact.trim() || "ไม่ได้ใส่ไว้ — ผู้จัดจะติดต่อทางบัญชีของคุณแทน"}
      </p>
    </div>
  );
}
