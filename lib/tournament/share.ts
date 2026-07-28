"use client";

import type { Tournament } from "./types";

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

/**
 * ลิงก์แชร์ทัวร์ — ฝังข้อมูลทั้งก้อนไว้ใน URL
 * ตัดรูปปกกับ PIN ออก เพราะรูปทำให้ลิงก์ยาวมากและ PIN ไม่ควรติดไปกับลิงก์
 */
export function encodeTournament(tournament: Tournament): string {
  const slim: Tournament = {
    ...tournament,
    cover: undefined,
    adminPin: undefined,
  };
  return toBase64Url(JSON.stringify(slim));
}

export function decodeTournament(raw: string): Tournament | null {
  try {
    const data = JSON.parse(fromBase64Url(raw)) as Tournament;
    if (!data?.id || !data?.name || !Array.isArray(data.teams)) return null;
    return data;
  } catch {
    return null;
  }
}

export function tournamentShareUrl(tournament: Tournament): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#s=${encodeTournament(tournament)}`;
}

/** ลิงก์เปิดทัวร์ที่อยู่ในเครื่องตัวเอง (ไม่ได้ฝังข้อมูล) */
export function tournamentLocalUrl(id: string): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#t=${id}`;
}

export function readHashParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(
    new RegExp(`[#&]${name}=([^&]+)`),
  );
  return match ? match[1] : null;
}

export function setHashParam(name: string, value: string | null) {
  if (typeof window === "undefined") return;
  const url = value
    ? `${window.location.pathname}#${name}=${value}`
    : window.location.pathname;
  history.replaceState(null, "", url);
}

/** ข้อความสรุปทัวร์ไว้แปะในแชท */
export function tournamentSummaryText(tournament: Tournament): string {
  const lines: string[] = [`🏆 ${tournament.name}`];
  if (tournament.tagline) lines.push(tournament.tagline);
  lines.push("");
  if (tournament.startAt) {
    lines.push(`📅 แข่ง ${formatThaiDate(tournament.startAt)}`);
  }
  if (tournament.registerCloseAt) {
    lines.push(`📝 ปิดรับสมัคร ${formatThaiDate(tournament.registerCloseAt)}`);
  }
  if (tournament.prize.total > 0) {
    lines.push(
      `💰 เงินรางวัลรวม ${tournament.prize.currency}${tournament.prize.total.toLocaleString("th-TH")}`,
    );
  }
  lines.push(`👥 ${tournament.teams.length} ทีม · ทีมละ ${tournament.teamSize} คน`);
  if (tournament.live.isLive && tournament.live.url) {
    lines.push(`🔴 ไลฟ์อยู่: ${tournament.live.url}`);
  }
  return lines.join("\n");
}

export function formatThaiDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatThaiDay(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
