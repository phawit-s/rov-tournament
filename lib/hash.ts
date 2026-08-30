/**
 * เครื่องมืออ่าน/ซ่อม #hash ของ URL
 *
 * เว็บนี้เก็บ "กำลังดูอะไรอยู่" ไว้ใน hash ทั้งเว็บ (#h=ชื่อช่อง, #ch=รหัสช่อง,
 * #c= #tab= ในสตูดิโอ, #s= #r= ของลิงก์แชร์) เพราะ export เป็นไฟล์นิ่ง
 * ไม่มีเซิร์ฟเวอร์ให้ทำเส้นทางแบบไดนามิก
 *
 * ปัญหาคือ Next 16 ต่อ hash ของลิงก์ใหม่เข้ากับที่อยู่เดิมที่มันจำไว้
 * (segment-cache/navigation.js: `route.canonicalUrl + url.hash`) และที่อยู่ที่จำ
 * ไว้นั้นถูกบันทึกตั้งแต่ตอนโหลดหน้าแรกทั้งก้อน — hash ที่ติดมาด้วย
 * เปิด /song/#h=aaa มาตรงๆ (สแกน QR จากไลฟ์) แล้วกดลิงก์ไปช่องอื่นในเว็บ
 * ที่อยู่จึงกลายเป็น /song/#h=aaa#h=bbb แล้วงอกเพิ่มทุกครั้งที่กด
 *
 * แก้สองชั้น: อ่านให้ถูกเสมอ (liveHash) และล้างที่อยู่ให้สะอาด (repairDuplicatedHash)
 */

/**
 * hash ที่ใช้จริง — เอาเฉพาะก้อนหลัง # ตัวสุดท้าย และตัด # นำหน้าออกแล้ว
 *
 * ยึดก้อนท้ายเพราะก้อนท้ายคือลิงก์ที่ผู้ใช้เพิ่งกด ส่วนก้อนหน้าคือเศษที่ Next
 * ต่อไว้จากหน้าเดิม — เอาก้อนแรกเมื่อไหร่คือพาไปช่องที่เขาไม่ได้กด
 */
export function liveHash(): string {
  if (typeof window === "undefined") return "";
  const raw = window.location.hash;
  return raw.slice(raw.lastIndexOf("#") + 1);
}

/** อ่านค่าตัวเดียวจาก hash เช่น readLiveHashParam("h") จาก #h=affarain&x=1 */
export function readLiveHashParam(name: string): string | null {
  const match = liveHash().match(new RegExp(`(^|&)${name}=([^&]+)`));
  return match ? match[2] : null;
}

/**
 * ล้าง hash ที่ซ้อนกันให้เหลือก้อนเดียว โดยไม่เพิ่มประวัติย้อนกลับ
 *
 * ใช้ replaceState ตรงๆ ไม่ใช่ location.hash เพราะต้องลบก้อนหน้าทิ้ง ไม่ใช่ต่อท้าย
 * และตัว router ของ Next ดักจับ replaceState ไว้อยู่แล้ว ที่อยู่ในสถานะภายใน
 * ของมันจึงถูกแก้ตามไปด้วย
 */
export function repairDuplicatedHash(): void {
  if (typeof window === "undefined") return;
  const { hash, pathname, search } = window.location;
  // มี # มากกว่าหนึ่งตัวเท่านั้นที่ผิดปกติ นอกนั้นอย่าไปยุ่งกับที่อยู่ของเขา
  if (hash.indexOf("#", 1) < 0) return;
  const fixed = hash.slice(hash.lastIndexOf("#"));
  history.replaceState(null, "", `${pathname}${search}${fixed}`);
}
