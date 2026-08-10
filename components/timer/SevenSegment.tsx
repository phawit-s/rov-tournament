/**
 * ตัวเลขเจ็ดขีดแบบนาฬิกาดิจิทัล
 *
 * วาดเป็น SVG เอง ไม่ใช้ฟอนต์ เพราะฟอนต์ 7-segment ที่โหลดฟรีได้มักไม่มีสิทธิ์
 * ใช้เชิงพาณิชย์ และที่สำคัญกว่าคือฟอนต์วาดได้แต่ "ขีดที่ติด" — ส่วนที่ทำให้
 * มันอ่านเป็นนาฬิกาดิจิทัลจริงๆ คือ "ขีดที่ดับ" ที่ยังเห็นจางๆ อยู่ข้างหลัง
 * (เลข 1 บนจอ LED จริงยังเห็นโครงเลข 8 จางๆ อยู่เสมอ)
 *
 * ทุกอย่างเป็นรูปนิ่ง ไม่มีแอนิเมชัน — widget ตัวนี้ค้างบนจอทั้งไลฟ์บนเครื่อง
 * ที่เข้ารหัสวิดีโออยู่ ขีดที่เปลี่ยนคือ fill ของ path ซึ่งเบราว์เซอร์วาดใหม่
 * เฉพาะตอนตัวเลขเปลี่ยนจริง ไม่ใช่ทุกเฟรม
 */

/** ขีดที่ต้องติดของแต่ละตัวเลข — a บน, b ขวาบน, c ขวาล่าง, d ล่าง, e ซ้ายล่าง, f ซ้ายบน, g กลาง */
const MAP: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abdeg",
  "3": "abcdg",
  "4": "bcfg",
  "5": "acdfg",
  "6": "acdefg",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
};

/** แท่งนอน — หกเหลี่ยมปลายตัดเฉียง เหมือนหลอดบนจอ LED จริง */
function hBar(y: number): string {
  return `11,${y} 89,${y} 98,${y + 9} 89,${y + 18} 11,${y + 18} 2,${y + 9}`;
}

/** แท่งตั้ง สูง 81 หน่วย */
function vBar(x: number, y: number): string {
  return `${x},${y + 11} ${x + 9},${y + 2} ${x + 18},${y + 11} ${x + 18},${y + 70} ${x + 9},${y + 79} ${x},${y + 70}`;
}

const SEGMENTS: Record<string, string> = {
  a: hBar(0),
  g: hBar(81),
  d: hBar(162),
  f: vBar(0, 0),
  b: vBar(82, 0),
  e: vBar(0, 81),
  c: vBar(82, 81),
};

function Digit({
  char,
  color,
  ghost,
}: {
  char: string;
  color: string;
  ghost: number;
}) {
  const on = MAP[char] ?? "";
  return (
    <svg
      viewBox="0 0 100 180"
      className="block h-full w-auto"
      style={{ aspectRatio: "100 / 180" }}
      aria-hidden
    >
      {Object.entries(SEGMENTS).map(([key, points]) => {
        const lit = on.includes(key);
        return (
          <polygon
            key={key}
            points={points}
            fill={color}
            opacity={lit ? 1 : ghost}
            style={lit ? { filter: `drop-shadow(0 0 6px ${color}aa)` } : undefined}
          />
        );
      })}
    </svg>
  );
}

/** จุดคู่ของเครื่องหมาย : — กว้างแค่ครึ่งเดียวของตัวเลข */
function Colon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 180" className="block h-full w-auto" aria-hidden>
      {[58, 122].map((cy) => (
        <circle
          key={cy}
          cx="20"
          cy={cy}
          r="10"
          fill={color}
          style={{ filter: `drop-shadow(0 0 6px ${color}aa)` }}
        />
      ))}
    </svg>
  );
}

/**
 * นาฬิกาเจ็ดขีด — รับข้อความที่จัดรูปแล้ว ("12:34" หรือ "1:02:05")
 *
 * ความสูงคุมด้วย height เป็น rem แล้วให้ตัวเลขกว้างตามสัดส่วนเอง
 * จะได้ไม่ต้องคำนวณความกว้างรวมเองทุกครั้งที่จำนวนหลักเปลี่ยน (ข้ามชั่วโมง)
 */
export default function SevenSegment({
  text,
  color,
  height,
  ghost = 0.08,
}: {
  text: string;
  color: string;
  /** ความสูงของตัวเลขเป็น rem */
  height: number;
  /** ความจางของขีดที่ดับ — 0 = ไม่โชว์เลย */
  ghost?: number;
}) {
  return (
    <div
      className="flex items-center"
      style={{ height: `${height}rem`, gap: `${height * 0.06}rem` }}
    >
      {text.split("").map((ch, i) =>
        ch === ":" ? (
          <Colon key={i} color={color} />
        ) : (
          <Digit key={i} char={ch} color={color} ghost={ghost} />
        ),
      )}
    </div>
  );
}
