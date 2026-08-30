import { readLiveHashParam } from "@/lib/hash";
import type { Config } from "./types";

export type SharePayload = {
  v: 1;
  n: string[];
  s: string;
  c: Config;
};

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** ผลลัพธ์ถูกกำหนดโดย (รายชื่อ + config + seed) จึงแชร์แค่ 3 อย่างนี้พอ */
export function encodeShare(payload: SharePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShare(raw: string): SharePayload | null {
  try {
    const data = JSON.parse(fromBase64Url(raw)) as SharePayload;
    if (data?.v !== 1 || !Array.isArray(data.n) || typeof data.s !== "string") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function shareUrl(payload: SharePayload): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#r=${encodeShare(payload)}`;
}

export function readShareFromHash(): SharePayload | null {
  if (typeof window === "undefined") return null;
  const raw = readLiveHashParam("r");
  return raw ? decodeShare(raw) : null;
}

export function clearShareHash() {
  if (typeof window === "undefined") return;
  history.replaceState(null, "", window.location.pathname + window.location.search);
}
