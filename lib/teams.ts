import { identityFor } from "./rov";
import { rngFromSeed, shuffle } from "./random";
import { LANES } from "./rov";
import type {
  BuiltTeam,
  Config,
  Member,
  Player,
  Slot,
  TeamPlan,
} from "./types";

export const MIN_PER_TEAM = 1;
export const MAX_PER_TEAM = 10;
export const MAX_TEAMS = 12;

/**
 * คำนวณว่าจะได้กี่ทีม ทีมละกี่คน และเหลือตัวสำรองกี่คน
 * แล้วกางออกเป็น "ช่องนั่ง" ตามลำดับที่จะถูกเรียกจับสลาก
 */
export function planTeams(total: number, config: Config): TeamPlan {
  const empty: TeamPlan = { sizes: [], benchCount: 0, slots: [] };
  if (total <= 0) return empty;

  let sizes: number[] = [];
  let benchCount = 0;

  if (config.sizeMode === "perTeam") {
    const per = clamp(config.perTeam, MIN_PER_TEAM, MAX_PER_TEAM);
    const fullTeams = Math.floor(total / per);
    const remainder = total - fullTeams * per;

    if (fullTeams === 0) {
      // คนน้อยกว่าขนาดทีม -> ยัดเป็นทีมเดียว
      sizes = [total];
    } else if (remainder === 0) {
      sizes = Array(fullTeams).fill(per);
    } else if (config.remainderMode === "extraTeam") {
      sizes = [...Array(fullTeams).fill(per), remainder];
    } else if (config.remainderMode === "balance") {
      sizes = Array(fullTeams).fill(per);
      for (let i = 0; i < remainder; i++) sizes[i % fullTeams] += 1;
    } else {
      sizes = Array(fullTeams).fill(per);
      benchCount = remainder;
    }
  } else {
    const count = clamp(config.teamCount, 1, Math.min(MAX_TEAMS, Math.max(1, total)));
    const base = Math.floor(total / count);
    const remainder = total % count;
    sizes = Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
    // ถ้าคนน้อยกว่าจำนวนทีมจะมีทีมว่าง ตัดทิ้ง
    sizes = sizes.filter((s) => s > 0);
  }

  const slots: Slot[] = [];
  if (config.fillMode === "roundRobin") {
    // วนแจกทีละคนรอบทีม จนกว่าที่นั่งจะเต็ม
    const filled = sizes.map(() => 0);
    let guard = 0;
    while (slots.length < total - benchCount && guard < total * sizes.length + 10) {
      guard++;
      for (let t = 0; t < sizes.length; t++) {
        if (filled[t] >= sizes[t]) continue;
        slots.push({ teamIndex: t, seat: filled[t] });
        filled[t] += 1;
        if (slots.length >= total - benchCount) break;
      }
    }
  } else {
    for (let t = 0; t < sizes.length; t++) {
      for (let seat = 0; seat < sizes[t]; seat++) {
        slots.push({ teamIndex: t, seat });
      }
    }
  }
  for (let b = 0; b < benchCount; b++) {
    slots.push({ teamIndex: null, seat: b });
  }

  return { sizes, benchCount, slots };
}

/** ลำดับผู้เล่นที่จะถูกจับสลาก ล็อกด้วย seed */
export function drawOrder(players: Player[], seed: string): Player[] {
  return shuffle(players, rngFromSeed(`${seed}::order`));
}

/** เลนของแต่ละทีม สุ่มไว้ล่วงหน้าเพื่อให้ผลคงที่ตาม seed */
export function laneAssignments(
  teamIndex: number,
  size: number,
  seed: string,
): string[] {
  const rand = rngFromSeed(`${seed}::lane::${teamIndex}`);
  const pool = shuffle(LANES.map((l) => l.label), rand);
  return Array.from({ length: size }, (_, i) => pool[i % pool.length]);
}

/**
 * ประกอบทีมจากจำนวนคนที่ถูกจับสลากไปแล้ว (revealed)
 * เป็น pure function ทำให้ undo = ลดตัวเลขอย่างเดียว
 */
export function buildTeams(
  order: Player[],
  plan: TeamPlan,
  revealed: number,
  seed: string,
  assignLanes: boolean,
): { teams: BuiltTeam[]; bench: Member[] } {
  const teams: BuiltTeam[] = plan.sizes.map((size, index) => ({
    index,
    identity: identityFor(index),
    size,
    members: [],
    isFull: false,
  }));
  const bench: Member[] = [];
  const lanes = assignLanes
    ? plan.sizes.map((size, i) => laneAssignments(i, size, seed))
    : null;

  const upto = Math.min(revealed, plan.slots.length, order.length);
  for (let i = 0; i < upto; i++) {
    const slot = plan.slots[i];
    const player = order[i];
    if (!slot || !player) continue;
    if (slot.teamIndex === null) {
      bench.push({ player, seat: slot.seat });
    } else {
      const team = teams[slot.teamIndex];
      if (!team) continue;
      team.members.push({
        player,
        seat: slot.seat,
        lane: lanes?.[slot.teamIndex]?.[slot.seat],
      });
    }
  }

  for (const team of teams) {
    team.members.sort((a, b) => a.seat - b.seat);
    team.isFull = team.members.length >= team.size;
  }

  return { teams, bench };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** ข้อความสรุปสำหรับปุ่มคัดลอก */
export function teamsToText(
  teams: BuiltTeam[],
  bench: Member[],
  seed: string,
): string {
  const lines: string[] = ["🏆 ผลการแบ่งทีม ROV TOURNAMENT", ""];
  for (const team of teams) {
    lines.push(`${team.identity.glyph} TEAM ${team.identity.name} (${team.members.length} คน)`);
    team.members.forEach((m, i) => {
      lines.push(`  ${i + 1}. ${m.player.name}${m.lane ? ` — ${m.lane}` : ""}`);
    });
    lines.push("");
  }
  if (bench.length) {
    lines.push(`🪑 ตัวสำรอง (${bench.length} คน)`);
    bench.forEach((m, i) => lines.push(`  ${i + 1}. ${m.player.name}`));
    lines.push("");
  }
  lines.push(`seed: ${seed}`);
  return lines.join("\n");
}
