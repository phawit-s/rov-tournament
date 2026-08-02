"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { hasBackend } from "@/lib/backend/firebase";
import { tournamentStore } from "@/lib/tournament/store";
import { channelStore } from "@/lib/channel/store";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import { PageHeading } from "../ui/Reveal";
import { toast } from "../ui/Toast";
import { IconCopy, IconExternal } from "../ui/icons";
import { ArtShield, EmptyState, Input, Label } from "../tournament/ui";

type WidgetDef = {
  key: string;
  name: string;
  path: string;
  /** ขนาด Browser Source ที่แนะนำ ต้องตรงกับที่กราฟิกออกแบบไว้จริง */
  w: number;
  h: number;
  /**
   * widget ผูกกับอะไร — ตัวที่ผูกกับช่องต้องส่ง #ch= รหัสช่อง ไม่ใช่ #c= รหัสทัวร์
   * ใส่ผิดคีย์แล้ว widget จะเปิดมาว่างเปล่าโดยไม่ฟ้องอะไรเลย
   */
  scope: "tournament" | "channel";
  detail: string;
};

const WIDGETS: WidgetDef[] = [
  {
    key: "scoreboard",
    name: "สกอร์บอร์ด",
    path: "/widget/scoreboard/",
    w: 700,
    h: 240,
    scope: "tournament",
    detail: "ชื่อทีมสองฝั่ง เม็ดคะแนนซีรีส์ และสกอร์ อัปเดตเองเมื่อผู้จัดกรอกผล",
  },
  {
    key: "upnext",
    name: "คิวถัดไป",
    path: "/widget/upnext/",
    w: 620,
    h: 390,
    scope: "tournament",
    detail: "คิวแรกเป็นการ์ดใหญ่พร้อมนับถอยหลัง อีกสามคู่เป็นรายการเตี้ย",
  },
  {
    key: "timer",
    name: "นับถอยหลัง",
    path: "/widget/timer/",
    w: 500,
    h: 280,
    scope: "tournament",
    detail: "วงแหวนบอกเวลาที่เหลือ ใส่ ?mins=5 ทำเป็นตัวจับเวลาพักเบรกก็ได้",
  },
  {
    key: "champion",
    name: "ป้ายแชมป์",
    path: "/widget/champion/",
    w: 820,
    h: 580,
    scope: "tournament",
    detail: "หน้าไตเติลตอนจบรายการ มีทีม สมาชิก เงินรางวัล และสกอร์นัดชิง",
  },
  {
    key: "alert",
    name: "แจ้งเตือนโดเนท",
    path: "/widget/alert/",
    w: 760,
    h: 380,
    scope: "channel",
    detail: "เด้งทันทีที่สลิปผ่านการตรวจ มีเหรียญ tier และเสียงด้วย",
  },
  {
    key: "song",
    name: "เพลงที่กำลังเล่น",
    path: "/widget/song/",
    w: 620,
    h: 300,
    scope: "channel",
    detail: "ชื่อเพลงที่คนดูขอมาพร้อมคิวถัดไปอีกสามเพลง อัปเดตเองตอนกดเล่น",
  },
];

/** สีสำเร็จรูปชุดเดียวกับสีสถานะของทั้งเว็บ กดแล้วได้โทนที่เข้ากับงานแน่ๆ */
const ACCENT_PRESETS = ["e6c894", "cfa765", "6f8fd8", "4db591", "a079d8", "e0566b"];

const OBS_STEPS: ReactNode[] = [
  <>
    ในหน้าต่าง Sources กด <b>+</b> → เลือก <b>Browser</b>
    <br />
    <span className="text-muted">
      Streamlabs ใช้ชื่อเดียวกัน · TikTok LIVE Studio อยู่ที่ เพิ่มแหล่ง →{" "}
      <b>เว็บเพจ / Web page</b>
    </span>
  </>,
  <>
    วาง URL ที่คัดลอกมาในช่อง <b>URL</b> แล้วตั้ง <b>Width / Height</b>{" "}
    ตามขนาดที่แนะนำบนการ์ด
  </>,
  <>
    ปล่อยช่อง <b>Custom CSS</b> ไว้ตามค่าเริ่มต้น (
    <code className="text-xs text-champagne">
      body {`{ background-color: rgba(0,0,0,0); margin: 0; overflow: hidden; }`}
    </code>
    ) — หน้าเว็บทำพื้นโปร่งใสมาให้แล้ว
  </>,
  <>
    ติ๊ก <b>Control audio via OBS</b> ถ้าอยากได้ยินเสียงแจ้งเตือนโดเนทในสตรีม
  </>,
  <>
    อย่าติ๊ก <b>Shutdown source when not visible</b> สำหรับ widget แจ้งเตือน
    ไม่งั้นสลับซีนแล้วจะพลาดการแจ้งเตือน
  </>,
  <>
    แก้ดีไซน์แล้วภาพไม่เปลี่ยน ให้กด <b>Refresh cache of current page</b>{" "}
    ในคุณสมบัติของ source
  </>,
];

export default function WidgetBuilder() {
  const tournaments = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );
  const channel = useSyncExternalStore(
    channelStore.subscribe,
    channelStore.getSnapshot,
    channelStore.getServerSnapshot,
  );

  const [tournamentId, setTournamentId] = useState("");
  const [useCloud, setUseCloud] = useState(hasBackend);
  const [accent, setAccent] = useState("e6c894");
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  // หน่วงสีก่อนส่งเข้า iframe ไม่งั้นพิมพ์โค้ดสีทีละตัวแล้วพรีวิวรีโหลดรัวๆ
  const previewAccent = useDebounced(accent, 400);

  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";

  const selected = tournaments.find((t) => t.id === tournamentId) ?? tournaments[0];

  const makeUrl = useCallback(
    (widget: WidgetDef, accentValue: string, solid = false) => {
      const params = new URLSearchParams();
      if (accentValue && accentValue !== "e6c894") params.set("accent", accentValue);
      if (scale !== 1) params.set("scale", String(scale));
      if (solid) params.set("solid", "1");
      const query = params.toString() ? `?${params.toString()}` : "";
      const hash =
        widget.scope === "channel"
          ? channel
            ? `#ch=${channel.id}`
            : ""
          : selected
            ? `#${useCloud ? "c" : "t"}=${selected.id}`
            : "";
      return `${origin}${widget.path}${query}${hash}`;
    },
    [channel, origin, scale, selected, useCloud],
  );

  /* ตัวที่ผูกกับช่องโผล่ก็ต่อเมื่อมีช่องแล้ว ตัวที่ผูกกับทัวร์ก็ต่อเมื่อมีทัวร์
     ไม่งั้นจะแจกลิงก์ที่ไม่มีรหัสห้อยท้าย ซึ่งเปิดมาแล้วว่างเปล่า */
  const usable = WIDGETS.filter((w) =>
    w.scope === "channel" ? !!channel : tournaments.length > 0,
  );

  const copy = (url: string, key: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(key);
    toast("คัดลอกลิงก์แล้ว เอาไปวางใน Browser Source ได้เลย", "success");
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Stream widgets"
        title="Widget สำหรับ OBS / Streamlabs"
        description="ปรับสีกับขนาดแล้วเห็นผลทันทีในพรีวิว จากนั้นคัดลอกลิงก์ไปวางเป็น Browser Source พื้นหลังโปร่งใสพร้อมทับภาพเกม"
        meta={`${usable.length}/${WIDGETS.length} ตัว`}
      />

      {/* ตั้งค่า */}
      <Panel className="p-6">
        <Panel.Header eyebrow="Setup" title="ตั้งค่ากราฟิกแพ็กเกจ" />

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>ทัวร์นาเมนต์</Label>
            {tournaments.length === 0 ? (
              <p className="text-sm text-muted">ยังไม่มีทัวร์ในเครื่อง</p>
            ) : (
              <select
                value={selected?.id ?? ""}
                onChange={(e) => setTournamentId(e.target.value)}
                className="field w-full rounded-xl px-3.5 py-2.5 text-sm text-ice outline-none"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <Label hint="ใส่โค้ดสีแบบไม่มี #">สีเน้น</Label>
            <div className="flex items-center gap-2">
              {/* input type=color ให้เลือกจากจานสีจริง ส่วนช่องข้อความไว้วางโค้ดแบรนด์ */}
              <label
                className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-lg"
                style={{ background: `#${accent}` }}
              >
                <input
                  type="color"
                  value={`#${accent}`}
                  onChange={(e) => setAccent(e.target.value.replace("#", ""))}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="เลือกสีเน้น"
                />
              </label>
              <Input
                value={accent}
                onChange={(e) => setAccent(e.target.value.replace("#", "").slice(0, 6))}
                className="flex-1"
                maxLength={6}
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {ACCENT_PRESETS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  onClick={() => setAccent(hex)}
                  aria-label={`ใช้สี #${hex}`}
                  className="h-6 w-6 cursor-pointer rounded-full transition-transform hover:scale-110"
                  style={{
                    background: `#${hex}`,
                    boxShadow:
                      accent === hex
                        ? "0 0 0 2px rgb(var(--accent) / 0.9)"
                        : "inset 0 0 0 1px rgb(0 0 0 / 0.35)",
                  }}
                />
              ))}
            </div>
          </div>

          <div>
            <Label hint={`${scale.toFixed(2)}x`}>ขนาด</Label>
            <input
              type="range"
              min={0.6}
              max={2}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              style={{ ["--fill" as string]: (scale - 0.6) / 1.4 }}
              className="mt-3 w-full cursor-pointer"
            />
          </div>

          <div>
            <Label hint={hasBackend ? undefined : "ต้องเชื่อม Firebase ก่อน"}>
              แหล่งข้อมูล
            </Label>
            <div className="tile flex gap-1 rounded-xl p-1">
              <SourceBtn
                active={useCloud}
                onClick={() => setUseCloud(true)}
                disabled={!hasBackend}
              >
                คลาวด์ (สด)
              </SourceBtn>
              <SourceBtn active={!useCloud} onClick={() => setUseCloud(false)}>
                เครื่องนี้
              </SourceBtn>
            </div>
          </div>
        </div>

        {!useCloud && (
          <p className="tile mt-4 rounded-xl px-4 py-3 text-xs text-muted">
            โหมด &ldquo;เครื่องนี้&rdquo; อ่านข้อมูลจาก localStorage ซึ่ง OBS
            มีพื้นที่เก็บของตัวเองแยกจากเบราว์เซอร์ปกติ — widget จะไม่เห็นข้อมูล
            ถ้าจะใช้กับ OBS จริงต้องเลือกโหมดคลาวด์
          </p>
        )}
      </Panel>

      {/* รายการ widget */}
      {usable.length === 0 ? (
        <EmptyState
          art={<ArtShield />}
          no="06"
          title="ยังไม่มีอะไรให้ผูกกับ widget"
          description="สร้างทัวร์นาเมนต์ก่อน (ได้สกอร์บอร์ด คิวถัดไป นับถอยหลัง ป้ายแชมป์) หรือเปิดหน้าช่องสักครั้ง (ได้แจ้งเตือนโดเนทกับเพลงที่กำลังเล่น) แล้วกลับมาที่นี่"
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {usable.map((widget, i) => {
            const url = makeUrl(widget, accent);
            const preview = makeUrl(widget, previewAccent, true);

            return (
              <motion.div
                key={widget.key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 240, damping: 26 }}
              >
                <Panel className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="slug">
                        {String(i + 1).padStart(2, "0")} · {widget.key}
                      </p>
                      <h3 className="mt-1 font-display text-base text-ice">{widget.name}</h3>
                      <p className="mt-1 text-xs text-muted">{widget.detail}</p>
                    </div>
                    <span className="num tile shrink-0 rounded-lg px-2.5 py-1 font-display text-[11px] text-champagne">
                      {widget.w} × {widget.h}
                    </span>
                  </div>

                  <WidgetPreview src={preview} w={widget.w} h={widget.h} name={widget.name} />

                  <code className="tile mt-3 block truncate rounded-lg px-3 py-2 text-[11px] text-muted">
                    {url}
                  </code>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => copy(url, widget.key)}
                      success={copied === widget.key}
                      icon={copied === widget.key ? undefined : <IconCopy className="h-3.5 w-3.5" />}
                    >
                      {copied === widget.key ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
                    </Button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-hair px-4 py-2 font-display text-xs text-muted transition-colors hover:text-champagne"
                    >
                      <IconExternal className="h-3.5 w-3.5" />
                      เปิดเต็มจอ
                    </a>
                  </div>
                </Panel>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* วิธีติดตั้ง */}
      <Panel variant="quiet" className="p-6">
        <Panel.Header eyebrow="Install" title="วิธีเอาไปใส่ OBS / Streamlabs" count={6} />

        <ol className="relative space-y-4">
          {/* เส้นตั้งเชื่อมเลขทั้งหก ให้อ่านเป็นลำดับเวลา ไม่ใช่รายการกระจัดกระจาย */}
          <span
            className="rule pointer-events-none absolute top-4 bottom-4 left-3.5 w-px"
            aria-hidden
          />
          {OBS_STEPS.map((node, i) => (
            <li key={i} className="relative flex gap-4">
              <span className="tile relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-[11px] text-champagne">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 pt-1 text-sm text-ice/85">{node}</span>
            </li>
          ))}
        </ol>

        <p className="tile mt-5 rounded-xl px-4 py-3 text-xs text-muted">
          ทดสอบแจ้งเตือน: เปิดแท็บ <b>โดเนท / สมาชิก</b> ในหน้าทัวร์ แล้วกด
          &ldquo;ยิงตัวอย่างเทสต์&rdquo; หรือเติม <code>?replay=1</code>{" "}
          ท้ายลิงก์ widget แจ้งเตือนเพื่อเล่นย้อนของเก่า
        </p>
      </Panel>
    </div>
  );
}

/**
 * พรีวิวของจริงด้วย iframe ขนาดเท่า Browser Source แล้วย่อให้พอดีกล่อง
 * โหลดเฉพาะการ์ดที่เลื่อนมาถึง กัน iframe ห้าตัวยิงพร้อมกันตอนเปิดหน้า
 */
function WidgetPreview({
  src,
  w,
  h,
  name,
}: {
  src: string;
  w: number;
  h: number;
  name: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        // setState จาก callback ของ observer ไม่ใช่จากตัว effect เอง
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // เขียน transform ลง style ตรงๆ ผ่าน ref จะได้ไม่ต้อง setState ทุกครั้งที่กล่องเปลี่ยนขนาด
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const s = Math.min(el.clientWidth / w, el.clientHeight / h);
      const dx = (el.clientWidth - w * s) / 2;
      const dy = (el.clientHeight - h * s) / 2;
      if (inner.current) {
        inner.current.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h]);

  return (
    <div className="mt-4">
      <div
        ref={box}
        className="relative h-52 overflow-hidden rounded-xl border border-hair"
        style={{
          backgroundImage:
            "linear-gradient(45deg, rgb(var(--hair)/var(--hair-a)) 25%, transparent 25%, transparent 75%, rgb(var(--hair)/var(--hair-a)) 75%), linear-gradient(45deg, rgb(var(--hair)/var(--hair-a)) 25%, transparent 25%, transparent 75%, rgb(var(--hair)/var(--hair-a)) 75%)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0, 9px 9px",
        }}
      >
        <div
          ref={inner}
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: w, height: h }}
        >
          {visible && (
            <iframe
              src={src}
              width={w}
              height={h}
              loading="lazy"
              title={`ตัวอย่าง ${name}`}
              className="block border-0"
              tabIndex={-1}
            />
          )}
        </div>
      </div>
      <p className="slug slug-2 mt-2">พรีวิวจริง · บนสตรีมพื้นหลังจะโปร่งใส</p>
    </div>
  );
}

function SourceBtn({
  children,
  active,
  onClick,
  disabled,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 cursor-pointer rounded-lg px-3 py-2 font-display text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "bg-[linear-gradient(180deg,#f0d8ab_0%,#d6ae6c_100%)] text-[#1b1509]"
          : "text-muted hover:text-ice"
      }`}
    >
      {children}
    </button>
  );
}

/** หน่วงค่าที่เปลี่ยนถี่ๆ ก่อนเอาไปใช้จริง (setState อยู่ใน callback ของ timer ไม่ใช่ใน effect) */
function useDebounced<T>(value: T, ms: number): T {
  const [held, setHeld] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setHeld(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);

  return held;
}
