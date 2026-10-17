/**
 * อ่าน Firestore ผ่าน REST ตรงๆ ด้วย fetch ธรรมดา — ทางสำรองของ widget
 *
 * ทำไมต้องมีทั้งที่มี SDK อยู่แล้ว
 *   SDK ฟังข้อมูลสดผ่านสายที่เปิดค้างไว้ (WebChannel) ซึ่งเบราว์เซอร์ฝังในแอปบางตัว
 *   ใช้ไม่ได้ — อาการที่เจอจริงคือ widget ใน TikTok LIVE Studio ขึ้น "ต่อฐานข้อมูลไม่ได้"
 *   ทั้งที่ลิงก์เดียวกันเปิดใน OBS / Chrome ได้ปกติ และ SDK ไม่โยน error ให้สักตัว
 *   คำขอ REST เป็น HTTPS ถาม-ตอบจบในตัว ไม่ค้างสาย ไม่พึ่งอะไรใน SDK เลย
 *   (ไม่ผ่านตัวจัดการล็อกอิน ไม่ผ่านแคช) จึงรอดในที่ที่สายสดไปไม่ถึง
 *
 * ใช้ได้เฉพาะของที่กติกาเปิดให้อ่านโดยไม่ล็อกอิน เพราะยิงแบบไม่มีโทเคน
 * ไม่ได้ส่งอะไรนอกจาก API key ของเว็บ (ตัวเดียวกับที่ฝังในหน้าเว็บอยู่แล้ว)
 */
import { firebaseConfig } from "./config";

/** ค่าตามรูปแบบ Value ของ Firestore REST — ใส่เฉพาะที่ต้องแปลง */
type RestValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  timestampValue?: string;
  stringValue?: string;
  bytesValue?: string;
  referenceValue?: string;
  geoPointValue?: { latitude: number; longitude: number };
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
};

type RestDoc = { name: string; fields?: Record<string, RestValue> };

/** ยิงไม่สำเร็จ — ข้อความสั้นพอจะโชว์บนป้ายของ widget ได้ */
export class RestError extends Error {}

/** คำขอ REST ไม่ควรค้างนานกว่านี้ ค้างแปลว่ามีอะไรขวางอยู่ */
const TIMEOUT_MS = 10_000;

function base(): string {
  return `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
}

function decode(v: RestValue): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  // SDK คืน Timestamp แต่ทุกฟิลด์เวลาของเราเก็บเป็นสตริง ISO อยู่แล้ว — ส่งสตริงต่อไปพอ
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue?.values ?? []).map(decode);
  if ("mapValue" in v) return decodeFields(v.mapValue?.fields);
  if ("referenceValue" in v) return v.referenceValue;
  if ("geoPointValue" in v) return v.geoPointValue;
  if ("bytesValue" in v) return v.bytesValue;
  return null;
}

function decodeFields(fields?: Record<string, RestValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decode(v);
  return out;
}

/** แปลงเอกสาร REST เป็นรูปเดียวกับที่ SDK ให้ ({ id, ...data }) */
function toData<T>(d: RestDoc): T {
  const id = d.name.slice(d.name.lastIndexOf("/") + 1);
  return { id, ...decodeFields(d.fields) } as T;
}

async function call(path: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${base()}/${path}${path.includes("?") ? "&" : "?"}key=${firebaseConfig.apiKey}`, {
      ...init,
      // ข้อมูลสดเสมอ — แคชของเบราว์เซอร์จะทำให้เห็นคิวเก่าค้าง
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new RestError(
      ctrl.signal.aborted ? `ไม่ตอบใน ${TIMEOUT_MS / 1000} วิ` : (e as Error).message || "ยิงไม่ออก",
    );
  } finally {
    clearTimeout(timer);
  }
}

/** อ่านเอกสารใบเดียว — ไม่มีเอกสาร = null */
export async function restGetDoc<T>(path: string): Promise<T | null> {
  const res = await call(path);
  if (res.status === 404) return null;
  if (!res.ok) throw new RestError(`HTTP ${res.status}`);
  return toData<T>((await res.json()) as RestDoc);
}

/**
 * ดึงเอกสารในคอลเลกชันย่อยที่ฟิลด์หนึ่งมีค่าอยู่ในรายการ (where field in [...])
 * parent คือเส้นทางของเอกสารแม่ เช่น "channels/abc"
 */
export async function restQueryIn<T>(
  parent: string,
  collectionId: string,
  field: string,
  values: string[],
): Promise<T[]> {
  const res = await call(`${parent}:runQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "IN",
            value: { arrayValue: { values: values.map((s) => ({ stringValue: s })) } },
          },
        },
      },
    }),
  });
  if (!res.ok) throw new RestError(`HTTP ${res.status}`);
  // ผลว่างก็ยังได้อาร์เรย์กลับมา แต่เป็นแถวที่มีแค่ readTime ไม่มี document
  const rows = (await res.json()) as { document?: RestDoc }[];
  return rows.flatMap((r) => (r.document ? [toData<T>(r.document)] : []));
}
