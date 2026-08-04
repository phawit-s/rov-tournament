/**
 * กู้หน้าที่บูตไม่ขึ้นเพราะไฟล์โค้ดของ deploy รอบก่อนหายไปแล้ว
 *
 * ปัญหา: เว็บเป็น static export ไฟล์ js ตั้งชื่อตามแฮชของเนื้อไฟล์ พอ deploy ใหม่
 * ไฟล์ชุดเก่าจะถูกลบออกจาก GitHub Pages ทันที แต่ HTML ถูกแคชไว้ 10 นาที
 * (วัดจากของจริง: cache-control: max-age=600 ทั้งไฟล์ HTML และไฟล์ js
 *  และชื่อไฟล์ของรอบก่อนคืน 404 แล้ว)
 *
 * เครื่องที่ถือ HTML เก่าไว้จึงไปขอไฟล์ที่ไม่มีอยู่แล้ว โหลดไม่ได้ แอปไม่บูตเลย
 * ผลคือ "จอว่างสนิท" ไม่มี error ให้เห็น ไม่มีอะไรบอก — และเป็นเฉพาะบางเครื่อง
 * ตามว่าใครแคชไว้ตอนไหน ส่วน OBS แคชนานกว่าเบราว์เซอร์มากจนค้างได้ยาวๆ
 *
 * วิธีแก้: ดักตอนไฟล์โหลดไม่ได้ แล้วโหลดหน้าใหม่พร้อมพารามิเตอร์กันแคช
 * ทำให้เครื่องนั้นได้ HTML ชุดใหม่ที่ชี้ไปไฟล์ที่มีอยู่จริง
 *
 * กันวนไม่จบด้วย sessionStorage — ลองใหม่ได้ครั้งเดียวต่อแท็บ
 * ถ้าโหลดสำเร็จค่อยล้างธงทิ้ง เพื่อให้ deploy รอบหน้ายังกู้ตัวเองได้อีก
 */
export const CHUNK_RECOVERY_SCRIPT = `
(function () {
  var KEY = "rov/chunk-retry";
  function retried() {
    try { return sessionStorage.getItem(KEY) === "1"; } catch (e) { return true; }
  }
  function mark() {
    try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
  }
  // ต้องดักแบบ capture — error ของ <script>/<link> ไม่ลอยขึ้นมาถึง window
  window.addEventListener(
    "error",
    function (e) {
      var el = e && e.target;
      if (!el || (el.tagName !== "SCRIPT" && el.tagName !== "LINK")) return;
      var url = el.src || el.href || "";
      if (url.indexOf("/_next/") < 0) return;
      if (retried()) return;
      mark();
      try {
        var u = new URL(window.location.href);
        u.searchParams.set("_r", Date.now().toString(36));
        window.location.replace(u.toString());
      } catch (err) {
        window.location.reload();
      }
    },
    true,
  );
  // บูตผ่านแล้ว = ล้างธง คราวหน้าถ้าเจออีกจะได้ลองใหม่ได้
  window.addEventListener("load", function () {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
  });
})();
`.trim();
