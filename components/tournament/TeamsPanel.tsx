"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { compressImage } from "@/lib/image";
import { rngFromSeed, shuffle, uid } from "@/lib/random";
import { LANES as GAME_LANES, identityFor, laneByLabel } from "@/lib/game";
import { safeImageSrc } from "@/lib/safe";
import { createBracket, defaultRoundBestOf, roundCount } from "@/lib/tournament/bracket";
import { tournamentStore } from "@/lib/tournament/store";
import { formatThaiDate } from "@/lib/tournament/share";
import type { SoloEntry, TeamEntry, Tournament } from "@/lib/tournament/types";
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
};

/** ตัวเลือกตำแหน่ง ดึงจากรายการกลาง เพื่อไม่ให้ป้ายเพี้ยนกับไอคอนที่ใช้แสดงผล */
const LANE_OPTIONS = [...GAME_LANES.map((l) => l.label), "ไม่ระบุ"];

export default function TeamsPanel({ tournament, isAdmin, onGenerated }: Props) {
  const solo = tournament.entryMode === "solo";

  const [name, setName] = useState("");
  const [ign, setIgn] = useState("");
  const [lane, setLane] = useState("ไม่ระบุ");
  const [contact, setContact] = useState("");
  const [members, setMembers] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [now] = useState(() => Date.now());
  const opensAt = tournament.registerOpenAt
    ? new Date(tournament.registerOpenAt).getTime()
    : null;
  const closesAt = tournament.registerCloseAt
    ? new Date(tournament.registerCloseAt).getTime()
    : null;
  const notOpenYet = opensAt !== null && now < opensAt;
  const closed = closesAt !== null && now > closesAt;
  const full =
    !solo && tournament.maxTeams > 0 && tournament.teams.length >= tournament.maxTeams;
  const canRegister = !notOpenYet && !closed && !full;

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
      approved: !tournament.adminPin,
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
      approved: !tournament.adminPin,
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
  };

  /** สุ่มแบ่งผู้สมัครเดี่ยวเป็นทีม */
  const shuffleIntoTeams = () => {
    const pool = tournament.soloPlayers.filter((p) => p.approved);
    if (pool.length < 2) return;
    const seed = tournamentStore.newSeed();
    const order = shuffle(pool, rngFromSeed(`${seed}::solo`));
    const size = Math.max(1, tournament.teamSize);
    const teams: TeamEntry[] = [];

    for (let i = 0; i < order.length; i += size) {
      const chunk = order.slice(i, i + size);
      const identity = identityFor(teams.length);
      teams.push({
        id: uid(),
        name: identity.name,
        members: chunk.map((p) => p.ign || p.name),
        registeredAt: new Date().toISOString(),
        approved: true,
      });
    }

    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      teams,
      bracket: null,
    }));
    recordActivity(
      "bracket.generate",
      `สุ่มแบ่ง ${pool.length} คนเป็น ${teams.length} ทีม (seed ${seed})`,
      { tournamentId: tournament.id, tournamentName: tournament.name },
    );
    toast(`แบ่งเป็น ${teams.length} ทีมแล้ว`, "success");
  };

  const approvedTeams = tournament.teams.filter((t) => t.approved);
  const approvedSolo = tournament.soloPlayers.filter((p) => p.approved);

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

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,380px)_1fr]">
      {/* ---------- ฟอร์มสมัคร ---------- */}
      <Panel className="p-6">
        <Panel.Header
          eyebrow="Registration"
          title={solo ? "สมัครรายบุคคล" : "สมัครเข้าแข่ง (มาเป็นทีม)"}
        />

        <RegisterStatus
          notOpenYet={notOpenYet}
          closed={closed}
          full={full}
          canRegister={canRegister}
          tournament={tournament}
          solo={solo}
        />

        <div className="mt-5 space-y-4">
          <div>
            <Label>{solo ? "ชื่อ" : "ชื่อทีม"}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={solo ? "ชื่อเล่น" : "เช่น Rainmaker"}
              disabled={!canRegister}
              maxLength={40}
            />
          </div>

          {solo ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>ชื่อในเกม</Label>
                <Input
                  value={ign}
                  onChange={(e) => setIgn(e.target.value)}
                  placeholder="IGN"
                  disabled={!canRegister}
                  maxLength={30}
                />
              </div>
              <div>
                <Label>เลนที่ถนัด</Label>
                <select
                  value={lane}
                  onChange={(e) => setLane(e.target.value)}
                  disabled={!canRegister}
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
                rows={5}
                value={members}
                onChange={(e) => setMembers(e.target.value)}
                placeholder={"ก้อง\nเบียร์\nปอนด์"}
                disabled={!canRegister}
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
                  <Crest identity={identityFor(tournament.teams.length)} size={34} />
                </div>
              )}
              <div className="space-y-1.5">
                <label
                  className={`hover-tile tile inline-block rounded-lg px-3 py-2 text-xs text-ice/80 transition-colors ${
                    canRegister ? "cursor-pointer" : "cursor-not-allowed opacity-40"
                  }`}
                >
                  เลือกรูป
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!canRegister}
                    onChange={(e) => void pickImage(e.target.files?.[0])}
                  />
                </label>
                {image && (
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    className="block cursor-pointer text-xs text-muted transition-colors hover:text-[#e79a9a]"
                  >
                    เอาออก
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <Label>ช่องทางติดต่อ (ไม่ใส่ก็ได้)</Label>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="ไอดีไลน์ / เบอร์ / @tiktok"
              disabled={!canRegister}
              maxLength={60}
            />
          </div>

          {error && <p className="text-xs text-[#e79a9a]">{error}</p>}

          <Button
            onClick={solo ? addSolo : addTeam}
            disabled={!canRegister}
            className="w-full"
          >
            {solo ? "สมัครเลย" : "สมัครทีมนี้"}
          </Button>
        </div>
      </Panel>

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
                    onClick={shuffleIntoTeams}
                    disabled={approvedSolo.length < 2}
                  >
                    {tournament.teams.length ? "สุ่มแบ่งทีมใหม่" : "สุ่มแบ่งทีม"}
                  </Button>
                ) : undefined
              }
            />

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

          {tournament.teams.length === 0 ? (
            <EmptyState
              art={<ArtShield />}
              title={solo ? "ยังไม่ได้สุ่มแบ่งทีม" : "ยังไม่มีทีมสมัคร"}
              description={
                solo
                  ? "รับสมัครรายบุคคลให้ครบก่อน แล้วกด “สุ่มแบ่งทีม” ระบบจะแบ่งให้ตามขนาดทีมที่ตั้งไว้"
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

/** แถบบอกว่าเปิด/ปิดรับสมัครอยู่ ใช้สีสถานะแทนตัวหนังสือล้วน */
function RegisterStatus({
  notOpenYet,
  closed,
  full,
  canRegister,
  tournament,
  solo,
}: {
  notOpenYet: boolean;
  closed: boolean;
  full: boolean;
  canRegister: boolean;
  tournament: Tournament;
  solo: boolean;
}) {
  const badge = canRegister
    ? { label: "เปิดรับสมัคร", rgb: "77 181 145", tone: "live" as const }
    : notOpenYet
      ? { label: "ยังไม่เปิด", rgb: "230 200 148", tone: "plain" as const }
      : closed
        ? { label: "ปิดรับแล้ว", rgb: "146 151 172", tone: "plain" as const }
        : { label: "รับครบแล้ว", rgb: "221 175 100", tone: "done" as const };

  return (
    <div className="sunken rounded-xl px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge rgb={badge.rgb} tone={badge.tone}>
          {badge.label}
        </Badge>
        {tournament.maxTeams > 0 && !solo && (
          <span className="num text-xs text-muted">
            {tournament.teams.length}/{tournament.maxTeams} ทีม
          </span>
        )}
      </div>
      <p className="mt-2.5 text-xs leading-relaxed text-muted">
        {notOpenYet && <>เปิด {formatThaiDate(tournament.registerOpenAt)}</>}
        {!notOpenYet && closed && <>ปิดไปเมื่อ {formatThaiDate(tournament.registerCloseAt)}</>}
        {!notOpenYet && !closed && full && <>รับครบ {tournament.maxTeams} ทีมแล้ว</>}
        {canRegister && (
          <>
            {tournament.registerCloseAt && (
              <>ปิดรับ {formatThaiDate(tournament.registerCloseAt)} · </>
            )}
            {solo
              ? `สมัครคนเดียวได้เลย ผู้จัดจะสุ่มแบ่งทีมละ ${tournament.teamSize} คนให้ทีหลัง`
              : `รับ ${tournament.maxTeams || "ไม่จำกัด"} ทีม · ทีมละ ${tournament.teamSize} คน`}
          </>
        )}
      </p>
    </div>
  );
}

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
      <span className={enough ? "text-champagne" : "text-ice"}>{count}</span>/{size} คน
      {!enough && <span className="ml-1">— ยังขาด {size - count}</span>}
    </p>
  );
}

/** แถวผู้สมัครเดี่ยว */
function SoloRow({
  player,
  index,
  isAdmin,
  tournamentId,
}: {
  player: SoloEntry;
  index: number;
  isAdmin: boolean;
  tournamentId: string;
}) {
  const laneMeta = laneByLabel(player.lane);
  const LaneIcon = laneMeta ? LANE_ICON[laneMeta.key] : null;

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
        <span className="sunken grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm text-champagne ring-1 ring-[rgb(var(--accent)/0.28)]">
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
}: {
  team: TeamEntry;
  index: number;
  isAdmin: boolean;
  tournamentId: string;
  hasBracket: boolean;
}) {
  const identity = identityFor(index);

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
                  ? "text-champagne ring-1 ring-[rgb(var(--accent)/0.4)]"
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

      {team.contact && isAdmin && (
        <p className="mt-2.5 text-xs text-muted">ติดต่อ: {team.contact}</p>
      )}

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
      className="tile grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:text-[#e79a9a]"
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
      className="tile relative grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:text-[#e79a9a]"
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
            stroke="#e79a9a"
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
