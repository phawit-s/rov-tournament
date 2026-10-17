#!/usr/bin/env node
/**
 * สะพานแชท TikTok Live → คิวขอเพลงของช่อง — แบบพิมพ์คำสั่ง
 * ------------------------------------------------------------------
 * ทำไมต้องรันบนเครื่องตัวเอง ไม่เอาไปไว้บนคลาวด์เหมือนของอย่างอื่น
 *
 *   TikTok ไม่มี API สาธารณะให้อ่านคอมเมนต์ในไลฟ์ ทางเดียวที่ทำได้คือต่อ
 *   WebSocket ภายในของเขา ซึ่งต้องมีลายเซ็นจากบริการภายนอกและต้องเปิดค้าง
 *   ตลอดเวลาที่ไลฟ์อยู่ — สองอย่างนี้ทำในเว็บ static ไม่ได้ และทำใน
 *   Cloudflare Worker ธรรมดาก็ไม่ได้ (มันตายทันทีที่ตอบคำขอเสร็จ)
 *
 *   เครื่องสตรีมเมอร์เปิดอยู่แล้วตอนไลฟ์พอดี ที่นี่จึงเป็นที่ที่ถูกที่สุด
 *   ทั้งในแง่เงินและในแง่ว่ามันออนไลน์ตรงกับเวลาที่ต้องใช้งานจริง
 *
 * ตัวนี้ทำแค่สองอย่าง: ฟังแชท กับยิงต่อไปที่ Worker (ตรรกะอยู่ใน core.mjs)
 * การตัดสินใจทั้งหมด (ช่องเปิดรับไหม คิวเต็มยัง คนนี้ขอเกินโควตาหรือเปล่า)
 * อยู่ที่ Worker เพราะสคริปต์ที่รันบนเครื่องผู้ใช้เชื่อไม่ได้ ใครก็แก้ได้
 *
 * ไฟล์นี้สำหรับคนที่ถนัดแก้ .env เอง — สตรีมเมอร์ทั่วไปใช้โปรแกรม (app.mjs → .exe)
 *
 * วิธีใช้
 *   npm install            (ครั้งเดียว)
 *   cp .env.example .env   แล้วกรอกค่า
 *   npm start
 *
 *   ทดสอบโดยไม่ต้องเปิดไลฟ์:  node tiktok-song-bridge.mjs --test "แสงสุดท้าย"
 */

import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_COMMANDS, briefly, createBridge } from "./core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 * ตัวช่วยเล็กๆ
 * ------------------------------------------------------------------ */

// สร้างจากรหัสตัวอักษร ไม่พิมพ์อักขระ escape ลงไฟล์ตรงๆ เพราะมันมองไม่เห็น
// ในเอดิเตอร์ส่วนใหญ่แล้วชวนให้ลบทิ้งโดยไม่ตั้งใจตอนแก้บรรทัดนี้
const ESC = String.fromCharCode(27);
const color = !process.env.NO_COLOR && process.stdout.isTTY;
const tint = (code) => (s) =>
  color ? ESC + '[' + code + 'm' + s + ESC + '[0m' : String(s);
const dim = tint("2");
const bold = tint("1");
const green = tint("32");
const yellow = tint("33");
const red = tint("31");

// เขียนลงไฟล์ (run-forever.cmd) ต้องมีวันที่ด้วย ไม่งั้นอ่าน log ย้อนหลังข้ามวันไม่รู้เรื่อง
const stamp = () =>
  process.stdout.isTTY
    ? new Date().toLocaleTimeString("th-TH", { hour12: false })
    : new Date().toLocaleString("th-TH", { hour12: false });

const log = (...parts) => console.log(dim(`[${stamp()}]`), ...parts);

function die(message) {
  console.error(`\n${red("หยุดทำงาน:")} ${message}\n`);
  process.exit(1);
}

/** แปลง event จาก core เป็นบรรทัดบนจอ — หน้าตาเหมือนรุ่นก่อนแยกไฟล์ */
function print(e) {
  const tail = e.detail ? [dim(`· ${e.detail}`)] : [];
  switch (e.kind) {
    case "ask":
      return log(dim(`↳ ${e.text}`));
    case "ok":
      return log(green("✓"), e.text, ...tail);
    case "skip":
      return log(yellow("–"), e.text, ...tail);
    case "wait":
      return log(dim(`⏳ ${e.text}`));
    case "setup":
      return log(red("✗ ตั้งค่ายังไม่ครบ:"), e.text);
    case "error":
      return log(red("✗"), e.text, ...tail);
    case "warn":
      return log(yellow(e.text), ...tail);
    case "status":
      if (!e.loud) return;
      if (e.state === "live") return log(green(`● ${e.text}`), ...tail);
      if (e.state === "retry") return log(yellow(`○ ${e.text}`), ...tail);
      return log(dim(`○ ${e.text}`), ...tail);
    default:
      return log(dim(e.text), ...tail);
  }
}

/* ------------------------------------------------------------------ *
 * ค่าตั้งค่า
 *
 * อ่านจาก .env ข้างไฟล์นี้ แล้วให้ตัวแปรสภาพแวดล้อมจริงกับ flag ทับได้
 * ไม่ใช้ dotenv เพื่อจะได้ไม่ต้องมี dependency เพิ่มอีกตัวสำหรับงาน 10 บรรทัด
 * ------------------------------------------------------------------ */

function readEnvFile(name) {
  let text;
  try {
    text = readFileSync(isAbsolute(name) ? name : join(HERE, name), "utf8");
  } catch {
    // ไฟล์ที่ระบุเอง (--env) ต้องมีจริง — เงียบไว้แล้วรันด้วยค่าว่างจะงงกว่า
    if (name !== ".env") die(`เปิดไฟล์ตั้งค่า ${name} ไม่ได้`);
    return {};
  }
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // ยอมให้ครอบด้วยเครื่องหมายคำพูด เผื่อค่ามีช่องว่างหรือ #
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const argv = process.argv.slice(2);
const flagValue = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};
const hasFlag = (name) => argv.includes(`--${name}`);

/* --env <ไฟล์> — หลายช่องบนเครื่องเดียว แยกไฟล์ตั้งค่าละช่อง (เช่น bammmmyyi.env) */
const file = readEnvFile(flagValue("env") ?? ".env");
const pick = (key, fallback = "") =>
  (process.env[key] ?? file[key] ?? fallback).toString().trim();

const cfg = {
  user: (flagValue("user") ?? pick("TIKTOK_USER")).replace(/^@/, ""),
  workerUrl: pick("WORKER_URL").replace(/\/+$/, ""),
  token: pick("INGEST_TOKEN"),
  channel: pick("CHANNEL"),
  signKey: pick("SIGN_API_KEY"),
  commands: pick("COMMANDS", DEFAULT_COMMANDS.join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  cooldown: Number(pick("COOLDOWN_SEC", "45")) || 0,
};

/* ------------------------------------------------------------------ *
 * เปิดได้ทีละตัว
 *
 * สะพานสองตัวฟังไลฟ์เดียวกัน = ทุกคำขอเข้าคิวสองรอบ และกินโควตาค้นหาสองเท่า
 * เกิดง่ายมากเมื่อ run-forever.cmd เปิดค้างอยู่เบื้องหลังแล้วมีคนพิมพ์ npm start ซ้ำ
 * จึงจองไฟล์ .bridge-<ช่อง>.lock ด้วยเลข process — ตัวที่มาทีหลังเห็นว่าเจ้าของยังอยู่ก็ถอย
 * เจ้าของตายไปแล้ว (ปิดหน้าต่างทิ้งโดยไม่ได้ลบไฟล์) ก็ยึดต่อได้เลย
 * จองแยกต่อช่อง — คนละช่องรันพร้อมกันได้ (--env) ห้ามแค่ช่องเดียวกันซ้อนกัน
 * ------------------------------------------------------------------ */

const LOCK = join(
  HERE,
  `.bridge-${cfg.channel.toLowerCase().replace(/[^a-z0-9_-]/g, "_") || "default"}.lock`,
);

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM"; // มีอยู่แต่ไม่มีสิทธิ์แตะ = ยังอยู่
  }
}

function holdLock() {
  let owner = 0;
  try {
    owner = Number(readFileSync(LOCK, "utf8")) || 0;
  } catch {
    /* ไม่มีไฟล์ = ไม่มีใครจอง */
  }
  if (owner && owner !== process.pid && alive(owner)) {
    die(
      `มีสะพานเปิดอยู่แล้ว (process ${owner}) — เปิดซ้อนกันคำขอจะเข้าคิวสองรอบ\n` +
        `  ถ้าแน่ใจว่าไม่มีตัวไหนเปิดอยู่ ลบไฟล์ ${LOCK} แล้วเปิดใหม่`,
    );
  }
  writeFileSync(LOCK, String(process.pid));
  process.on("exit", () => {
    try {
      if (Number(readFileSync(LOCK, "utf8")) === process.pid) unlinkSync(LOCK);
    } catch {
      /* ลบไม่ได้ก็ไม่เป็นไร ตัวถัดไปเห็นว่าเจ้าของตายแล้วก็ยึดต่อเอง */
    }
  });
}

async function main() {
  /* ---- ตรวจค่าตั้งค่าก่อน จะได้ไม่ไปตายตอนมีคนขอเพลงจริง ---- */
  const missing = [
    !cfg.workerUrl && "WORKER_URL",
    !cfg.token && "INGEST_TOKEN",
    !cfg.channel && "CHANNEL",
  ].filter(Boolean);
  if (missing.length) {
    die(
      `ยังไม่ได้ตั้งค่า ${missing.join(", ")} — คัดลอก .env.example เป็น .env แล้วกรอกให้ครบ`,
    );
  }

  console.log(`
${bold("สะพานแชท TikTok → คิวขอเพลง")}
${dim("─".repeat(46))}
  ช่อง       ${cfg.channel}
  Worker     ${cfg.workerUrl}
  คำสั่ง      ${cfg.commands.join("  ")}
  หน่วงต่อคน ${cfg.cooldown} วินาที
${dim("─".repeat(46))}`);

  const bridge = createBridge(cfg, print);

  /* โหมดทดสอบ — ยิงคำขอหนึ่งอันโดยไม่ต้องต่อ TikTok
     มีไว้เพื่อแยกให้ออกว่า "ฝั่ง Worker พัง" กับ "ต่อ TikTok ไม่ติด"
     ซึ่งเป็นสองปัญหาที่หน้าตาเหมือนกันมากเวลาเปิดไลฟ์แล้วไม่มีอะไรเกิดขึ้น */
  if (hasFlag("test")) {
    const query = flagValue("test") ?? "แสงสุดท้าย bodyslam";
    log(dim(`โหมดทดสอบ — ส่ง "${query}" ไปที่ Worker`));
    await bridge.submit({ id: "test_user", name: "ทดสอบ" }, query);
    return;
  }

  if (!cfg.user) {
    die("ยังไม่ได้ใส่ TIKTOK_USER (ชื่อผู้ใช้ TikTok ที่ไลฟ์ ไม่ต้องมี @)");
  }
  holdLock();

  const bye = () => {
    log("ปิดสะพาน");
    bridge.stop();
    process.exit(0);
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);

  await bridge.start();
}

/* เริ่มทำงานเฉพาะตอนถูกเรียกเป็นโปรแกรม ไม่ใช่ตอนถูก import */
const runAsProgram =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runAsProgram) main().catch((e) => die(briefly(e)));
