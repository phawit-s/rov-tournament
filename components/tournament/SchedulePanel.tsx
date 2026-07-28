"use client";

import { matchesByRound, roundLabel, updateMatch } from "@/lib/tournament/bracket";
import { tournamentStore } from "@/lib/tournament/store";
import { formatThaiDate } from "@/lib/tournament/share";
import type { Tournament } from "@/lib/tournament/types";
import Panel from "../ui/Panel";
import { EmptyNote, Input, fromLocalInput, toLocalInput } from "./ui";

type Props = { tournament: Tournament; isAdmin: boolean };

/** ตารางแข่ง — ตั้งเวลาและลิงก์ไลฟ์รายแมตช์ */
export default function SchedulePanel({ tournament, isAdmin }: Props) {
  const bracket = tournament.bracket;
  if (!bracket) {
    return <EmptyNote>ยังไม่ได้จัดสาย เลยยังไม่มีตารางแข่ง</EmptyNote>;
  }

  const nameOf = (id: string | null) =>
    id ? (tournament.teams.find((t) => t.id === id)?.name ?? "—") : "รอผู้ชนะ";

  const rounds = matchesByRound(bracket);

  const patch = (
    matchId: string,
    value: Partial<{ scheduledAt: string; streamUrl: string }>,
  ) =>
    tournamentStore.mutate(tournament.id, (t) => ({
      ...t,
      bracket: t.bracket ? updateMatch(t.bracket, matchId, value) : null,
    }));

  const all = rounds.flat().filter((m) => !m.bye);
  const upcoming = all
    .filter((m) => m.scheduledAt && !m.winnerId)
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  return (
    <div className="space-y-5">
      {upcoming.length > 0 && (
        <Panel accent="109 146 219" className="p-5">
          <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
            Next up
          </p>
          <p className="mt-2 text-sm text-ice">
            {nameOf(upcoming[0].a.teamId)} พบ {nameOf(upcoming[0].b.teamId)} ·{" "}
            <span className="text-champagne">
              {formatThaiDate(upcoming[0].scheduledAt)}
            </span>
          </p>
        </Panel>
      )}

      {rounds.map((matches, i) => {
        const round = i + 1;
        const playable = matches.filter((m) => !m.bye);
        if (playable.length === 0) return null;
        return (
          <Panel key={round} className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-hair px-5 py-3.5">
              <h3 className="font-display text-sm text-ice">
                {roundLabel(round, bracket.rounds)}
              </h3>
              <span className="font-display text-xs text-champagne">
                BO{matches[0]?.bestOf}
              </span>
            </div>

            <ul className="divide-y divide-[rgb(var(--hair)/var(--hair-a))]">
              {playable.map((match, idx) => (
                <li
                  key={match.id}
                  className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-display text-[10px] tracking-luxe text-muted uppercase">
                      Match {idx + 1}
                    </p>
                    <p className="mt-1 truncate text-sm text-ice">
                      {nameOf(match.a.teamId)}{" "}
                      <span className="text-muted">พบ</span>{" "}
                      {nameOf(match.b.teamId)}
                      {match.winnerId && (
                        <span className="ml-2 font-display text-xs text-champagne">
                          {match.a.score}–{match.b.score}
                        </span>
                      )}
                    </p>
                  </div>

                  {isAdmin ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="datetime-local"
                        value={toLocalInput(match.scheduledAt)}
                        onChange={(e) =>
                          patch(match.id, {
                            scheduledAt: fromLocalInput(e.target.value) ?? "",
                          })
                        }
                        className="w-52"
                      />
                      <Input
                        value={match.streamUrl ?? ""}
                        onChange={(e) =>
                          patch(match.id, { streamUrl: e.target.value.trim() })
                        }
                        placeholder="ลิงก์ไลฟ์แมตช์นี้"
                        className="w-56"
                      />
                    </div>
                  ) : (
                    <div className="text-right text-xs text-muted">
                      {match.scheduledAt ? formatThaiDate(match.scheduledAt) : "ยังไม่กำหนดเวลา"}
                      {match.streamUrl && (
                        <>
                          {" · "}
                          <a
                            href={match.streamUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-champagne underline-offset-2 hover:underline"
                          >
                            ดูไลฟ์
                          </a>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}
