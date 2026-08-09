import type { TeamIdentity } from "./types";

/** อัตลักษณ์ทีม เรียงตามลำดับที่ถูกใช้ วนซ้ำถ้าทีมเยอะกว่านี้ */
/** โทนอัญมณี ไม่ฉูดฉาด อ่านง่ายบนพื้นดำ */
export const TEAM_IDENTITIES: TeamIdentity[] = [
  { name: "RUBY", short: "RBY", rgb: "224 96 112", hex: "#e06070", glyph: "◆" },
  { name: "SAPPHIRE", short: "SPH", rgb: "110 155 240", hex: "var(--color-info)", glyph: "◇" },
  { name: "AMETHYST", short: "AMT", rgb: "196 130 255", hex: "#c482ff", glyph: "✦" },
  { name: "EMERALD", short: "EMR", rgb: "52 227 176", hex: "var(--color-win)", glyph: "❖" },
  { name: "TOPAZ", short: "TPZ", rgb: "169 155 255", hex: "var(--color-iris)", glyph: "◈" },
  { name: "ROSE", short: "ROS", rgb: "219 133 163", hex: "#db85a3", glyph: "✧" },
  { name: "JADE", short: "JAD", rgb: "129 191 127", hex: "#81bf7f", glyph: "▲" },
  { name: "COBALT", short: "CBT", rgb: "122 133 214", hex: "#7a85d6", glyph: "●" },
  { name: "AMBER", short: "AMB", rgb: "220 148 89", hex: "#dc9459", glyph: "■" },
  { name: "AQUA", short: "AQA", rgb: "104 184 197", hex: "#68b8c5", glyph: "★" },
  { name: "PEARL", short: "PRL", rgb: "193 198 214", hex: "#c1c6d6", glyph: "◐" },
  { name: "ONYX", short: "ONX", rgb: "126 130 153", hex: "var(--color-out)", glyph: "◼" },
];

export const BENCH_IDENTITY: TeamIdentity = {
  name: "ตัวสำรอง",
  short: "SUB",
  rgb: "138 142 168",
  hex: "#8a8ea8",
  glyph: "○",
};

export function identityFor(index: number): TeamIdentity {
  return TEAM_IDENTITIES[index % TEAM_IDENTITIES.length];
}

/**
 * ตำแหน่งในทีม — ตั้งชื่อกลางๆ ให้ใช้กับเกมไหนก็ได้
 * ถ้าเกมที่จัดใช้คำเรียกอื่น แก้ label ที่นี่ที่เดียว ทั้งเว็บกับรูป export จะเปลี่ยนตาม
 */
export const LANES = [
  { key: "dark", label: "ดาบ", en: "Solo", glyph: "🗡️" },
  { key: "jungle", label: "ป่า", en: "Jungle", glyph: "🌿" },
  { key: "mid", label: "กลาง", en: "Mid", glyph: "✨" },
  { key: "abyss", label: "ท้าย", en: "Carry", glyph: "🏹" },
  { key: "support", label: "ซัพ", en: "Support", glyph: "🛡️" },
] as const;

export type Lane = (typeof LANES)[number];

export function laneByLabel(label?: string): Lane | undefined {
  return LANES.find((l) => l.label === label);
}

/** ชื่อตัวอย่างไว้กดเติมเร็วๆ ตอนลองเล่น — เป็นชื่อเล่นกลางๆ ไม่ผูกกับเกมไหน */
export const SAMPLE_NAMES = [
  "Nova",
  "Falcon",
  "Echo",
  "Vortex",
  "Blaze",
  "Cipher",
  "Onyx",
  "Rogue",
  "Specter",
  "Titan",
  "Zephyr",
  "Quasar",
  "Reaper",
  "Halo",
  "Drift",
  "Ember",
  "Nomad",
  "Pulse",
  "Vega",
  "Wraith",
];
