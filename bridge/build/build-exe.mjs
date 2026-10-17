/**
 * สร้าง kiew-bridge.exe — โปรแกรมไฟล์เดียวที่แจกสตรีมเมอร์ (ไม่ต้องลง Node)
 *
 *   npm run build:exe     → dist/kiew-bridge.exe + dist/kiew-bridge-windows.zip
 *
 * ใช้ Node Single Executable Application (มีใน Node 20 ขึ้นไป):
 *   1. esbuild รวม app.mjs กับไลบรารีทั้งหมดเป็นไฟล์ CommonJS ไฟล์เดียว
 *      (SEA รันได้แค่สคริปต์เดียวและ require ได้แค่โมดูลในตัว Node)
 *   2. node --experimental-sea-config ทำ blob จากไฟล์นั้น
 *   3. คัดลอก node.exe ที่รันสคริปต์นี้อยู่ แล้วฝัง blob ลงไปด้วย postject
 *
 * Node ตัวที่ใช้ build คือ Node ที่อยู่ในโปรแกรม — build ด้วย Node 22 LTS เสมอ (ดู workflow)
 * ได้ไฟล์ใหญ่ราว 80 MB (คือ node.exe ทั้งตัว) zip แล้วเหลือราวหนึ่งในสาม
 *
 * ไม่ได้เซ็นโปรแกรม Windows จึงเตือน SmartScreen ตอนเปิดครั้งแรก — สตูดิโอบอกวิธีกดผ่านไว้แล้ว
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inject } from "postject";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "dist");
const win = process.platform === "win32";
const EXE = join(OUT, win ? "kiew-bridge.exe" : "kiew-bridge");
const BUNDLE = join(OUT, "app.cjs");
const BLOB = join(OUT, "sea-prep.blob");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/* 1. รวมเป็นไฟล์เดียว
   bufferutil / utf-8-validate เป็นตัวเร่งเสริมของ ws ที่ไม่ได้ติดตั้ง — ws require แบบลองดู
   (มีก็ใช้ ไม่มีก็ไม่เป็นไร) ต้องปล่อยเป็น external ไม่งั้น esbuild หาไม่เจอแล้วล้ม */
await build({
  entryPoints: [join(ROOT, "app.mjs")],
  outfile: BUNDLE,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["bufferutil", "utf-8-validate"],
  legalComments: "none",
  logLevel: "warning",
});

/* 2. blob */
const seaConfig = join(OUT, "sea-config.json");
writeFileSync(
  seaConfig,
  JSON.stringify({ main: BUNDLE, output: BLOB, disableExperimentalSEAWarning: true }),
);
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

/* 3. ฝังลง node.exe สำเนา */
copyFileSync(process.execPath, EXE);
await inject(EXE, "NODE_SEA_BLOB", readFileSync(BLOB), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  machoSegmentName: process.platform === "darwin" ? "NODE_SEA" : undefined,
});

/* 4. zip ไว้แจก — tar ของ Windows 10 ขึ้นไป (bsdtar) ทำ zip ได้ ไม่ต้องพึ่ง PowerShell
      ที่เขียน path แบบ backslash · ค่าปริยายของมันคือเก็บเฉยๆ ไม่บีบ ต้องสั่ง deflate เอง
      ต้องชี้ไปที่ตัวใน System32 ตรงๆ — รันจาก Git Bash แล้ว "tar.exe" คือ GNU tar ของ Git
      ซึ่งทำ zip ไม่เป็น (ได้ไฟล์ tar ที่ตั้งชื่อว่า .zip แตกบน Windows ไม่ออก) */
if (win) {
  const tar = join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  const args = ["-a", "-c", "-f", "kiew-bridge-windows.zip", "--options", "zip:compression=deflate"];
  execFileSync(tar, [...args, "kiew-bridge.exe"], {
    cwd: OUT,
    stdio: "inherit",
  });
}

const mb = (f) => `${(statSync(f).size / 1024 / 1024).toFixed(1)} MB`;
console.log(`\n✓ ${EXE} (${mb(EXE)})`);
if (win) console.log(`✓ ${join(OUT, "kiew-bridge-windows.zip")} (${mb(join(OUT, "kiew-bridge-windows.zip"))})`);
