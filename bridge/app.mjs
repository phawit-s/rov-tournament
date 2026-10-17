/**
 * โปรแกรมสะพานแชท TikTok → คิวเพลง สำหรับแจกสตรีมเมอร์
 * ------------------------------------------------------------------
 * build เป็น kiew-bridge.exe ไฟล์เดียวด้วย build/build-exe.mjs (Node Single Executable)
 * สตรีมเมอร์ไม่ต้องลง Node ไม่ต้องแก้ .env ไม่ต้องพิมพ์คำสั่ง:
 *
 *   ดับเบิลคลิก → เบราว์เซอร์เปิดหน้าตั้งค่า → วางรหัสเชื่อมต่อจากสตูดิโอ → จบ
 *
 * ทำไมหน้าตาอยู่ในเบราว์เซอร์ ไม่ทำหน้าต่างโปรแกรมเอง
 *   หน้าต่างจริง (Electron/Tauri) ทำให้ไฟล์ใหญ่ขึ้นหลายเท่าและต้องมีตัว build แยก
 *   ส่วนจอดำของ Windows วาดภาษาไทยไม่ได้ในหลายเครื่อง — เบราว์เซอร์ทำทั้งสองอย่างได้ฟรี
 *   หน้าเว็บนี้ฟังแค่ 127.0.0.1 เครื่องอื่นในบ้าน/ร้านเน็ตเข้าไม่ได้
 *
 * ปิดหน้าต่างจอดำ = ปิดโปรแกรม (หน้าเว็บปิดได้ตามสบาย โปรแกรมยังทำงานต่อ)
 * เปิดซ้ำตอนที่เปิดอยู่แล้ว = แค่เปิดหน้าเว็บของตัวที่รันอยู่ ไม่ได้ฟังแชทซ้อนสองตัว
 *
 * ตั้งค่าเก็บที่ %APPDATA%\kiew-bridge\config.json
 * แฟล็ก --background = เปิดตอนล็อกอิน Windows ไม่ต้องเด้งเบราว์เซอร์
 * ------------------------------------------------------------------ */

import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DEFAULT_COMMANDS, briefly, createBridge } from "./core.mjs";
import { PAGE } from "./app-page.mjs";
import pkg from "./package.json" with { type: "json" };

const VERSION = pkg.version;
const PORT = 47821;
const HOME = `http://127.0.0.1:${PORT}`;
/* กันเว็บอื่นสั่งโปรแกรมผ่านเบราว์เซอร์ของสตรีมเมอร์
   Host ต้องเป็นของเรา (กัน DNS rebinding) และ POST ต้องมาจากหน้าของเราเอง (กัน CSRF) */
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

const BACKGROUND = process.argv.includes("--background");
const DIR = join(process.env.APPDATA || join(homedir(), ".config"), "kiew-bridge");
const CONFIG = join(DIR, "config.json");
/** ปุ่ม "ส่งเพลงทดสอบ" — ลิงก์ไม่กินโควตาค้นหา YouTube */
const TEST_LINK = "https://youtu.be/dQw4w9WgXcQ";
const TIKTOK_USER = /^[A-Za-z0-9._]{2,24}$/;

/* ------------------------------------------------------------------ *
 * รหัสเชื่อมต่อ — สตูดิโอสร้าง (components/widget/ChatBridgePanel.tsx)
 * "kiew1." + base64url(JSON { w ลิงก์ Worker, c ไอดีช่อง, h handle, t ชื่อ TikTok, k กุญแจต่อช่อง })
 * ------------------------------------------------------------------ */

export function decodeCode(raw) {
  const text = String(raw ?? "").replace(/\s+/g, "");
  if (!text.startsWith("kiew1.")) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(text.slice(6), "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const ok =
    typeof data?.w === "string" &&
    /^https:\/\/[^\s/]+/.test(data.w) &&
    typeof data.c === "string" &&
    data.c.length > 0 &&
    typeof data.k === "string" &&
    /^k1\.\d{1,6}\.[A-Za-z0-9_-]{32}$/.test(data.k);
  if (!ok) return null;
  return {
    code: text,
    workerUrl: data.w.replace(/\/+$/, ""),
    channelId: data.c,
    handle: typeof data.h === "string" ? data.h : "",
    tiktokUser: typeof data.t === "string" ? data.t.replace(/^@/, "") : "",
    key: data.k,
  };
}

/* ------------------------------------------------------------------ *
 * ตั้งค่า
 * ------------------------------------------------------------------ */

function loadConfig() {
  try {
    const c = JSON.parse(readFileSync(CONFIG, "utf8"));
    return c && typeof c === "object" ? c : {};
  } catch {
    return {};
  }
}

function saveConfig(next) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(CONFIG, JSON.stringify(next, null, 2));
}

let config = loadConfig();

/* ------------------------------------------------------------------ *
 * สะพาน + สิ่งที่เกิดขึ้น (หน้าเว็บดึงไปโชว์)
 * ------------------------------------------------------------------ */

const events = [];
let status = { state: "setup", text: "ยังไม่ได้ตั้งค่า", at: Date.now() };
/** ปัญหาการตั้งค่าล่าสุด — ค้างไว้บนหน้าจนกว่าจะมีคำขอผ่าน จะได้ไม่หลุดหายไปกับรายการ */
let problem = null;
let bridge = null;
/** นับรุ่นของสะพาน — ตัวเก่าที่ถูกสั่งหยุดอาจยังส่งข่าวมาอีกนิด ต้องไม่ทับสถานะของตัวใหม่ */
let generation = 0;

const time = (d) => new Date(d).toLocaleTimeString("th-TH", { hour12: false });

function record(e) {
  const at = e.at instanceof Date ? e.at.getTime() : Date.now();
  if (e.kind === "status") {
    status = { state: e.state, text: e.text, detail: e.detail ?? null, at };
    if (!e.loud) return;
  }
  if (e.kind === "setup") problem = { text: e.text, at };
  if (e.kind === "ok") problem = null;
  events.push({ at, kind: e.kind, state: e.state ?? null, text: e.text, detail: e.detail ?? null });
  if (events.length > 200) events.splice(0, events.length - 200);
  // จอดำมีไว้ดูคร่าวๆ — ข้อมูลเต็มอยู่ในหน้าเว็บ
  console.log(`[${time(at)}] ${e.text}${e.detail ? ` · ${e.detail}` : ""}`);
}

function currentSetup() {
  const info = decodeCode(config.code);
  const user = String(config.tiktokUser ?? "").replace(/^@/, "");
  return info && TIKTOK_USER.test(user) ? { info, user } : null;
}

function startBridge() {
  bridge?.stop();
  bridge = null;
  problem = null;
  const mine = ++generation;
  const setup = currentSetup();
  if (!setup) {
    status = { state: "setup", text: "ยังไม่ได้ตั้งค่า", at: Date.now() };
    return;
  }
  bridge = createBridge(
    {
      user: setup.user,
      workerUrl: setup.info.workerUrl,
      token: setup.info.key,
      channel: setup.info.channelId,
      commands: DEFAULT_COMMANDS,
      cooldown: Number.isFinite(config.cooldown) ? config.cooldown : 45,
      signKey: typeof config.signKey === "string" ? config.signKey : "",
    },
    (e) => {
      if (mine === generation) record(e);
    },
  );
  bridge.start().catch((e) => {
    if (mine === generation) record({ kind: "error", text: briefly(e) });
  });
}

/* ------------------------------------------------------------------ *
 * เปิดเองตอนล็อกอิน Windows — คีย์ Run ของผู้ใช้ (HKCU) แบบที่โปรแกรมทั่วไปใช้
 * ไม่ต้องใช้สิทธิ์ admin ปิดได้จากหน้าเว็บหรือจาก Task Manager → Startup
 * ------------------------------------------------------------------ */

const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const RUN_NAME = "KiewBridge";
const canAutostart = process.platform === "win32";
let autostart = false;

const run = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (err, stdout) => resolve({ ok: !err, stdout }));
  });

/** คำสั่งที่จะให้ Windows เรียกตอนล็อกอิน — ย่อหน้าต่างไว้ ไม่บังจอ */
function launchCommand() {
  // ตัว .exe คือ process.execPath เอง · ตอนพัฒนา (node app.mjs) ต้องบอกไฟล์สคริปต์ด้วย
  const packaged = !/^node(\.exe)?$/i.test(basename(process.execPath));
  const target = packaged
    ? `"${process.execPath}"`
    : `"${process.execPath}" "${process.argv[1]}"`;
  return `cmd.exe /c start "" /min ${target} --background`;
}

async function readAutostart() {
  if (!canAutostart) return false;
  const r = await run("reg.exe", ["query", RUN_KEY, "/v", RUN_NAME]);
  autostart = r.ok;
  return autostart;
}

async function setAutostart(on) {
  if (!canAutostart) throw new Error("เปิดเองตอนเปิดเครื่องได้เฉพาะบน Windows");
  const r = on
    ? await run("reg.exe", ["add", RUN_KEY, "/v", RUN_NAME, "/t", "REG_SZ", "/d", launchCommand(), "/f"])
    : await run("reg.exe", ["delete", RUN_KEY, "/v", RUN_NAME, "/f"]);
  await readAutostart();
  if (!r.ok && autostart !== on) throw new Error("ตั้งค่าไม่สำเร็จ");
}

function openBrowser(url) {
  if (process.platform === "win32") execFile("cmd.exe", ["/c", "start", "", url], { windowsHide: true });
  else if (process.platform === "darwin") execFile("open", [url]);
  else execFile("xdg-open", [url]);
}

/* ------------------------------------------------------------------ *
 * หน้าเว็บกับ API
 * ------------------------------------------------------------------ */

function snapshot() {
  const info = decodeCode(config.code);
  return {
    app: "kiew-bridge",
    version: VERSION,
    configured: !!currentSetup(),
    channel: info ? { id: info.channelId, handle: info.handle } : null,
    tiktokUser: config.tiktokUser ?? "",
    status,
    problem,
    events: events.slice(-80),
    autostart,
    canAutostart,
    commands: DEFAULT_COMMANDS,
  };
}

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    // หน้าเราเรียกแค่ตัวเอง ไม่ให้ฝังในเว็บอื่น
    "X-Frame-Options": "DENY",
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 16_384) {
        reject(new Error("ข้อมูลใหญ่เกินไป"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("ข้อมูลไม่ใช่ JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handlePost(path, body) {
  switch (path) {
    case "/api/setup": {
      // เว้นช่องรหัสไว้ = เปลี่ยนแค่ชื่อ TikTok ใช้รหัสเดิม
      const info = decodeCode(String(body.code ?? "").trim() || config.code);
      if (!info) return { ok: false, error: "รหัสเชื่อมต่อไม่ถูกต้อง — คัดลอกใหม่จากสตูดิโอให้ครบทั้งก้อน" };
      const user = String(body.tiktokUser || info.tiktokUser || "").trim().replace(/^@/, "");
      if (!TIKTOK_USER.test(user)) {
        return { ok: false, error: "ชื่อ TikTok ไม่ถูกต้อง — ใช้ชื่อในลิงก์ tiktok.com/@ชื่อ" };
      }
      config = { ...config, code: info.code, tiktokUser: user };
      saveConfig(config);
      events.length = 0;
      startBridge();
      return { ok: true };
    }
    case "/api/test": {
      if (!bridge) return { ok: false, error: "ยังไม่ได้ตั้งค่า" };
      const data = await bridge.submit({ id: "test_user", name: "ทดสอบ" }, TEST_LINK);
      return { ok: !!data?.ok };
    }
    case "/api/autostart":
      await setAutostart(body.on === true);
      return { ok: true, autostart };
    case "/api/quit":
      setTimeout(() => {
        bridge?.stop();
        process.exit(0);
      }, 300);
      return { ok: true };
    default:
      return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (!HOSTS.has(req.headers.host ?? "")) return send(res, 403, { error: "forbidden" });
    const path = new URL(req.url ?? "/", HOME).pathname;

    if (req.method === "GET") {
      if (path === "/") return send(res, 200, PAGE, "text/html; charset=utf-8");
      if (path === "/api/state") return send(res, 200, snapshot());
      if (path === "/api/ping") return send(res, 200, { app: "kiew-bridge", version: VERSION });
      return send(res, 404, { error: "not found" });
    }

    if (req.method !== "POST") return send(res, 405, { error: "method not allowed" });
    if (!ORIGINS.has(req.headers.origin ?? "")) return send(res, 403, { error: "forbidden" });
    if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
      return send(res, 415, { error: "json only" });
    }
    const out = await handlePost(path, await readJson(req));
    return out ? send(res, 200, out) : send(res, 404, { error: "not found" });
  } catch (e) {
    return send(res, 500, { ok: false, error: briefly(e) });
  }
});

/* ------------------------------------------------------------------ *
 * เริ่ม
 * ------------------------------------------------------------------ */

// ไลบรารีของ TikTok โยน error แบบไม่มีใครรับได้เป็นครั้งคราว — จดไว้แล้วทำงานต่อ ไม่ให้โปรแกรมดับกลางไลฟ์
process.on("uncaughtException", (e) => record({ kind: "error", text: `(ไม่คาดคิด) ${briefly(e)}` }));
process.on("unhandledRejection", (e) => record({ kind: "error", text: `(ไม่คาดคิด) ${briefly(e)}` }));

server.on("error", async (e) => {
  if (e?.code !== "EADDRINUSE") {
    console.error(`Cannot start: ${briefly(e)}`);
    setTimeout(() => process.exit(1), 60_000);
    return;
  }
  // มีตัวที่เปิดอยู่แล้ว — แค่เปิดหน้าของตัวนั้นให้ ไม่ฟังแชทซ้อน (ซ้อน = คำขอเข้าคิวสองรอบ)
  const other = await fetch(`${HOME}/api/ping`)
    .then((r) => r.json())
    .catch(() => null);
  if (other?.app === "kiew-bridge") {
    console.log("Kiew Bridge is already running. Opening its page...");
    if (!BACKGROUND) openBrowser(HOME);
    setTimeout(() => process.exit(0), 1500);
    return;
  }
  console.error(`Port ${PORT} is used by another program. Close it and try again.`);
  setTimeout(() => process.exit(1), 60_000);
});

server.listen(PORT, "127.0.0.1", async () => {
  /* หัวจอดำเป็นภาษาอังกฤษ — จอดำของ Windows หลายเครื่องวาดภาษาไทยไม่ออก
     อย่างน้อยวิธีเปิดหน้าตั้งค่าต้องอ่านออกเสมอ (บรรทัดเหตุการณ์ต่อจากนี้เป็นไทย ดูชัดในหน้าเว็บ) */
  console.log(`Kiew Bridge ${VERSION} - TikTok chat -> song queue`);
  console.log(`Settings and status: ${HOME}`);
  console.log("Keep this window open while you are live. Close it to stop.\n");
  await readAutostart();
  startBridge();
  if (!BACKGROUND) openBrowser(HOME);
});
