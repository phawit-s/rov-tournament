#!/usr/bin/env node
/**
 * สะพานแชท TikTok Live → คิวขอเพลงของช่อง
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
 * ตัวนี้ทำแค่สองอย่าง: ฟังแชท กับยิงต่อไปที่ Worker
 * การตัดสินใจทั้งหมด (ช่องเปิดรับไหม คิวเต็มยัง คนนี้ขอเกินโควตาหรือเปล่า)
 * อยู่ที่ Worker เพราะสคริปต์ที่รันบนเครื่องผู้ใช้เชื่อไม่ได้ ใครก็แก้ได้
 *
 * วิธีใช้
 *   npm install            (ครั้งเดียว)
 *   cp .env.example .env   แล้วกรอกค่า
 *   npm start
 *
 *   ทดสอบโดยไม่ต้องเปิดไลฟ์:  node tiktok-song-bridge.mjs --test "แสงสุดท้าย"
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

const stamp = () =>
  new Date().toLocaleTimeString("th-TH", { hour12: false });

const log = (...parts) => console.log(dim(`[${stamp()}]`), ...parts);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(message) {
  console.error(`\n${red("หยุดทำงาน:")} ${message}\n`);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * ค่าตั้งค่า
 *
 * อ่านจาก .env ข้างไฟล์นี้ แล้วให้ตัวแปรสภาพแวดล้อมจริงกับ flag ทับได้
 * ไม่ใช้ dotenv เพื่อจะได้ไม่ต้องมี dependency เพิ่มอีกตัวสำหรับงาน 10 บรรทัด
 * ------------------------------------------------------------------ */

function readEnvFile() {
  let text;
  try {
    text = readFileSync(join(HERE, ".env"), "utf8");
  } catch {
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

const file = readEnvFile();
const pick = (key, fallback = "") =>
  (process.env[key] ?? file[key] ?? fallback).toString().trim();

const cfg = {
  user: (flagValue("user") ?? pick("TIKTOK_USER")).replace(/^@/, ""),
  workerUrl: pick("WORKER_URL").replace(/\/+$/, ""),
  token: pick("INGEST_TOKEN"),
  channel: pick("CHANNEL"),
  signKey: pick("SIGN_API_KEY"),
  commands: pick("COMMANDS", "!เพลง,!ขอเพลง,!song,!sr")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  cooldown: Number(pick("COOLDOWN_SEC", "45")) || 0,
};

/* ------------------------------------------------------------------ *
 * คุยกับ Worker
 * ------------------------------------------------------------------ */

/** คำอธิบายเหตุผลที่ Worker ตอบกลับมา — แปลเป็นภาษาคนเพื่อแก้ได้ถูกจุด */
const WHY = {
  "ingest-disabled": "Worker ยังไม่ได้ตั้ง INGEST_TOKEN (wrangler secret put INGEST_TOKEN)",
  "bad-token": "INGEST_TOKEN ในไฟล์ .env ไม่ตรงกับที่ตั้งไว้ใน Worker",
  "no-channel": "ยังไม่ได้ใส่ CHANNEL ในไฟล์ .env",
  "channel-not-found": "หาช่องไม่เจอ — CHANNEL ต้องเป็นไอดีช่องหรือ handle ที่มีจริง",
  "songs-closed": "ช่องนี้ปิดรับคำขอเพลงอยู่ — เปิดสวิตช์ที่หน้าจัดการช่องก่อน",
  "no-bot": "Worker ยังไม่ได้ตั้งบัญชีบอท (BOT_EMAIL / BOT_PASSWORD / FIREBASE_API_KEY)",
  "bot-login-failed": "บอทล็อกอิน Firebase ไม่ผ่าน — เช็ครหัสผ่านและ FIREBASE_API_KEY",
  "no-youtube-key": "Worker ไม่มีคีย์ YouTube จึงค้นด้วยชื่อเพลงไม่ได้ (วางลิงก์ยังใช้ได้)",
  "youtube-quota": "โควตาค้นหาของวันนี้หมดแล้ว — วางลิงก์ YouTube แทนได้",
  "youtube-error": "YouTube ปฏิเสธคำขอค้นหา",
  "no-match": "ค้นไม่เจอเพลงที่ขอ",
  "video-not-found": "เปิดคลิปนี้ไม่ได้ (ถูกลบ เป็นส่วนตัว หรือลิงก์ผิด)",
  duplicate: "เพลงนี้อยู่ในคิวแล้ว",
  "too-many": "คนนี้ขอครบโควตาต่อคนแล้ว",
  "queue-full": "คิวเต็มแล้ว",
  cooldown: "คนนี้ขอถี่เกินไป",
  "rate-limited": "คำขอเข้ามาถี่เกินเพดานของช่อง",
  "empty-query": "พิมพ์คำสั่งมาเปล่าๆ ไม่มีชื่อเพลง",
  "bad-platform": "platform ที่ส่งไปไม่อยู่ในรายการที่ Worker รับ",
};

/** เหตุผลที่แปลว่า "ตั้งค่าผิด" ไม่ใช่ "คนดูขอไม่ผ่าน" — ต้องเห็นเด่นๆ */
const SETUP_PROBLEMS = new Set([
  "ingest-disabled",
  "bad-token",
  "no-channel",
  "channel-not-found",
  "no-bot",
  "bot-login-failed",
  "write-failed-403",
  "write-failed-401",
]);

function explain(reason, message) {
  const base = WHY[reason] ?? reason;
  if (String(reason).startsWith("write-failed")) {
    return `เขียนคิวไม่ผ่าน (${reason}) — uid ของบอทอยู่ใน admins แล้วหรือยัง และ publish firestore.rules ตัวใหม่หรือยัง`;
  }
  return message ? `${base} — ${message}` : base;
}

async function submit(user, query) {
  const url = new URL(cfg.workerUrl);
  url.searchParams.set("ingest", "1");

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({
        channelId: cfg.channel,
        platform: "tiktok",
        user,
        query,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    log(red("✗"), `เรียก Worker ไม่ได้ — ${e?.message ?? "network error"}`);
    return;
  }

  const data = await res.json().catch(() => null);
  if (!data) {
    log(red("✗"), `Worker ตอบกลับมาไม่ใช่ JSON (HTTP ${res.status})`);
    return;
  }

  if (data.ok) {
    log(
      green("✓"),
      `คิวที่ ${bold(data.position)} · ${data.title}`,
      dim(`· ขอโดย @${user.id}`),
    );
    return;
  }

  const text = explain(data.reason, data.message);
  if (SETUP_PROBLEMS.has(data.reason)) {
    log(red("✗ ตั้งค่ายังไม่ครบ:"), text);
  } else {
    log(yellow("–"), `${text}`, dim(`· @${user.id}: ${query}`));
  }
}

/* ------------------------------------------------------------------ *
 * อ่านแชท
 * ------------------------------------------------------------------ */

/** คืนคำขอหลังคำสั่ง หรือ null ถ้าไม่ใช่คำสั่งขอเพลง */
function parse(comment) {
  const text = String(comment ?? "").trim();
  const lower = text.toLowerCase();
  for (const cmd of cfg.commands) {
    if (lower.startsWith(cmd)) return text.slice(cmd.length).trim();
  }
  return null;
}

/**
 * หน่วงรายคน — ตัดคำขอซ้ำๆ ทิ้งตั้งแต่ต้นทาง
 *
 * Worker มีเพดานของตัวเองอยู่แล้ว แต่การกันที่นี่ประหยัดกว่า เพราะคำขอที่
 * โดนตัดตรงนี้ไม่ได้เดินทางไปถึงโควตาค้นหาของ YouTube ซึ่งมีวันละ ~100 ครั้ง
 */
const lastAsk = new Map();
function coolingDown(id) {
  if (!cfg.cooldown) return 0;
  const prev = lastAsk.get(id) ?? 0;
  const left = Math.ceil((prev + cfg.cooldown * 1000 - Date.now()) / 1000);
  return left > 0 ? left : 0;
}

/**
 * ดึงชื่อผู้ใช้ออกจาก payload ของแชท
 *
 * ชื่อฟิลด์ไม่เหมือนกันในแต่ละเวอร์ชันของไลบรารี และไม่มีทางรู้ล่วงหน้าว่า
 * ผู้ใช้จะ npm install ได้ตัวไหน
 *   v1  วางไว้ระดับบนสุดเป็น uniqueId / nickname
 *   v2  ส่ง proto ดิบมาใต้ user ซึ่งเก็บ @ ไว้ในชื่อ displayId (ไม่มี uniqueId)
 * ไล่ทุกชื่อที่เคยใช้ แล้วค่อยตกไปที่ไอดีตัวเลข ดีกว่าปล่อยคำขอตกหายเงียบๆ
 */
function readUser(payload) {
  const u = payload?.user ?? {};
  const handle = u.uniqueId || u.displayId || payload?.uniqueId || "";
  const id = handle || String(u.id ?? payload?.userId ?? "");
  const name = u.nickname || payload?.nickname || id;
  return { id, name: String(name) };
}

/** เตือนครั้งเดียวพอ ไม่งั้นแชทรัวๆ จะท่วมหน้าจอด้วยข้อความเดียวกัน */
let warnedUnknownUser = false;

function onChat(payload) {
  const { id, name } = readUser(payload);
  const comment = payload?.comment ?? "";
  if (!id) {
    if (!warnedUnknownUser) {
      warnedUnknownUser = true;
      log(
        yellow("อ่านชื่อคนพิมพ์ไม่ออก"),
        dim(`— ไลบรารีอาจเปลี่ยนรูปแบบ (ฟิลด์ที่มี: ${Object.keys(payload?.user ?? payload ?? {}).slice(0, 8).join(", ")})`),
      );
    }
    return;
  }

  const query = parse(comment);
  if (query === null) return; // แชทคุยเล่นทั่วไป ไม่ต้องสนใจ

  if (!query) {
    log(yellow("–"), `@${id} พิมพ์คำสั่งเปล่าๆ`, dim(`(${cfg.commands[0]} ชื่อเพลง)`));
    return;
  }

  const wait = coolingDown(id);
  if (wait) {
    log(dim(`⏳ @${id} ขอถี่ไป รออีก ${wait} วิ`));
    return;
  }
  lastAsk.set(id, Date.now());

  log(dim(`↳ @${id}: ${query}`));
  void submit({ id, name: String(name).slice(0, 40) }, query);
}

/* ------------------------------------------------------------------ *
 * ต่อกับ TikTok
 * ------------------------------------------------------------------ */

async function makeConnection() {
  let mod;
  try {
    mod = await import("tiktok-live-connector");
  } catch {
    die('ยังไม่ได้ติดตั้งไลบรารี — รัน "npm install" ในโฟลเดอร์ bridge/ ก่อน');
  }

  /* ไลบรารีตัวนี้เปลี่ยนชื่อคลาสตอนขึ้นเวอร์ชัน 2 (WebcastPushConnection →
     TikTokLiveConnection) รับทั้งสองชื่อไว้ จะได้ไม่พังเวลาผู้ใช้ npm install
     แล้วได้คนละเวอร์ชันกับที่เขียนไว้ */
  const src = mod.default ?? mod;
  const Ctor =
    mod.TikTokLiveConnection ??
    mod.WebcastPushConnection ??
    src.TikTokLiveConnection ??
    src.WebcastPushConnection;
  if (!Ctor) {
    die("ไม่รู้จักเวอร์ชันของ tiktok-live-connector ที่ติดตั้งไว้");
  }

  /* คีย์ของบริการลายเซ็น (ไม่ใส่ก็ใช้โควตาสาธารณะซึ่งจำกัดกว่า)
     v2 รับผ่าน SignConfig ที่เป็นตัวแปรระดับโมดูล ส่วน v1 รับผ่าน options
     ตอนสร้าง — ส่งผิดช่องแล้วมันเงียบ ไม่ฟ้อง จึงต้องดูก่อนว่ามีตัวไหน */
  const SignConfig = mod.SignConfig ?? src.SignConfig;
  if (cfg.signKey && SignConfig) SignConfig.apiKey = cfg.signKey;
  const options = cfg.signKey && !SignConfig ? { signApiKey: cfg.signKey } : {};

  return new Ctor(cfg.user, options);
}

/** ข้อความบอกเหตุจากไลบรารี มักยาวและมี stack ปน เอาแค่บรรทัดแรก */
const briefly = (e) =>
  String(e?.message ?? e ?? "unknown").split("\n")[0].slice(0, 160);

async function run() {
  const conn = await makeConnection();

  conn.on("chat", onChat);

  /* ต่อไม่ติดแล้วลองใหม่เรื่อยๆ ด้วยการถอยหลังแบบทวีคูณ

     เคสที่เจอบ่อยที่สุดคือ "ยังไม่ได้เริ่มไลฟ์" ซึ่งไม่ใช่ความผิดพลาด —
     สตรีมเมอร์เปิดสะพานทิ้งไว้ก่อนแล้วค่อยกดไลฟ์เป็นเรื่องปกติ
     จึงต้องรอต่อไปเงียบๆ ไม่ใช่ตายทิ้ง */
  let attempt = 0;
  for (;;) {
    try {
      const state = await conn.connect();
      attempt = 0;
      log(green("● ต่อกับไลฟ์แล้ว"), dim(`ห้อง ${state?.roomId ?? "?"}`));
      return conn;
    } catch (e) {
      attempt += 1;
      const wait = Math.min(60, 5 * 2 ** Math.min(attempt - 1, 4));
      const why = briefly(e);
      const offline = /offline|not.*live|LIVE has ended|user_not_found/i.test(why);
      log(
        offline ? dim("○ ยังไม่ได้เริ่มไลฟ์") : yellow(`○ ต่อไม่ติด — ${why}`),
        dim(`ลองใหม่ใน ${wait} วิ`),
      );
      await sleep(wait * 1000);
    }
  }
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

  /* โหมดทดสอบ — ยิงคำขอหนึ่งอันโดยไม่ต้องต่อ TikTok
     มีไว้เพื่อแยกให้ออกว่า "ฝั่ง Worker พัง" กับ "ต่อ TikTok ไม่ติด"
     ซึ่งเป็นสองปัญหาที่หน้าตาเหมือนกันมากเวลาเปิดไลฟ์แล้วไม่มีอะไรเกิดขึ้น */
  if (hasFlag("test")) {
    const query = flagValue("test") ?? "แสงสุดท้าย bodyslam";
    log(dim(`โหมดทดสอบ — ส่ง "${query}" ไปที่ Worker`));
    await submit({ id: "test_user", name: "ทดสอบ" }, query);
    return;
  }

  if (!cfg.user) {
    die("ยังไม่ได้ใส่ TIKTOK_USER (ชื่อผู้ใช้ TikTok ที่ไลฟ์ ไม่ต้องมี @)");
  }
  log(`กำลังต่อกับไลฟ์ของ @${cfg.user}`);

  const conn = await run();

  /* หลุดกลางคันแล้วต่อใหม่ — เน็ตสะดุดตอนไลฟ์เป็นเรื่องปกติ
     ถ้าไม่ต่อใหม่ให้ สตรีมเมอร์จะไม่รู้เลยว่าคำขอเพลงหยุดเข้ามาตั้งแต่เมื่อไหร่ */
  const reconnect = async (label) => {
    log(yellow(`○ ${label} — จะลองต่อใหม่`));
    await sleep(5000);
    await run().catch((e) => log(red("✗"), briefly(e)));
  };

  conn.on("disconnected", () => void reconnect("หลุดจากไลฟ์"));
  conn.on("streamEnd", () => void reconnect("ไลฟ์จบแล้ว"));
  // ไลบรารีโยน error ระหว่างทางได้ ถ้าไม่ดักไว้ process จะตายทั้งตัว
  conn.on("error", (e) => log(dim(`(ไลบรารีแจ้ง: ${briefly(e)})`)));

  const bye = () => {
    log("ปิดสะพาน");
    try {
      conn.disconnect();
    } catch {
      /* ปิดไม่ลงก็ไม่เป็นไร กำลังจะออกอยู่แล้ว */
    }
    process.exit(0);
  };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}

/* เริ่มทำงานเฉพาะตอนถูกเรียกเป็นโปรแกรม ไม่ใช่ตอนถูก import
   เปิดช่องไว้ให้เทสต์เรียกตัวอ่านข้อความมาลองได้โดยไม่ต้องต่อ TikTok จริง */
const runAsProgram =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (runAsProgram) main().catch((e) => die(briefly(e)));

export { parse, readUser, cfg };
