import { rngFromSeed, shuffle, uid } from "@/lib/random";
import type { BestOf, Bracket, Match, TeamEntry, Tournament } from "./types";

/** จำนวนเกมที่ต้องชนะถึงจะจบแมตช์ */
export function winsNeeded(bestOf: BestOf): number {
  return Math.ceil(bestOf / 2);
}

export const BEST_OF_OPTIONS: BestOf[] = [1, 3, 5, 7];

/** ปัดขึ้นเป็นกำลังสองที่ใกล้ที่สุด เช่น 6 ทีม -> สาย 8 (มี 2 BYE) */
export function bracketSize(teamCount: number): number {
  let size = 1;
  while (size < teamCount) size *= 2;
  return Math.max(size, 2);
}

export function roundCount(teamCount: number): number {
  return Math.log2(bracketSize(teamCount));
}

/** ชื่อรอบภาษาไทย นับถอยหลังจากรอบชิง (รอบสุดท้าย = ชิงชนะเลิศ) */
export function roundLabel(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round + 1;
  if (fromEnd === 1) return "ชิงชนะเลิศ";
  if (fromEnd === 2) return "รองชนะเลิศ";
  if (fromEnd === 3) return "รอบ 8 ทีม";
  if (fromEnd === 4) return "รอบ 16 ทีม";
  if (fromEnd === 5) return "รอบ 32 ทีม";
  return `รอบที่ ${round}`;
}

/** BO เริ่มต้น: รอบแรกๆ BO3, รองชนะเลิศ BO5, ชิง BO7 */
export function defaultRoundBestOf(rounds: number): BestOf[] {
  return Array.from({ length: rounds }, (_, i) => {
    const fromEnd = rounds - i;
    if (fromEnd === 1) return 7;
    if (fromEnd === 2) return 5;
    return 3;
  });
}

/**
 * สร้างสายแพ้คัดออก สุ่มคู่ด้วย seed (ใส่ seed เดิม + ทีมชุดเดิม = สายเดิมเสมอ)
 * ทีมที่ได้ BYE จะผ่านเข้ารอบสองอัตโนมัติ
 */
export function createBracket(
  teams: TeamEntry[],
  seed: string,
  roundBestOf: BestOf[],
): Bracket {
  const size = bracketSize(teams.length);
  const rounds = Math.log2(size);
  const order = shuffle(teams, rngFromSeed(`${seed}::bracket`));

  const matchCount = size / 2;
  // กระจาย BYE ให้ไปคู่กับทีมจริงเสมอ ไม่ให้เกิดแมตช์ที่ว่างทั้งคู่
  const byes = size - order.length;

  const matches: Match[] = [];

  // รอบแรก
  const firstRoundIds: string[] = [];
  let cursor = 0;
  for (let i = 0; i < matchCount; i++) {
    const a: TeamEntry | null = order[cursor++] ?? null;
    const b: TeamEntry | null = i < byes ? null : (order[cursor++] ?? null);
    const id = `m${uid()}`;
    firstRoundIds.push(id);
    const bye = !a || !b;
    matches.push({
      id,
      round: 1,
      order: i,
      bestOf: roundBestOf[0] ?? 3,
      a: { teamId: a?.id ?? null, score: 0 },
      b: { teamId: b?.id ?? null, score: 0 },
      winnerId: bye ? (a?.id ?? b?.id ?? null) : null,
      bye,
    });
  }

  // รอบถัดๆ ไป ผูกกับผู้ชนะของรอบก่อนหน้า
  let prevIds = firstRoundIds;
  for (let round = 2; round <= rounds; round++) {
    const ids: string[] = [];
    for (let i = 0; i < prevIds.length / 2; i++) {
      const id = `m${uid()}`;
      ids.push(id);
      matches.push({
        id,
        round,
        order: i,
        bestOf: roundBestOf[round - 1] ?? 3,
        a: { teamId: null, score: 0, fromMatch: prevIds[i * 2] },
        b: { teamId: null, score: 0, fromMatch: prevIds[i * 2 + 1] },
        winnerId: null,
        bye: false,
      });
    }
    prevIds = ids;
  }

  const bracket: Bracket = {
    rounds,
    matches,
    seed,
    createdAt: new Date().toISOString(),
  };

  return propagate(bracket);
}

/**
 * ดันผู้ชนะของทุกแมตช์เข้ารอบถัดไป และเคลียร์ค่าที่ไม่ควรค้าง
 * เรียกทุกครั้งหลังแก้ผล เพื่อให้สายสอดคล้องกันเสมอ
 */
export function propagate(bracket: Bracket): Bracket {
  const byId = new Map(bracket.matches.map((m) => [m.id, m]));
  const matches = bracket.matches.map((m) => ({
    ...m,
    a: { ...m.a },
    b: { ...m.b },
  }));

  for (const match of matches.sort((x, y) => x.round - y.round || x.order - y.order)) {
    // ดึงผู้ชนะจากแมตช์ต้นทาง
    for (const side of ["a", "b"] as const) {
      const from = match[side].fromMatch;
      if (!from) continue;
      const src = matches.find((m) => m.id === from) ?? byId.get(from);
      const incoming = src?.winnerId ?? null;
      if (match[side].teamId !== incoming) {
        match[side].teamId = incoming;
        match[side].score = 0;
        match.winnerId = null;
      }
    }

    // BYE: ฝั่งเดียวมีทีม -> ผ่านเลย
    const hasA = !!match.a.teamId;
    const hasB = !!match.b.teamId;
    if (hasA !== hasB) {
      match.bye = true;
      match.winnerId = match.a.teamId ?? match.b.teamId;
    } else if (!hasA && !hasB) {
      match.bye = false;
      match.winnerId = null;
    } else {
      match.bye = false;
      const need = winsNeeded(match.bestOf);
      if (match.a.score >= need) match.winnerId = match.a.teamId;
      else if (match.b.score >= need) match.winnerId = match.b.teamId;
      else match.winnerId = null;
    }
  }

  return { ...bracket, matches };
}

/** บันทึกผลแมตช์ แล้วดันผู้ชนะต่อให้เอง */
export function setMatchScore(
  bracket: Bracket,
  matchId: string,
  scoreA: number,
  scoreB: number,
): Bracket {
  const matches = bracket.matches.map((m) => {
    if (m.id !== matchId) return m;
    const need = winsNeeded(m.bestOf);
    const a = clampScore(scoreA, need);
    const b = clampScore(scoreB, need);
    return { ...m, a: { ...m.a, score: a }, b: { ...m.b, score: b } };
  });
  return propagate({ ...bracket, matches });
}

/** เปลี่ยน BO ของทั้งรอบ */
export function setRoundBestOf(
  bracket: Bracket,
  round: number,
  bestOf: BestOf,
): Bracket {
  const need = winsNeeded(bestOf);
  const matches = bracket.matches.map((m) =>
    m.round === round
      ? {
          ...m,
          bestOf,
          a: { ...m.a, score: Math.min(m.a.score, need) },
          b: { ...m.b, score: Math.min(m.b.score, need) },
        }
      : m,
  );
  return propagate({ ...bracket, matches });
}

export function updateMatch(
  bracket: Bracket,
  matchId: string,
  patch: Partial<Pick<Match, "scheduledAt" | "streamUrl" | "note" | "bestOf">>,
): Bracket {
  const matches = bracket.matches.map((m) =>
    m.id === matchId ? { ...m, ...patch } : m,
  );
  return propagate({ ...bracket, matches });
}

function clampScore(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), max);
}

export function matchesByRound(bracket: Bracket): Match[][] {
  return Array.from({ length: bracket.rounds }, (_, i) =>
    bracket.matches
      .filter((m) => m.round === i + 1)
      .sort((a, b) => a.order - b.order),
  );
}

export function championId(bracket: Bracket | null): string | null {
  if (!bracket) return null;
  const final = bracket.matches.find((m) => m.round === bracket.rounds);
  return final?.winnerId ?? null;
}

export function runnerUpId(bracket: Bracket | null): string | null {
  if (!bracket) return null;
  const final = bracket.matches.find((m) => m.round === bracket.rounds);
  if (!final?.winnerId) return null;
  const loser =
    final.a.teamId === final.winnerId ? final.b.teamId : final.a.teamId;
  return loser;
}

/**
 * อันดับของทุกทีม — แพ้รอบยิ่งลึกยิ่งอันดับดี
 * ทีมที่ตกรอบเดียวกันถือว่าอันดับเท่ากัน (เช่น แพ้รองชนะเลิศ = อันดับ 3 ร่วม)
 */
export function standings(
  tournament: Tournament,
): { team: TeamEntry; placement: number; exitRound: number }[] {
  const { bracket, teams } = tournament;
  if (!bracket) return teams.map((team) => ({ team, placement: 0, exitRound: 0 }));

  const exit = new Map<string, number>();
  for (const match of bracket.matches) {
    if (!match.winnerId) continue;
    for (const side of [match.a, match.b]) {
      if (side.teamId && side.teamId !== match.winnerId) {
        exit.set(side.teamId, match.round);
      }
    }
  }

  const champion = championId(bracket);
  const rows = teams.map((team) => ({
    team,
    exitRound: team.id === champion ? bracket.rounds + 1 : (exit.get(team.id) ?? 0),
  }));

  rows.sort((a, b) => b.exitRound - a.exitRound);

  let placement = 0;
  let lastExit = Number.NaN;
  let seen = 0;
  return rows.map((row) => {
    seen += 1;
    if (row.exitRound !== lastExit) {
      placement = seen;
      lastExit = row.exitRound;
    }
    return { ...row, placement: row.exitRound === 0 ? 0 : placement };
  });
}
