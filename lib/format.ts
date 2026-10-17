/** วันที่และเวลาแบบไทย เช่น "17 ต.ค. 2569 13:05" */
export function formatThaiDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** เวลาที่ผ่านมาแบบคนพูด เช่น "3 นาทีก่อน" — ไว้บอกว่าเพลงเข้าคิวมานานแค่ไหน */
export function timeAgo(iso?: string | null, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "เมื่อกี้";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} นาทีก่อน`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ชั่วโมงก่อน`;
  return formatThaiDate(iso);
}

/** วินาทีเป็น ม:วว เช่น 241 → "4:01" */
export function formatDuration(sec?: number | null): string {
  if (!sec || !Number.isFinite(sec) || sec < 0) return "";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
