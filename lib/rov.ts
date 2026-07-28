import type { TeamIdentity } from "./types";

/** อัตลักษณ์ทีม เรียงตามลำดับที่ถูกใช้ วนซ้ำถ้าทีมเยอะกว่านี้ */
export const TEAM_IDENTITIES: TeamIdentity[] = [
  { name: "CRIMSON", short: "CRM", rgb: "244 63 94", hex: "#f43f5e", glyph: "🔥" },
  { name: "AZURE", short: "AZR", rgb: "34 211 238", hex: "#22d3ee", glyph: "💠" },
  { name: "VIOLET", short: "VLT", rgb: "168 85 247", hex: "#a855f7", glyph: "🔮" },
  { name: "EMERALD", short: "EMR", rgb: "16 185 129", hex: "#10b981", glyph: "🐉" },
  { name: "AMBER", short: "AMB", rgb: "251 191 36", hex: "#fbbf24", glyph: "⚡" },
  { name: "ORCHID", short: "ORC", rgb: "236 72 153", hex: "#ec4899", glyph: "🌸" },
  { name: "LIME", short: "LIM", rgb: "163 230 53", hex: "#a3e635", glyph: "🍀" },
  { name: "COBALT", short: "CBT", rgb: "99 102 241", hex: "#6366f1", glyph: "🛡️" },
  { name: "SOLAR", short: "SLR", rgb: "249 115 22", hex: "#f97316", glyph: "☀️" },
  { name: "FROST", short: "FRS", rgb: "125 211 252", hex: "#7dd3fc", glyph: "❄️" },
  { name: "ONYX", short: "ONX", rgb: "148 163 184", hex: "#94a3b8", glyph: "🌑" },
  { name: "TOXIC", short: "TXC", rgb: "132 204 22", hex: "#84cc16", glyph: "☠️" },
];

export const BENCH_IDENTITY: TeamIdentity = {
  name: "ตัวสำรอง",
  short: "SUB",
  rgb: "139 139 181",
  hex: "#8b8bb5",
  glyph: "🪑",
};

export function identityFor(index: number): TeamIdentity {
  return TEAM_IDENTITIES[index % TEAM_IDENTITIES.length];
}

/** ตำแหน่งในเกม RoV — ใช้ตอนเปิดโหมดสุ่มเลน */
export const LANES = [
  { key: "dark", label: "ดาบ", en: "Dark Slayer", glyph: "🗡️" },
  { key: "jungle", label: "ป่า", en: "Jungle", glyph: "🌿" },
  { key: "mid", label: "กลาง", en: "Mid", glyph: "✨" },
  { key: "abyss", label: "ท้าย", en: "Abyssal", glyph: "🏹" },
  { key: "support", label: "ซัพ", en: "Support", glyph: "🛡️" },
] as const;

export type Lane = (typeof LANES)[number];

export function laneByLabel(label?: string): Lane | undefined {
  return LANES.find((l) => l.label === label);
}

/** ชื่อตัวอย่างไว้กดเติมเร็วๆ ตอนลองเล่น */
export const SAMPLE_NAMES = [
  "Violet",
  "Butterfly",
  "Murad",
  "Airi",
  "Nakroth",
  "Zuka",
  "Tel'Annas",
  "Valhein",
  "Capheny",
  "Lauriel",
  "Krixi",
  "Ilumia",
  "Alice",
  "Zill",
  "Florentino",
  "Riktor",
  "Omega",
  "Arum",
  "Yena",
  "Elsu",
];
