"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { uid } from "@/lib/random";
import { createBracket, defaultRoundBestOf, roundCount } from "@/lib/tournament/bracket";
import { tournamentStore } from "@/lib/tournament/store";
import { formatThaiDate } from "@/lib/tournament/share";
import type { TeamEntry, Tournament } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { EmptyNote, Input, Label, Textarea } from "./ui";

type Props = { tournament: Tournament; isAdmin: boolean };

export default function TeamsPanel({ tournament, isAdmin }: Props) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [members, setMembers] = useState("");
  const [error, setError] = useState<string | null>(null);

  // อ่านเวลาครั้งเดียวตอน mount พอ ไม่ต้องเดินตามนาฬิกาจริง
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
    tournament.maxTeams > 0 && tournament.teams.length >= tournament.maxTeams;
  const canRegister = !notOpenYet && !closed && !full;

  const addTeam = () => {
    const teamName = name.trim();
    if (!teamName) {
      setError("ใส่ชื่อทีมด้วย");
      return;
    }
    if (
      tournament.teams.some(
        (t) => t.name.toLocaleLowerCase("th") === teamName.toLocaleLowerCase("th"),
      )
    ) {
      setError("ชื่อทีมนี้สมัครไปแล้ว");
      return;
    }
    const list = members
      .split(/[,\n\t;]+/)
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 12);

    const entry: TeamEntry = {
      id: uid(),
      name: teamName,
      members: list,
      contact: contact.trim() || undefined,
      registeredAt: new Date().toISOString(),
      approved: !tournament.adminPin,
    };

    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      teams: [...t.teams, entry],
      status: t.status === "draft" ? "registration" : t.status,
    }));
    setName("");
    setContact("");
    setMembers("");
    setError(null);
  };

  const removeTeam = (id: string) =>
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      teams: t.teams.filter((team) => team.id !== id),
      // ทีมเปลี่ยน สายเดิมใช้ไม่ได้แล้ว
      bracket: null,
    }));

  const toggleApprove = (id: string) =>
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      teams: t.teams.map((team) =>
        team.id === id ? { ...team, approved: !team.approved } : team,
      ),
    }));

  const approved = tournament.teams.filter((t) => t.approved);

  const generate = () => {
    if (approved.length < 2) return;
    const rounds = roundCount(approved.length);
    const bestOf =
      tournament.roundBestOf.length === rounds
        ? tournament.roundBestOf
        : defaultRoundBestOf(rounds);
    const seed = tournamentStore.newSeed();
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      roundBestOf: bestOf,
      bracket: createBracket(approved, seed, bestOf),
      status: "running",
    }));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(320px,380px)_1fr]">
      <Panel className="p-6">
        <h3 className="font-display text-lg font-medium text-ice">สมัครเข้าแข่ง</h3>

        <div className="mt-3 rounded-xl tile px-4 py-3 text-xs text-muted">
          {notOpenYet && (
            <>ยังไม่เปิดรับสมัคร — เปิด {formatThaiDate(tournament.registerOpenAt)}</>
          )}
          {!notOpenYet && closed && (
            <>ปิดรับสมัครแล้วเมื่อ {formatThaiDate(tournament.registerCloseAt)}</>
          )}
          {!notOpenYet && !closed && full && <>รับครบ {tournament.maxTeams} ทีมแล้ว</>}
          {canRegister && (
            <>
              เปิดรับสมัครอยู่
              {tournament.registerCloseAt && (
                <> · ปิด {formatThaiDate(tournament.registerCloseAt)}</>
              )}
              <br />
              รับ {tournament.maxTeams || "ไม่จำกัด"} ทีม · ทีมละ {tournament.teamSize} คน
            </>
          )}
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <Label>ชื่อทีม</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น Rainmaker"
              disabled={!canRegister}
              maxLength={40}
            />
          </div>
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
          <Button onClick={addTeam} disabled={!canRegister} className="w-full">
            สมัครทีมนี้
          </Button>
          <p className="text-xs text-muted">
            หมายเหตุ: เว็บนี้ไม่มีเซิร์ฟเวอร์ ทีมที่สมัครจะถูกเก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น
            ถ้าจะให้คนอื่นสมัครเองจากเครื่องตัวเองได้ ต้องมีหลังบ้าน
          </p>
        </div>
      </Panel>

      <div className="space-y-5">
        <Panel className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-lg font-medium text-ice">
              ทีมที่สมัคร{" "}
              <span className="text-muted">
                ({approved.length} ผ่าน / {tournament.teams.length} ทั้งหมด)
              </span>
            </h3>
            {isAdmin && (
              <Button
                onClick={generate}
                disabled={approved.length < 2}
                variant={tournament.bracket ? "outline" : "primary"}
              >
                {tournament.bracket ? "สุ่มสายใหม่" : "สุ่มสายแข่ง"}
              </Button>
            )}
          </div>

          {tournament.teams.length === 0 ? (
            <EmptyNote>ยังไม่มีทีมสมัคร</EmptyNote>
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
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-[10px] tracking-luxe text-muted uppercase">
                          #{String(index + 1).padStart(2, "0")}
                        </p>
                        <p className="mt-1 truncate font-display text-base text-ice">
                          {team.name}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => toggleApprove(team.id)}
                            title={team.approved ? "ถอนการอนุมัติ" : "อนุมัติ"}
                            className="cursor-pointer rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-champagne"
                          >
                            {team.approved ? "✓" : "○"}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeTeam(team.id)}
                            title="ลบทีม"
                            className="cursor-pointer rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:text-[#e79a9a]"
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
                    {team.contact && (
                      <p className="mt-2.5 text-xs text-muted">ติดต่อ: {team.contact}</p>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>

        {isAdmin && approved.length >= 2 && (
          <p className="text-xs text-muted">
            สุ่มสายจะใช้เฉพาะทีมที่อนุมัติแล้ว ({approved.length} ทีม) — ถ้าจำนวนไม่ใช่ 2, 4,
            8, 16 ระบบจะเติมบาย (BYE) ให้อัตโนมัติ
          </p>
        )}
      </div>
    </div>
  );
}
