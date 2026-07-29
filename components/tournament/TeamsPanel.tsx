"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { recordActivity } from "@/lib/activity";
import { compressImage } from "@/lib/image";
import { rngFromSeed, shuffle, uid } from "@/lib/random";
import { identityFor } from "@/lib/rov";
import { safeImageSrc } from "@/lib/safe";
import { createBracket, defaultRoundBestOf, roundCount } from "@/lib/tournament/bracket";
import { tournamentStore } from "@/lib/tournament/store";
import { formatThaiDate } from "@/lib/tournament/share";
import type { SoloEntry, TeamEntry, Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { EmptyNote, Input, Label, Textarea } from "./ui";

type Props = { tournament: Tournament; isAdmin: boolean };

const LANES = ["ดาบ", "ป่า", "กลาง", "ท้าย", "ซัพ", "ไม่ระบุ"];

export default function TeamsPanel({ tournament, isAdmin }: Props) {
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
  };

  const approvedTeams = tournament.teams.filter((t) => t.approved);

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
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,380px)_1fr]">
      {/* ฟอร์มสมัคร */}
      <Panel className="p-6">
        <h3 className="font-display text-lg font-medium text-ice">
          {solo ? "สมัครรายบุคคล" : "สมัครเข้าแข่ง (มาเป็นทีม)"}
        </h3>

        <div className="mt-3 rounded-xl tile px-4 py-3 text-xs text-muted">
          {notOpenYet && <>ยังไม่เปิดรับสมัคร — เปิด {formatThaiDate(tournament.registerOpenAt)}</>}
          {!notOpenYet && closed && <>ปิดรับสมัครแล้ว {formatThaiDate(tournament.registerCloseAt)}</>}
          {!notOpenYet && !closed && full && <>รับครบ {tournament.maxTeams} ทีมแล้ว</>}
          {canRegister && (
            <>
              เปิดรับสมัครอยู่
              {tournament.registerCloseAt && <> · ปิด {formatThaiDate(tournament.registerCloseAt)}</>}
              <br />
              {solo
                ? `สมัครคนเดียวได้เลย ผู้จัดจะสุ่มแบ่งทีมละ ${tournament.teamSize} คนให้ทีหลัง`
                : `รับ ${tournament.maxTeams || "ไม่จำกัด"} ทีม · ทีมละ ${tournament.teamSize} คน`}
            </>
          )}
        </div>

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
            <>
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
                    {LANES.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
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
                <div className="grid h-16 w-16 place-items-center rounded-xl tile-dashed text-xs text-muted">
                  —
                </div>
              )}
              <div className="space-y-1.5">
                <label
                  className={`inline-block rounded-lg tile px-3 py-2 text-xs text-ice/80 transition-colors hover-tile ${
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

      {/* รายชื่อ */}
      <div className="space-y-5">
        {solo && (
          <Panel className="p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-lg font-medium text-ice">
                ผู้สมัคร{" "}
                <span className="text-muted">({tournament.soloPlayers.length} คน)</span>
              </h3>
              {isAdmin && (
                <Button
                  variant={tournament.teams.length ? "outline" : "primary"}
                  onClick={shuffleIntoTeams}
                  disabled={tournament.soloPlayers.filter((p) => p.approved).length < 2}
                >
                  {tournament.teams.length ? "สุ่มแบ่งทีมใหม่" : "สุ่มแบ่งทีม"}
                </Button>
              )}
            </div>

            {tournament.soloPlayers.length === 0 ? (
              <EmptyNote>ยังไม่มีคนสมัคร</EmptyNote>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                <AnimatePresence initial={false}>
                  {tournament.soloPlayers.map((p, i) => (
                    <motion.li
                      key={p.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      className={`flex items-center gap-3 rounded-xl tile p-3 ${
                        p.approved ? "" : "opacity-60"
                      }`}
                    >
                      {p.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={safeImageSrc(p.avatar) ?? ""}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-champagne/12 font-display text-sm text-champagne">
                          {p.name.slice(0, 1)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ice">
                          <span className="mr-1.5 font-display text-[11px] text-muted tabular-nums">
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {p.ign ? `${p.ign} · ` : ""}
                          {p.lane ?? "ไม่ระบุเลน"}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              tournamentStore.mutate(tournament.id, (t) => ({
                                ...t,
                                soloPlayers: t.soloPlayers.map((x) =>
                                  x.id === p.id ? { ...x, approved: !x.approved } : x,
                                ),
                              }))
                            }
                            className="cursor-pointer px-1.5 text-xs text-muted transition-colors hover:text-champagne"
                          >
                            {p.approved ? "✓" : "○"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              tournamentStore.mutate(tournament.id, (t) => ({
                                ...t,
                                soloPlayers: t.soloPlayers.filter((x) => x.id !== p.id),
                              }))
                            }
                            className="cursor-pointer px-1.5 text-xs text-muted transition-colors hover:text-[#e79a9a]"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Panel>
        )}

        <Panel className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-medium text-ice">
              ทีม{" "}
              <span className="text-muted">
                ({approvedTeams.length} ผ่าน / {tournament.teams.length} ทั้งหมด)
              </span>
            </h3>
            {isAdmin && (
              <Button
                onClick={generateBracket}
                disabled={approvedTeams.length < 2}
                variant={tournament.bracket ? "outline" : "primary"}
              >
                {tournament.bracket ? "สุ่มสายใหม่" : "สุ่มสายแข่ง"}
              </Button>
            )}
          </div>

          {tournament.teams.length === 0 ? (
            <EmptyNote>
              {solo ? "ยังไม่ได้สุ่มแบ่งทีม" : "ยังไม่มีทีมสมัคร"}
            </EmptyNote>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence initial={false}>
                {tournament.teams.map((team, index) => (
                  <motion.li
                    key={team.id}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`rounded-xl tile p-4 ${team.approved ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-start gap-3">
                      {team.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={safeImageSrc(team.logo) ?? ""}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm"
                          style={{
                            color: identityFor(index).hex,
                            background: `rgb(${identityFor(index).rgb} / 0.12)`,
                          }}
                        >
                          {identityFor(index).glyph}
                        </span>
                      )}

                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[10px] tracking-luxe text-muted uppercase">
                          #{String(index + 1).padStart(2, "0")}
                        </p>
                        <p className="truncate font-display text-base text-ice">
                          {team.name}
                        </p>
                      </div>

                      {isAdmin && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              tournamentStore.mutate(tournament.id, (t) => ({
                                ...t,
                                teams: t.teams.map((x) =>
                                  x.id === team.id ? { ...x, approved: !x.approved } : x,
                                ),
                              }))
                            }
                            className="cursor-pointer px-1.5 text-xs text-muted transition-colors hover:text-champagne"
                          >
                            {team.approved ? "✓" : "○"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              tournamentStore.mutate(tournament.id, (t) => ({
                                ...t,
                                teams: t.teams.filter((x) => x.id !== team.id),
                                bracket: null,
                              }))
                            }
                            className="cursor-pointer px-1.5 text-xs text-muted transition-colors hover:text-[#e79a9a]"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    {team.members.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {team.members.map((m, i) => (
                          <span
                            key={`${team.id}-${i}`}
                            className="rounded-md border border-hair px-2 py-0.5 text-xs text-ice/75"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                    {team.contact && isAdmin && (
                      <p className="mt-2.5 text-xs text-muted">ติดต่อ: {team.contact}</p>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
