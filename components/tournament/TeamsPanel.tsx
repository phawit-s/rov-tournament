"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { profileStore, watchUsers, type UserProfile } from "@/lib/backend/users";
import { compressImage } from "@/lib/image";
import { uid } from "@/lib/random";
import { LANES as GAME_LANES, identityFor, laneByLabel } from "@/lib/game";
import { safeImageSrc } from "@/lib/safe";
import { createBracket, defaultRoundBestOf, roundCount } from "@/lib/tournament/bracket";
import { tournamentStore } from "@/lib/tournament/store";
import { entryUid } from "@/lib/tournament/registration";
import { formatThaiDate } from "@/lib/tournament/share";
import type { SoloEntry, TeamEntry, Tournament } from "@/lib/tournament/types";
import DrawStudio from "./DrawStudio";
import Crest from "../team/Crest";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { Meter } from "../ui/hud";
import { IconCheck, LANE_ICON } from "../ui/icons";
import { toast } from "../ui/Toast";
import { ArtShield, Badge, EmptyState, Input, Label, Textarea } from "./ui";

type Props = {
  tournament: Tournament;
  isAdmin: boolean;
  /** สุ่มสายเสร็จแล้วให้หน้าแม่พาไปแท็บสายแข่งต่อ — เป็นโมเมนต์ใหญ่สุดของทัวร์ */
  onGenerated?: () => void;
  /** พาไปแท็บสมัคร — แท็บนี้เป็นรายชื่ออย่างเดียวแล้ว ฟอร์มย้ายไปอยู่ที่นั่น */
  onGoRegister?: () => void;
};

/** ตัวเลือกตำแหน่ง ดึงจากรายการกลาง เพื่อไม่ให้ป้ายเพี้ยนกับไอคอนที่ใช้แสดงผล */
const LANE_OPTIONS = [...GAME_LANES.map((l) => l.label), "ไม่ระบุ"];

/** ชื่อที่เอาไว้โชว์ — ชื่อในเกมมาก่อน แล้วค่อยไล่ลงมา ไม่โชว์ uid ให้คนอ่าน */
function accountLabel(p: UserProfile): string {
  return p.gameName?.trim() || p.name?.trim() || p.email?.trim() || "บัญชีผู้ใช้";
}

/** อ้างอิงเดิมตัวเดียว กัน setState ด้วย array ใหม่ทุกครั้งที่อ่านรายชื่อไม่ได้ */
const NO_PROFILES: UserProfile[] = [];

/**
 * รายชื่อบัญชีทั้งระบบ แปลงเป็นตาราง uid → โปรไฟล์
 * กติกา Firestore เปิด list ให้เฉพาะผู้ดูแล คนอื่นจะได้ตารางว่าง
 * ทุกจุดที่ใช้จึงต้องมีทางสำรองเป็นข้อมูลที่กรอกมากับใบเสมอ
 */
function useAccountDirectory(): Map<string, UserProfile> {
  const [list, setList] = useState<UserProfile[]>(NO_PROFILES);

  useEffect(() => {
    if (!hasBackend) return;
    // setState อยู่ใน callback ของ subscription เท่านั้น ไม่ใช่ในตัว effect
    return watchUsers(
      (rows) => setList(rows),
      () => setList(NO_PROFILES),
    );
  }, []);

  return useMemo(() => new Map(list.map((p) => [p.uid, p])), [list]);
}

export default function TeamsPanel({
  tournament,
  isAdmin,
  onGenerated,
  onGoRegister,
}: Props) {
  const solo = tournament.entryMode === "solo";

  /*
    แท็บนี้เป็น "รายชื่อ" อย่างเดียวแล้ว ฟอร์มสาธารณะย้ายไปแท็บสมัคร
    ที่เหลือตรงนี้คือฟอร์มกรอกแทนของผู้จัด สำหรับทีมที่เดินมาสมัครหน้างาน
  */
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

  const directory = useAccountDirectory();

  /** ฟอร์มกรอกแทนพับเก็บไว้ก่อน ไม่ให้บังรายชื่อซึ่งเป็นของหลักในแท็บนี้ */
  const [adding, setAdding] = useState(false);

  /*
    โรงจับสลาก — เปิดทับทั้งแท็บ

    ของเดิมปุ่ม "สุ่มแบ่งทีม" คำนวณเงียบๆ ครั้งเดียวจบแล้วเขียนทับทีมทันที
    ไม่มีให้ตั้งค่า ไม่มีให้ดูก่อน ย้อนไม่ได้ และไม่มีพิธีอะไรเลย ทั้งที่หน้า /draw
    ซึ่งเป็นเครื่องมือเดียวกันมีครบ — ตอนนี้ใช้ตัวเดียวกันแล้ว (ดู DrawStudio)
  */
  const [drawing, setDrawing] = useState(false);

  const [name, setName] = useState("");
  const [ign, setIgn] = useState("");
  const [lane, setLane] = useState("ไม่ระบุ");
  const [contact, setContact] = useState("");
  const [members, setMembers] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setIgn("");
    setLane("ไม่ระบุ");
    setContact("");
    setMembers("");
    setImage(null);
    setError(null);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setImage(await compressImage(file, { maxWidth: 400, maxBytes: 90_000 }));
      setError(null);
    } catch {
      setError("อ่านรูปไม่ได้ ลองรูปอื่น");
    }
  };

  const addTeam = () => {
    const teamName = name.trim();
    if (!teamName) return setError("ใส่ชื่อทีมด้วย");
    if (
      tournament.teams.some(
        (t) => t.name.toLocaleLowerCase("th") === teamName.toLocaleLowerCase("th"),
      )
    ) {
      return setError("ชื่อทีมนี้สมัครไปแล้ว");
    }

    /* ผู้จัดกรอกเอง = ตรวจด้วยตาแล้ว ไม่ต้องเข้าคิวรออนุมัติซ้ำ
       ไม่มี uid เพราะไม่รู้ว่าทีมนี้ผูกกับบัญชีไหน ผู้จัดใช้ช่องติดต่อแทน */
    const entry: TeamEntry = {
      id: uid(),
      name: teamName,
      members: members
        .split(/[,\n\t;]+/)
        .map((m) => m.trim())
        .filter(Boolean)
        .slice(0, 12),
      contact: contact.trim() || undefined,
      logo: image ?? undefined,
      registeredAt: new Date().toISOString(),
      approved: true,
    };

    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      teams: [...t.teams, entry],
      status: t.status === "draft" ? "registration" : t.status,
    }));
    recordActivity("team.add", `เพิ่มทีม "${teamName}"`, {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
    });
    toast(`รับสมัคร "${teamName}" แล้ว`, "success");
    resetForm();
    setAdding(false);
  };

  const addSolo = () => {
    const playerName = name.trim();
    if (!playerName) return setError("ใส่ชื่อด้วย");
    if (
      tournament.soloPlayers.some(
        (p) => p.name.toLocaleLowerCase("th") === playerName.toLocaleLowerCase("th"),
      )
    ) {
      return setError("ชื่อนี้สมัครไปแล้ว");
    }

    const entry: SoloEntry = {
      id: uid(),
      name: playerName,
      ign: ign.trim() || undefined,
      lane: lane === "ไม่ระบุ" ? undefined : lane,
      contact: contact.trim() || undefined,
      avatar: image ?? undefined,
      registeredAt: new Date().toISOString(),
      approved: true,
    };

    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      soloPlayers: [...t.soloPlayers, entry],
      status: t.status === "draft" ? "registration" : t.status,
    }));
    recordActivity("team.add", `รับสมัคร "${playerName}"`, {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
    });
    toast(`รับสมัคร "${playerName}" แล้ว`, "success");
    resetForm();
    setAdding(false);
  };

  const approvedTeams = tournament.teams.filter((t) => t.approved);
  const approvedSolo = tournament.soloPlayers.filter((p) => p.approved);

  // ใบที่ตามตัวเจ้าของกลับได้จริง — ใบเก่าก่อนมีระบบบัญชีจะไม่มี uid
  const boundTeams = tournament.teams.filter((t) => entryUid(t)).length;
  const boundSolo = tournament.soloPlayers.filter((p) => entryUid(p)).length;

  const generateBracket = () => {
    if (approvedTeams.length < 2) return;
    const rounds = roundCount(approvedTeams.length);
    const bestOf =
      tournament.roundBestOf.length === rounds
        ? tournament.roundBestOf
        : defaultRoundBestOf(rounds);
    const seed = tournamentStore.newSeed();
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      roundBestOf: bestOf,
      bracket: createBracket(approvedTeams, seed, bestOf),
      status: "running",
    }));
    recordActivity(
      "bracket.generate",
      `สุ่มสายจาก ${approvedTeams.length} ทีม (seed ${seed})`,
      { tournamentId: tournament.id, tournamentName: tournament.name },
    );
    toast("สุ่มสายแล้ว", "success");
    onGenerated?.();
  };

  const capacity =
    tournament.maxTeams > 0 ? tournament.teams.length / tournament.maxTeams : 0;

  if (drawing) {
    /*
      ปิดโรงจับสลากแล้วกลับมาที่แท็บทีม ไม่ใช่กระโดดไปแท็บสายแข่ง

      แท็บสายแข่งตอนนั้นยังว่าง (การแบ่งทีมล้างสายเก่าทิ้งไปแล้ว) คนจะเจอ
      หน้า "ยังไม่ได้จัดสาย" ที่มีปุ่มพากลับมาแท็บทีม — วนอยู่สองหน้าโดยไม่ได้อะไร
      ที่แท็บทีมมีทั้งรายชื่อที่เพิ่งได้และปุ่ม "สุ่มสายแข่ง" อยู่แล้ว
    */
    return (
      <DrawStudio tournament={tournament} onClose={() => setDrawing(false)} />
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------- ทางไปสมัคร (คนทั่วไป) ---------- */}
      {!isAdmin && onGoRegister && (
        <Panel interactive={false} className="flex flex-wrap items-center gap-4 p-5">
          <div className="min-w-0 flex-1">
            <p className="slug">อยากลงแข่งด้วย?</p>
            <p className="mt-1 text-sm text-muted">
              หน้านี้เป็นรายชื่อที่ผู้จัดรับเข้าแล้ว ใบสมัครอยู่ที่แท็บสมัคร
            </p>
          </div>
          <Button size="sm" onClick={onGoRegister}>
            ไปหน้าสมัคร
          </Button>
        </Panel>
      )}

      {/* ---------- ฟอร์มกรอกแทน (เฉพาะผู้จัด) ---------- */}
      {isAdmin && (
        <Panel className="p-6">
          <Panel.Header
            eyebrow="Walk-in"
            title={solo ? "เพิ่มผู้เล่นเอง" : "เพิ่มทีมเอง"}
            action={
              <Button
                size="sm"
                variant={adding ? "ghost" : "outline"}
                onClick={() => {
                  if (adding) resetForm();
                  setAdding(!adding);
                }}
              >
                {adding ? "ปิด" : "เปิดฟอร์ม"}
              </Button>
            }
          />
          {!adding ? (
            <p className="text-sm text-muted">
              สำหรับ{solo ? "คน" : "ทีม"}ที่เดินมาสมัครหน้างานหรือทักมาทางแชท —
              กรอกแล้วเข้ารายชื่อทันที ไม่ต้องรออนุมัติ
              ส่วนใบที่ส่งผ่านหน้าเว็บจะไปโผล่ที่แท็บคลาวด์ให้กดรับ
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>{solo ? "ชื่อ" : "ชื่อทีม"}</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={solo ? "ชื่อเล่น" : "เช่น Rainmaker"}
                    maxLength={40}
                    autoFocus
                  />
                </div>
                <div>
                  <Label>ช่องทางติดต่อ (ไม่ใส่ก็ได้)</Label>
                  <Input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="ไอดีไลน์ / เบอร์ / @tiktok"
                    maxLength={60}
                  />
                </div>
              </div>

              {solo ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>ชื่อในเกม</Label>
                    <Input
                      value={ign}
                      onChange={(e) => setIgn(e.target.value)}
                      placeholder="IGN"
                      maxLength={30}
                    />
                  </div>
                  <div>
                    <Label>เลนที่ถนัด</Label>
                    <select
                      value={lane}
                      onChange={(e) => setLane(e.target.value)}
                      className="field w-full rounded-xl px-3.5 py-2.5 text-sm text-ice outline-none"
                    >
                      {LANE_OPTIONS.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <Label hint="ทีละบรรทัด หรือคั่นด้วยลูกน้ำ">รายชื่อผู้เล่น</Label>
                  <Textarea
                    rows={4}
                    value={members}
                    onChange={(e) => setMembers(e.target.value)}
                    placeholder={"ก้อง\nเบียร์\nปอนด์"}
                  />
                  {/* นับหัวสดๆ ให้เห็นว่าครบทีมหรือยังก่อนกดส่ง */}
                  <MemberCount raw={members} size={tournament.teamSize} />
                </div>
              )}

              {/* รูป — ไม่บังคับ */}
              <div>
                <Label hint="ไม่ใส่ก็ได้ ระบบย่อรูปให้เอง">
                  {solo ? "รูปโปรไฟล์" : "โลโก้ทีม"}
                </Label>
                <div className="flex items-center gap-3">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeImageSrc(image) ?? ""}
                      alt=""
                      className="h-16 w-16 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="tile-dashed grid h-16 w-16 place-items-center rounded-xl text-muted">
                      <Crest
                        identity={identityFor(tournament.teams.length)}
                        size={34}
                      />
                    </div>
                  )}
                  <label className="hover-tile tile inline-block cursor-pointer rounded-lg px-3 py-2 text-xs text-ice/80 transition-colors">
                    เลือกรูป
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => void pickImage(e.target.files?.[0])}
                    />
                  </label>
                  {image && (
                    <button
                      type="button"
                      onClick={() => setImage(null)}
                      className="cursor-pointer text-xs text-muted transition-colors hover:text-danger"
                    >
                      เอาออก
                    </button>
                  )}
                </div>
              </div>

              {error && <p className="text-xs text-danger">{error}</p>}

              <Button onClick={solo ? addSolo : addTeam}>
                {solo ? "เพิ่มผู้เล่น" : "เพิ่มทีม"}
              </Button>
            </div>
          )}
        </Panel>
      )}

      {/* ---------- รายชื่อ ---------- */}
      <div className="space-y-5">
        {solo && (
          <Panel className="p-6">
            <Panel.Header
              eyebrow="Applicants"
              title="ผู้สมัคร"
              count={`${approvedSolo.length}/${tournament.soloPlayers.length} คน`}
              action={
                isAdmin ? (
                  <Button
                    size="sm"
                    variant={tournament.teams.length ? "outline" : "primary"}
                    onClick={() => setDrawing(true)}
                    disabled={approvedSolo.length < 2}
                  >
                    {tournament.teams.length ? "สุ่มแบ่งทีมใหม่" : "สุ่มแบ่งทีม"}
                  </Button>
                ) : undefined
              }
            />

            <AccountTally bound={boundSolo} total={tournament.soloPlayers.length} />

            {tournament.soloPlayers.length === 0 ? (
              <EmptyState
                title="ยังไม่มีคนสมัคร"
                description="เปิดลิงก์ทัวร์ให้คนกรอกชื่อ หรือกรอกแทนได้จากฟอร์มด้านซ้าย"
              />
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                <AnimatePresence initial={false}>
                  {tournament.soloPlayers.map((p, i) => (
                    <SoloRow
                      key={p.id}
                      player={p}
                      index={i}
                      isAdmin={isAdmin}
                      tournamentId={tournament.id}
                      directory={directory}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Panel>
        )}

        <Panel className="p-6">
          <Panel.Header
            eyebrow="Roster"
            title="ทีมที่เข้าแข่ง"
            count={`${approvedTeams.length} ผ่าน / ${tournament.teams.length} ทั้งหมด`}
            action={
              isAdmin ? (
                <Button
                  size="sm"
                  onClick={generateBracket}
                  disabled={approvedTeams.length < 2}
                  variant={tournament.bracket ? "outline" : "primary"}
                >
                  {tournament.bracket ? "สุ่มสายใหม่" : "สุ่มสายแข่ง"}
                </Button>
              ) : undefined
            }
          />

          {/* ความจุเส้นเดียวกับการ์ดในหน้ารายการ ให้ผู้จัดเห็นทันทีว่าเต็มหรือยัง */}
          {tournament.maxTeams > 0 && (
            <div className="mb-5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="slug slug-2">ความจุ</span>
                <span className="num font-display text-sm text-ice">
                  {tournament.teams.length}
                  <span className="text-muted">/{tournament.maxTeams}</span>
                </span>
              </div>
              <Meter pct={capacity} h={3} className="mt-2" />
            </div>
          )}

          <AccountTally bound={boundTeams} total={tournament.teams.length} />

          {tournament.teams.length === 0 ? (
            <EmptyState
              art={<ArtShield />}
              title={solo ? "ยังไม่ได้สุ่มแบ่งทีม" : "ยังไม่มีทีมสมัคร"}
              description={
                solo
                  ? "รับสมัครรายบุคคลให้ครบก่อน แล้วกด “สุ่มแบ่งทีม” จะได้พิธีจับสลากทีละคนเหมือนหน้าสุ่มทีม — ตั้งค่าได้ ย้อนได้ และผลยังไม่ถูกบันทึกจนกว่าจะกดยืนยัน"
                  : "กรอกชื่อทีมและรายชื่อผู้เล่นจากฟอร์มด้านซ้ายเพื่อเริ่มรับสมัคร"
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {tournament.teams.map((team, index) => (
                  <TeamRow
                    key={team.id}
                    team={team}
                    index={index}
                    isAdmin={isAdmin}
                    tournamentId={tournament.id}
                    hasBracket={tournament.bracket !== null}
                    directory={directory}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- ชิ้นส่วนย่อย ---------------- */

/** นับรายชื่อที่พิมพ์ไปแล้วเทียบกับขนาดทีม กันส่งไม่ครบ */
function MemberCount({ raw, size }: { raw: string; size: number }) {
  const count = raw
    .split(/[,\n\t;]+/)
    .map((m) => m.trim())
    .filter(Boolean).length;
  if (count === 0) return null;
  const enough = count >= size;
  return (
    <p className="num mt-2 text-xs text-muted">
      <span className={enough ? "text-iris" : "text-ice"}>{count}</span>/{size} คน
      {!enough && <span className="ml-1">— ยังขาด {size - count}</span>}
    </p>
  );
}

/** แถบสรุปว่าใบไหนตามตัวเจ้าของกลับได้บ้าง — ผู้จัดจะได้รู้ว่าเหลือใบที่ตามยากกี่ใบ */
function AccountTally({ bound, total }: { bound: number; total: number }) {
  if (total === 0) return null;
  const missing = total - bound;

  return (
    <div className="sunken mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3.5 py-2.5">
      <span className="slug slug-2">บัญชี</span>
      <span className="num text-xs text-ice">
        ผูกกับบัญชีแล้ว <span className="text-iris">{bound}</span>
        <span className="text-muted">/{total}</span>
      </span>
      {missing > 0 && (
        <span className="text-xs text-muted">
          — อีก {missing} ใบไม่มีบัญชี ตามตัวยาก
        </span>
      )}
    </div>
  );
}

/**
 * บอกว่าใบนี้เป็นของบัญชีไหน แทนการโชว์รหัสยาวๆ (หรือไม่โชว์อะไรเลย)
 * ผู้จัดที่เป็นผู้ดูแลจะได้โปรไฟล์จริงมาจับคู่ คนอื่นได้ตารางว่าง
 * จึงต้องมีทางสำรองเป็นข้อมูลที่กรอกมากับใบเสมอ
 * อีเมล/ช่องทางติดต่อโชว์เฉพาะผู้จัด เหมือนที่ช่องติดต่อเดิมทำอยู่
 */
function AccountLine({
  uid: accountId,
  profile,
  isAdmin,
  fallbackContact,
  className = "",
}: {
  uid: string | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  fallbackContact?: string;
  className?: string;
}) {
  const contact = profile?.contact?.trim() || fallbackContact?.trim() || "";
  const detail = isAdmin
    ? [profile?.email, contact].filter(Boolean).join(" · ")
    : "";

  if (!accountId || !profile) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        {accountId ? (
          <Badge rgb="169 155 255" tone="done">
            ผูกกับบัญชีแล้ว
          </Badge>
        ) : (
          <Badge rgb="126 130 153">ไม่มีบัญชี</Badge>
        )}
        {isAdmin && contact && (
          <span className="min-w-0 flex-1 truncate text-xs text-muted">
            ติดต่อ: {contact}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full border border-hair">
        {profile.photo ? (
          // next/image ใช้กับ static export ไม่ได้ — no-referrer กันรูป Google โดน 429
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.photo}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-display text-[11px] text-iris">
            {accountLabel(profile).slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-ice/85">
          {accountLabel(profile)}
        </span>
        {detail && (
          <span className="block truncate text-[11px] text-muted">
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}

/** แถวผู้สมัครเดี่ยว */
function SoloRow({
  player,
  index,
  isAdmin,
  tournamentId,
  directory,
}: {
  player: SoloEntry;
  index: number;
  isAdmin: boolean;
  tournamentId: string;
  directory: Map<string, UserProfile>;
}) {
  const laneMeta = laneByLabel(player.lane);
  const LaneIcon = laneMeta ? LANE_ICON[laneMeta.key] : null;
  const ownerId = entryUid(player);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`tile flex items-center gap-3 rounded-xl p-3 ${
        player.approved ? "" : "opacity-60"
      }`}
    >
      {player.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safeImageSrc(player.avatar) ?? ""}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="sunken grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm text-iris ring-1 ring-[rgb(var(--accent)/0.28)]">
          {player.name.slice(0, 1)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ice">
          <span className="num mr-1.5 font-display text-[11px] text-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
          {player.name}
        </p>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
          {LaneIcon && <LaneIcon className="h-3 w-3 shrink-0" strokeWidth={1.4} />}
          {player.ign ? `${player.ign} · ` : ""}
          {player.lane ?? "ไม่ระบุเลน"}
        </p>
        <AccountLine
          uid={ownerId}
          profile={ownerId ? (directory.get(ownerId) ?? null) : null}
          isAdmin={isAdmin}
          fallbackContact={player.contact}
          className="mt-1.5"
        />
      </div>

      {isAdmin && (
        <div className="flex shrink-0 items-center gap-1.5">
          <ApproveToggle
            approved={player.approved}
            onClick={() =>
              tournamentStore.mutate(tournamentId, (t) => ({
                ...t,
                soloPlayers: t.soloPlayers.map((x) =>
                  x.id === player.id ? { ...x, approved: !x.approved } : x,
                ),
              }))
            }
          />
          <RemoveButton
            label={`ลบ ${player.name}`}
            onDone={() =>
              tournamentStore.mutate(tournamentId, (t) => ({
                ...t,
                soloPlayers: t.soloPlayers.filter((x) => x.id !== player.id),
              }))
            }
          />
        </div>
      )}
    </motion.li>
  );
}

/** การ์ดทีม — แถบสีประจำทีมชิดซ้าย เลขทีมตัวโปร่ง และตราทีม */
function TeamRow({
  team,
  index,
  isAdmin,
  tournamentId,
  hasBracket,
  directory,
}: {
  team: TeamEntry;
  index: number;
  isAdmin: boolean;
  tournamentId: string;
  hasBracket: boolean;
  directory: Map<string, UserProfile>;
}) {
  const identity = identityFor(index);
  const ownerId = entryUid(team);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ delay: Math.min(index * 0.04, 0.3) }}
      style={{ ["--st" as string]: identity.rgb }}
      className={`tally tile relative overflow-hidden rounded-xl py-4 pr-4 pl-5 ${
        team.approved ? "" : "opacity-60"
      }`}
    >
      <span className="fig text-outline pointer-events-none absolute top-1 right-3 text-4xl opacity-45 select-none">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="relative flex items-start gap-3">
        {team.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(team.logo) ?? ""}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <Crest
            identity={identity}
            size={36}
            showShort
            className="shrink-0"
            locked={hasBracket && team.approved}
          />
        )}

        <div className="min-w-0 flex-1 pr-8">
          <p className="truncate font-display text-base text-ice">{team.name}</p>
          <p className="num mt-0.5 text-xs text-muted">
            {team.members.length} คน · สมัคร {formatThaiDate(team.registeredAt)}
          </p>
        </div>
      </div>

      {team.members.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {team.members.map((m, i) => (
            <span
              key={`${team.id}-${i}`}
              className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs ${
                i === 0
                  ? "text-iris ring-1 ring-[rgb(var(--accent)/0.4)]"
                  : "tile text-ice/75"
              }`}
              style={i === 0 ? { background: "rgb(var(--accent) / 0.12)" } : undefined}
            >
              {i === 0 && (
                <span
                  className="slug text-[9px] leading-none"
                  title="กัปตัน"
                  aria-label="กัปตัน"
                >
                  C
                </span>
              )}
              {m}
            </span>
          ))}
        </div>
      )}

      {/* ใครเป็นคนส่งใบนี้ — แทนที่บรรทัด "ติดต่อ:" เดิม ซึ่งตอนนี้เป็นทางสำรองข้างใน */}
      <AccountLine
        uid={ownerId}
        profile={ownerId ? (directory.get(ownerId) ?? null) : null}
        isAdmin={isAdmin}
        fallbackContact={team.contact}
        className="mt-3"
      />

      {isAdmin && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-hair pt-3">
          <ApproveToggle
            approved={team.approved}
            onClick={() =>
              tournamentStore.mutate(tournamentId, (t) => ({
                ...t,
                teams: t.teams.map((x) =>
                  x.id === team.id ? { ...x, approved: !x.approved } : x,
                ),
              }))
            }
          />
          <span className="text-xs text-muted">
            {team.approved ? "ผ่านเข้าแข่ง" : "ยังไม่อนุมัติ"}
          </span>
          <span className="flex-1" />
          {/* ลบทีมแล้วสายแข่งหายทั้งอัน จึงต้องกดค้างยืนยัน */}
          <HoldToRemove
            label={`ลบทีม ${team.name}`}
            onDone={() =>
              tournamentStore.mutate(tournamentId, (t) => ({
                ...t,
                teams: t.teams.filter((x) => x.id !== team.id),
                bracket: null,
              }))
            }
          />
        </div>
      )}
    </motion.li>
  );
}

const XMark = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    className={className}
    aria-hidden
  >
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);

/** สวิตช์อนุมัติ — เป็นวัตถุจริงขนาดนิ้วแตะได้ ไม่ใช่ตัวอักษร ✓ ตัวเดียว */
function ApproveToggle({
  approved,
  onClick,
}: {
  approved: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={approved}
      aria-label={approved ? "ยกเลิกการอนุมัติ" : "อนุมัติ"}
      title={approved ? "อนุมัติแล้ว — กดเพื่อยกเลิก" : "กดเพื่ออนุมัติ"}
      className="tile grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full transition-colors"
      style={
        approved
          ? { background: "rgb(var(--st-win) / 0.18)", color: "rgb(var(--st-win))" }
          : undefined
      }
    >
      {approved ? (
        <IconCheck className="h-4 w-4" strokeWidth={2} />
      ) : (
        <span className="block h-3.5 w-3.5 rounded-full text-muted ring-1 ring-current" />
      )}
    </button>
  );
}

/** ลบทันที ใช้กับของที่ลบแล้วไม่กระทบอย่างอื่น */
function RemoveButton({ label, onDone }: { label: string; onDone: () => void }) {
  return (
    <button
      type="button"
      onClick={onDone}
      aria-label={label}
      title={label}
      className="tile grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:text-danger"
    >
      <XMark className="h-3.5 w-3.5" />
    </button>
  );
}

const HOLD_MS = 700;

/** กดค้างเพื่อยืนยัน — วงแหวนไล่เติมรอบปุ่มบอกว่าอีกนานแค่ไหนถึงจะลบจริง */
function HoldToRemove({ label, onDone }: { label: string; onDone: () => void }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const reduced = useReducedMotion();

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const start = () => {
    if (timer.current) return;
    // ผู้ที่ปิดแอนิเมชันไว้จะไม่เห็นวงแหวน จึงไม่ควรบังคับให้กดค้างแบบเดาเวลา
    if (reduced) {
      onDone();
      return;
    }
    setHolding(true);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onDone();
    }, HOLD_MS);
  };

  const cancel = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setHolding(false);
  };

  const r = 15;
  const c = 2 * Math.PI * r;

  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") start();
      }}
      onKeyUp={cancel}
      aria-label={`${label} (กดค้าง)`}
      title={`${label} — กดค้างไว้เพื่อยืนยัน`}
      className="tile relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:text-danger"
    >
      <XMark className="h-3.5 w-3.5" />
      <svg
        viewBox="0 0 36 36"
        className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
        aria-hidden
      >
        {holding && (
          <motion.circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            stroke="var(--color-danger)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: HOLD_MS / 1000, ease: "linear" }}
          />
        )}
      </svg>
    </button>
  );
}
