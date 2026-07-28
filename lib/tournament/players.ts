import { standings } from "./bracket";
import type { PlayerRecord, Tournament } from "./types";

/**
 * รวบสถิติผู้เล่นจากทุกทัวร์ที่เก็บไว้ในเครื่อง
 * ใช้ "ชื่อ" เป็นตัวระบุตัวตน เพราะยังไม่มีระบบบัญชีจริง
 */
export function buildPlayerRecords(tournaments: Tournament[]): PlayerRecord[] {
  const byName = new Map<string, PlayerRecord>();

  const ensure = (name: string): PlayerRecord => {
    const key = name.trim();
    let rec = byName.get(key);
    if (!rec) {
      rec = {
        name: key,
        tournaments: [],
        matchesPlayed: 0,
        matchesWon: 0,
        gamesWon: 0,
        gamesLost: 0,
        titles: 0,
      };
      byName.set(key, rec);
    }
    return rec;
  };

  for (const tournament of tournaments) {
    const places = new Map(
      standings(tournament).map((row) => [row.team.id, row.placement]),
    );

    for (const team of tournament.teams) {
      const placement = places.get(team.id) ?? null;
      for (const member of team.members) {
        if (!member.trim()) continue;
        const rec = ensure(member);
        rec.tournaments.push({
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          teamName: team.name,
          placement: placement && placement > 0 ? placement : null,
          status: tournament.status,
        });
        if (placement === 1) rec.titles += 1;
      }
    }

    if (!tournament.bracket) continue;

    for (const match of tournament.bracket.matches) {
      if (match.bye) continue;
      if (!match.a.teamId || !match.b.teamId) continue;

      for (const [self, other] of [
        [match.a, match.b],
        [match.b, match.a],
      ] as const) {
        const team = tournament.teams.find((t) => t.id === self.teamId);
        if (!team) continue;
        for (const member of team.members) {
          if (!member.trim()) continue;
          const rec = ensure(member);
          rec.gamesWon += self.score;
          rec.gamesLost += other.score;
          if (match.winnerId) {
            rec.matchesPlayed += 1;
            if (match.winnerId === self.teamId) rec.matchesWon += 1;
          }
        }
      }
    }
  }

  return [...byName.values()].sort(
    (a, b) =>
      b.titles - a.titles ||
      b.matchesWon - a.matchesWon ||
      a.name.localeCompare(b.name, "th"),
  );
}

export function winRate(rec: PlayerRecord): number {
  if (!rec.matchesPlayed) return 0;
  return Math.round((rec.matchesWon / rec.matchesPlayed) * 100);
}
