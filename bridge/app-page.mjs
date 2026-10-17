/**
 * หน้าตั้งค่า/สถานะของโปรแกรมสะพาน — app.mjs เสิร์ฟที่ http://127.0.0.1:47821
 *
 * ไฟล์เดียวจบ ไม่โหลดอะไรจากเน็ต (ฟอนต์ใช้ของ Windows: Leelawadee UI มีไทยในตัว)
 * ข้อความจากแชทคนดูต้องใส่ด้วย textContent เสมอ ห้าม innerHTML —
 * หน้านี้สั่งโปรแกรมได้ ถ้ามีคนพิมพ์โค้ดในแชทแล้วหน้าเอาไปรันได้ = ยึดโปรแกรมได้
 */
export const PAGE = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>สะพานแชท TikTok — คิวเพลง</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #08080b; --paper: #151519; --fill: rgb(255 255 255 / .06); --line: rgb(255 255 255 / .1);
    --ink: #f4f4f6; --muted: #a1a1ad; --ok: #34d399; --warn: #fbbf24; --bad: #f87171;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.6 "Leelawadee UI", "Segoe UI", Tahoma, sans-serif; }
  main { max-width: 680px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 22px; margin: 0; }
  h2 { font-size: 17px; margin: 0 0 12px; }
  .muted { color: var(--muted); }
  .small { font-size: 14px; }
  .card { background: var(--paper); border-radius: 18px; padding: 20px; margin-top: 18px;
    box-shadow: inset 0 0 0 1px var(--line); }
  label { display: block; font-weight: 600; margin: 14px 0 6px; }
  textarea, input[type=text] { width: 100%; background: var(--fill); color: var(--ink); border: 0;
    border-radius: 12px; padding: 10px 12px; font: inherit; outline: none; box-shadow: inset 0 0 0 1px var(--line); }
  textarea { min-height: 88px; font: 13px/1.5 Consolas, monospace; resize: vertical; word-break: break-all; }
  textarea:focus, input:focus { box-shadow: inset 0 0 0 2px var(--ink); }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 16px; }
  button { font: inherit; cursor: pointer; border: 0; border-radius: 999px; min-height: 42px; padding: 0 18px; }
  button.primary { background: var(--ink); color: #000; font-weight: 600; }
  button.secondary { background: var(--fill); color: var(--ink); box-shadow: inset 0 0 0 1px var(--line); }
  button.ghost { background: none; color: var(--muted); }
  button:disabled { opacity: .45; cursor: default; }
  .pill { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 18px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); flex: none; }
  .live .dot { background: var(--ok); box-shadow: 0 0 0 4px rgb(52 211 153 / .2); }
  .retry .dot { background: var(--warn); }
  .alert { margin-top: 14px; padding: 12px 14px; border-radius: 12px; background: rgb(248 113 113 / .12);
    color: #fecaca; box-shadow: inset 0 0 0 1px rgb(248 113 113 / .35); }
  .error { color: var(--bad); margin-top: 10px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 14px 0 0; }
  dt { color: var(--muted); } dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
  ul.log { list-style: none; margin: 0; padding: 0; }
  ul.log li { display: grid; grid-template-columns: 64px 20px 1fr; gap: 6px; padding: 7px 0;
    border-top: 1px solid var(--line); font-size: 14px; }
  ul.log li:first-child { border-top: 0; }
  .t { color: var(--muted); font-variant-numeric: tabular-nums; }
  .k-ok .i { color: var(--ok); } .k-setup .i, .k-error .i { color: var(--bad); }
  .k-skip .i, .k-warn .i { color: var(--warn); } .k-ask, .k-wait, .k-info { color: var(--muted); }
  .detail { color: var(--muted); }
  code { background: var(--fill); border-radius: 6px; padding: 1px 6px; }
  [hidden] { display: none !important; }
  .switch { display: flex; gap: 10px; align-items: center; cursor: pointer; font-weight: 500; margin-top: 16px; }
  .switch input { width: 18px; height: 18px; accent-color: var(--ok); }
</style>
</head>
<body>
<main>
  <h1>สะพานแชท TikTok → คิวเพลง</h1>
  <p class="muted small" id="ver"></p>

  <section id="setup" class="card" hidden>
    <h2 id="setupTitle">เริ่มใช้งาน</h2>
    <p class="muted small">สร้างรหัสที่หน้า <b>สตูดิโอ → ลิงก์สำหรับ OBS</b> หัวข้อ “รับคำขอเพลงจากแชท TikTok” แล้วคัดลอกมาวางที่นี่</p>
    <label for="code">รหัสเชื่อมต่อ</label>
    <textarea id="code" spellcheck="false" placeholder="kiew1.…"></textarea>
    <p class="muted small" id="codeInfo"></p>
    <label for="tiktok">ชื่อ TikTok ที่ใช้ไลฟ์</label>
    <input id="tiktok" type="text" spellcheck="false" autocomplete="off" placeholder="ชื่อในลิงก์ tiktok.com/@ชื่อ">
    <p class="error" id="setupError" hidden></p>
    <div class="row">
      <button class="primary" id="save">บันทึกและเริ่ม</button>
      <button class="ghost" id="cancel" hidden>ยกเลิก</button>
    </div>
  </section>

  <section id="running" hidden>
    <div class="card">
      <div class="pill" id="pill"><span class="dot"></span><span id="statusText"></span></div>
      <p class="muted small" id="statusDetail"></p>
      <div class="alert" id="problem" hidden></div>
      <dl>
        <dt>ช่อง</dt><dd id="channel"></dd>
        <dt>TikTok</dt><dd id="tiktokShown"></dd>
        <dt>คนดูพิมพ์</dt><dd id="howto"></dd>
      </dl>
      <label class="switch" id="autoWrap"><input type="checkbox" id="auto"> เปิดเองตอนเปิดเครื่อง</label>
      <div class="row">
        <button class="secondary" id="test">ส่งเพลงทดสอบ</button>
        <button class="secondary" id="edit">เปลี่ยนรหัส / ชื่อ TikTok</button>
        <button class="ghost" id="quit">ปิดโปรแกรม</button>
      </div>
      <p class="muted small">ปิดหน้านี้ได้ โปรแกรมยังทำงานต่อจนกว่าจะปิดหน้าต่างจอดำ · ปุ่มทดสอบจะใส่เพลงเข้าคิวจริงหนึ่งเพลง (ลบทิ้งได้)</p>
    </div>
    <div class="card">
      <h2>ล่าสุด</h2>
      <ul class="log" id="log"></ul>
      <p class="muted small" id="empty">ยังไม่มีอะไรเกิดขึ้น — พอมีคนพิมพ์คำสั่งในแชท จะขึ้นที่นี่</p>
    </div>
  </section>

  <section id="gone" class="card" hidden>
    <h2>ปิดโปรแกรมแล้ว</h2>
    <p class="muted">เปิด kiew-bridge.exe ใหม่เมื่อจะไลฟ์ครั้งหน้า</p>
  </section>
</main>
<script>
  const $ = (id) => document.getElementById(id);
  let state = null;
  let editing = false;

  async function api(path, body) {
    const res = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return res.json();
  }

  /* ถอดรหัสไว้โชว์ว่าเป็นของช่องไหนก่อนกดบันทึก — ตัวจริงตรวจอีกรอบที่โปรแกรม */
  function peek(code) {
    try {
      const t = code.replace(/\\s+/g, "");
      if (!t.startsWith("kiew1.")) return null;
      const b = t.slice(6).replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(b + "===".slice((b.length + 3) % 4)), (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch { return null; }
  }

  $("code").addEventListener("input", () => {
    const d = peek($("code").value);
    $("codeInfo").textContent = !$("code").value.trim() ? "" :
      d ? "รหัสของช่อง @" + (d.h || d.c) : "รหัสไม่ครบ — คัดลอกใหม่ทั้งก้อน";
    if (d && d.t && !$("tiktok").value.trim()) $("tiktok").value = d.t;
  });

  $("save").addEventListener("click", async () => {
    $("save").disabled = true;
    $("setupError").hidden = true;
    try {
      const r = await api("/api/setup", { code: $("code").value, tiktokUser: $("tiktok").value });
      if (!r.ok) { $("setupError").textContent = r.error; $("setupError").hidden = false; return; }
      editing = false;
      $("code").value = "";
      await refresh();
    } finally { $("save").disabled = false; }
  });

  $("cancel").addEventListener("click", () => { editing = false; render(); });
  $("edit").addEventListener("click", () => {
    editing = true;
    $("tiktok").value = state ? state.tiktokUser : "";
    $("code").value = "";
    $("codeInfo").textContent = "";
    render();
  });

  $("test").addEventListener("click", async () => {
    $("test").disabled = true;
    try { await api("/api/test", {}); await refresh(); } finally { $("test").disabled = false; }
  });

  $("auto").addEventListener("change", async () => {
    const want = $("auto").checked;
    $("auto").disabled = true;
    try { await api("/api/autostart", { on: want }); await refresh(); } finally { $("auto").disabled = false; }
  });

  $("quit").addEventListener("click", async () => {
    await api("/api/quit", {}).catch(() => null);
    clearInterval(timer);
    $("setup").hidden = true; $("running").hidden = true; $("gone").hidden = false;
  });

  const ICON = { ok: "✓", skip: "–", setup: "✗", error: "✗", wait: "⏳", ask: "↳", warn: "!", status: "●", info: "·" };
  const STATUS = {
    live: "กำลังฟังแชทไลฟ์",
    waiting: "รอไลฟ์เริ่ม",
    connecting: "กำลังต่อกับไลฟ์…",
    retry: "ต่อไลฟ์ไม่ติด กำลังลองใหม่",
    setup: "ยังไม่ได้ตั้งค่า",
  };

  function render() {
    if (!state) return;
    $("ver").textContent = "รุ่น " + state.version;
    const showSetup = !state.configured || editing;
    $("setup").hidden = !showSetup;
    $("running").hidden = showSetup;
    $("cancel").hidden = !state.configured;
    $("setupTitle").textContent = state.configured ? "เปลี่ยนรหัส / ชื่อ TikTok" : "เริ่มใช้งาน";
    if (showSetup) return;

    const s = state.status;
    $("pill").className = "pill " + (s.state === "live" ? "live" : s.state === "retry" ? "retry" : "");
    $("statusText").textContent = STATUS[s.state] || s.text;
    $("statusDetail").textContent =
      s.state === "waiting" ? "ยังไม่ได้เริ่มไลฟ์ — เริ่มเมื่อไหร่ โปรแกรมต่อให้เอง (ลองล่าสุด " + new Date(s.at).toLocaleTimeString("th-TH") + ")" :
      s.state === "retry" ? s.text + (s.detail ? " · " + s.detail : "") :
      s.detail || "";
    $("problem").hidden = !state.problem;
    $("problem").textContent = state.problem ? "ตั้งค่ายังไม่ครบ: " + state.problem.text : "";
    $("channel").textContent = state.channel ? "@" + (state.channel.handle || state.channel.id) : "-";
    $("tiktokShown").textContent = "@" + state.tiktokUser;
    $("howto").textContent = state.commands[0] + " ชื่อเพลง  หรือ  " + state.commands[0] + " ลิงก์ YouTube";
    $("autoWrap").hidden = !state.canAutostart;
    $("auto").checked = state.autostart;

    const list = $("log");
    list.replaceChildren();
    for (const e of state.events.slice().reverse()) {
      const li = document.createElement("li");
      li.className = "k-" + e.kind;
      const t = document.createElement("span"); t.className = "t";
      t.textContent = new Date(e.at).toLocaleTimeString("th-TH", { hour12: false });
      const i = document.createElement("span"); i.className = "i"; i.textContent = ICON[e.kind] || "·";
      const body = document.createElement("span");
      body.textContent = e.text;
      if (e.detail) {
        const d = document.createElement("span"); d.className = "detail"; d.textContent = " · " + e.detail;
        body.append(d);
      }
      li.append(t, i, body);
      list.append(li);
    }
    $("empty").hidden = state.events.length > 0;
  }

  async function refresh() {
    try { state = await api("/api/state"); render(); }
    catch { $("statusText").textContent = "ติดต่อโปรแกรมไม่ได้ — ถูกปิดไปแล้วหรือเปล่า"; $("pill").className = "pill retry"; }
  }

  const timer = setInterval(refresh, 2000);
  refresh();
</script>
</body>
</html>
`;
