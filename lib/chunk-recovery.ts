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
 * กันวนไม่จบด้วยการจำ "เวลาที่ลองล่าสุด" ไม่ใช่แค่ธงเปิด/ปิด
 *
 * เคยเขียนเป็นธงแล้วล้างทิ้งตอนหน้าโหลดเสร็จ ซึ่งผิด — หน้าที่ไฟล์หายก็ยิง load
 * ได้เหมือนกัน (เฟรมเวิร์กโหลดผ่าน แต่ไฟล์ของหน้านั้นหาย) พอล้างธงแล้วเจอ error
 * อีกตัวก็สั่งโหลดใหม่ซ้ำ วนไม่จบจนเว็บกระพริบทั้งวัน — ทดสอบแล้วเจอจริง
 *
 * เก็บเป็นเวลาแทน จึงลองใหม่ได้อย่างมากรอบละ 10 นาทีต่อแท็บ
 * พอกู้หลัง deploy และวนไม่ได้ไม่ว่าจะพังแบบไหน
 */
export const CHUNK_RECOVERY_SCRIPT = `
(function () {
  var KEY = "rov/chunk-retry-at";
  var COOLDOWN = 600000;
  // ต้องดักแบบ capture — error ของ <script>/<link> ไม่ลอยขึ้นมาถึง window
  window.addEventListener(
    "error",
    function (e) {
      var el = e && e.target;
      if (!el || (el.tagName !== "SCRIPT" && el.tagName !== "LINK")) return;
      var url = el.src || el.href || "";
      if (url.indexOf("/_next/") < 0) return;

      var now = Date.now();
      try {
        var last = Number(sessionStorage.getItem(KEY) || 0);
        if (now - last < COOLDOWN) return;
        sessionStorage.setItem(KEY, String(now));
      } catch (err) {
        // เขียนที่เก็บไม่ได้ (โหมดส่วนตัว) = กันวนไม่ได้ ไม่ต้องโหลดใหม่ดีกว่า
        return;
      }

      try {
        var u = new URL(window.location.href);
        u.searchParams.set("_r", now.toString(36));
        window.location.replace(u.toString());
      } catch (err2) {
        window.location.reload();
      }
    },
    true,
  );
})();
`.trim();
