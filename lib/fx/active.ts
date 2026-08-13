/**
 * บอกว่าของตกแต่งชิ้นหนึ่ง "ควรวาดอยู่ไหม"
 *
 * ควรวาดก็ต่อเมื่อสองอย่างจริงพร้อมกัน: มันอยู่ในจอ และแท็บไม่ได้ถูกซ่อน
 * ที่ต้องมีเพราะลูป requestAnimationFrame ไม่สนใจทั้งสองเรื่องเลย — แคนวาส
 * ที่เลื่อนพ้นจอไปแล้วก็ยังวาดต่อเต็มอัตราเหมือนตอนอยู่กลางจอ
 *
 * เรื่องแท็บถูกซ่อนสำคัญเป็นพิเศษกับเว็บนี้ เพราะหน้า widget ถูกเปิดค้างไว้
 * ใน OBS เป็นซีนที่ยังไม่ได้ออกอากาศ ซึ่ง OBS เรนเดอร์ต่อแม้ไม่ได้แสดงผล
 * เท่ากับเผาซีพียูของเครื่องที่กำลังเข้ารหัสวิดีโออยู่ทิ้งเปล่าๆ ทั้งไลฟ์
 *
 * เผื่อขอบไว้ 200px เพื่อให้ของเริ่มขยับก่อนเลื่อนมาถึงจริง ไม่ให้เห็นภาพ
 * "หยุดนิ่งแล้วค่อยกระตุกเริ่มเดิน" ตอนเลื่อนหน้าลงมา
 */
export function watchActive(el: Element, onChange: (active: boolean) => void) {
  let inView = true;
  let shown = typeof document === "undefined" || !document.hidden;
  let last: boolean | null = null;

  const push = () => {
    const now = inView && shown;
    if (now === last) return;
    last = now;
    onChange(now);
  };

  const io = new IntersectionObserver(
    (entries) => {
      inView = entries[entries.length - 1]!.isIntersecting;
      push();
    },
    { rootMargin: "200px" },
  );
  io.observe(el);

  const onVisibility = () => {
    shown = !document.hidden;
    push();
  };
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    io.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
