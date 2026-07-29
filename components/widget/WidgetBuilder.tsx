"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { hasBackend } from "@/lib/backend/firebase";
import { tournamentStore } from "@/lib/tournament/store";
import Panel from "../ui/Panel";
import Button from "../ui/Button";
import { EmptyNote, Input, Label } from "../tournament/ui";

type WidgetDef = {
  key: string;
  name: string;
  path: string;
  size: string;
  detail: string;
  needsTournament: boolean;
};

const WIDGETS: WidgetDef[] = [
  {
    key: "scoreboard",
    name: "สกอร์บอร์ด",
    path: "/widget/scoreboard/",
    size: "700 × 190",
    detail: "ชื่อทีมสองฝั่งกับสกอร์ อัปเดตเองเมื่อผู้จัดกรอกผล",
    needsTournament: true,
  },
  {
    key: "upnext",
    name: "คิวถัดไป",
    path: "/widget/upnext/",
    size: "520 × 320",
    detail: "แมตช์ที่รอแข่ง 4 รายการถัดไป พร้อมเวลา",
    needsTournament: true,
  },
  {
    key: "timer",
    name: "นับถอยหลัง",
    path: "/widget/timer/",
    size: "420 × 220",
    detail: "นับถึงแมตช์ถัดไป หรือใส่ ?mins=5 ทำเป็นตัวจับเวลาพักเบรก",
    needsTournament: false,
  },
  {
    key: "champion",
    name: "ป้ายแชมป์",
    path: "/widget/champion/",
    size: "700 × 400",
    detail: "ขึ้นตอนจบรายการ โชว์ทีมแชมป์กับเงินรางวัล",
    needsTournament: true,
  },
  {
    key: "alert",
    name: "แจ้งเตือนโดเนท",
    path: "/widget/alert/",
    size: "700 × 300",
    detail: "เด้งทันทีที่ผู้จัดกดอนุมัติสลิป มีเสียงด้วย",
    needsTournament: true,
  },
];

export default function WidgetBuilder() {
  const tournaments = useSyncExternalStore(
    tournamentStore.subscribe,
    tournamentStore.getSnapshot,
    tournamentStore.getServerSnapshot,
  );

  const [tournamentId, setTournamentId] = useState("");
  const [useCloud, setUseCloud] = useState(hasBackend);
  const [accent, setAccent] = useState("e6c894");
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  const origin =
    typeof window !== "undefined"
      ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`
      : "";

  const selected = tournaments.find((t) => t.id === tournamentId) ?? tournaments[0];

  const buildUrl = useMemo(
    () => (widget: WidgetDef) => {
      const params = new URLSearchParams();
      if (accent && accent !== "e6c894") params.set("accent", accent);
      if (scale !== 1) params.set("scale", String(scale));
      const query = params.toString() ? `?${params.toString()}` : "";
      const hash = selected
        ? `#${useCloud ? "c" : "t"}=${selected.id}`
        : "";
      return `${origin}${widget.path}${query}${hash}`;
    },
    [origin, accent, scale, selected, useCloud],
  );

  const copy = (url: string, key: string) => {
    void navigator.clipboard.writeText(url);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-[10px] tracking-luxe text-champagne/70 uppercase">
          Stream widgets
        </p>
        <h2 className="mt-1.5 font-display text-2xl font-medium text-ice sm:text-3xl">
          Widget สำหรับ OBS / Streamlabs
        </h2>
        <p className="mt-1.5 text-sm text-muted">
          สร้างลิงก์แล้วเอาไปวางเป็น Browser Source พื้นหลังโปร่งใสพร้อมทับภาพเกมได้เลย
        </p>
      </div>

      {/* ตั้งค่า */}
      <Panel className="p-6">
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
              <span
                className="h-9 w-9 shrink-0 rounded-lg"
                style={{ background: `#${accent}` }}
              />
              <Input
                value={accent}
                onChange={(e) => setAccent(e.target.value.replace("#", "").slice(0, 6))}
                className="flex-1"
                maxLength={6}
              />
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
              style={{ ["--fill" as string]: `${((scale - 0.6) / 1.4) * 100}%` }}
              className="mt-3 w-full cursor-pointer"
            />
          </div>

          <div>
            <Label hint={hasBackend ? undefined : "ต้องเชื่อม Firebase ก่อน"}>
              แหล่งข้อมูล
            </Label>
            <div className="flex gap-1 rounded-xl tile p-1">
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
          <p className="mt-4 rounded-xl tile px-4 py-3 text-xs text-muted">
            โหมด &ldquo;เครื่องนี้&rdquo; อ่านข้อมูลจาก localStorage ซึ่ง OBS
            มีพื้นที่เก็บของตัวเองแยกจากเบราว์เซอร์ปกติ — widget จะไม่เห็นข้อมูล
            ถ้าจะใช้กับ OBS จริงต้องเลือกโหมดคลาวด์
          </p>
        )}
      </Panel>

      {/* รายการ widget */}
      {tournaments.length === 0 ? (
        <EmptyNote>สร้างทัวร์นาเมนต์ก่อน แล้วค่อยกลับมาสร้างลิงก์ widget</EmptyNote>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {WIDGETS.map((widget, i) => {
            const url = buildUrl(widget);
            return (
              <motion.div
                key={widget.key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 240, damping: 26 }}
              >
                <Panel className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-base text-ice">{widget.name}</h3>
                      <p className="mt-1 text-xs text-muted">{widget.detail}</p>
                    </div>
                    <span className="shrink-0 rounded-lg tile px-2.5 py-1 font-display text-[11px] text-champagne">
                      {widget.size}
                    </span>
                  </div>

                  <code className="mt-4 block truncate rounded-lg tile px-3 py-2 text-[11px] text-muted">
                    {url}
                  </code>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button onClick={() => copy(url, widget.key)} className="px-4 py-2 text-xs">
                      {copied === widget.key ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
                    </Button>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-xl border border-hair px-4 py-2 font-display text-xs text-muted transition-colors hover:text-champagne"
                    >
                      เปิดดูตัวอย่าง
                    </a>
                  </div>
                </Panel>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* วิธีติดตั้ง */}
      <Panel className="p-6">
        <h3 className="font-display text-lg font-medium text-ice">
          วิธีเอาไปใส่ OBS / Streamlabs
        </h3>
        <ol className="mt-4 space-y-3 text-sm text-ice/85">
          <Step n={1}>
            ในหน้าต่าง Sources กด <b>+</b> → เลือก <b>Browser</b> (Streamlabs
            ใช้ชื่อเดียวกัน)
          </Step>
          <Step n={2}>
            วาง URL ที่คัดลอกมาในช่อง <b>URL</b> แล้วตั้ง <b>Width / Height</b>{" "}
            ตามขนาดที่แนะนำข้างบน
          </Step>
          <Step n={3}>
            ปล่อยช่อง <b>Custom CSS</b> ไว้ตามค่าเริ่มต้น (
            <code className="text-xs text-champagne">
              body {`{ background-color: rgba(0,0,0,0); margin: 0; overflow: hidden; }`}
            </code>
            ) — หน้าเว็บทำพื้นโปร่งใสมาให้แล้ว
          </Step>
          <Step n={4}>
            ติ๊ก <b>Control audio via OBS</b> ถ้าอยากได้ยินเสียงแจ้งเตือนโดเนทในสตรีม
          </Step>
          <Step n={5}>
            อย่าติ๊ก <b>Shutdown source when not visible</b> สำหรับ widget แจ้งเตือน
            ไม่งั้นสลับซีนแล้วจะพลาดการแจ้งเตือน
          </Step>
          <Step n={6}>
            แก้ดีไซน์แล้วภาพไม่เปลี่ยน ให้กด <b>Refresh cache of current page</b>{" "}
            ในคุณสมบัติของ source
          </Step>
        </ol>

        <p className="mt-5 rounded-xl tile px-4 py-3 text-xs text-muted">
          ทดสอบแจ้งเตือน: เปิดแท็บ <b>โดเนท / สมาชิก</b> ในหน้าทัวร์ แล้วกด
          &ldquo;ยิงตัวอย่างเทสต์&rdquo; หรือเติม <code>?replay=1</code>{" "}
          ท้ายลิงก์ widget แจ้งเตือนเพื่อเล่นย้อนของเก่า
        </p>
      </Panel>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-champagne/15 font-display text-[11px] text-champagne">
        {n}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

function SourceBtn({
  children,
  active,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
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
