"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { hasBackend } from "@/lib/backend/firebase";
import { useManageableChannels } from "@/hooks/useChannels";
import { useSiteRole } from "@/hooks/useRole";
import { setHashParams, useHashParam, useHydrated } from "@/hooks/useClient";
import { SOURCE_SIZE, type WidgetShape } from "./NowPlayingCard";
import { SHELL_PAD } from "./WidgetShell";
import PageHead from "../studio/PageHead";
import Panel from "../ui/Panel";
import LinkRow from "../ui/LinkRow";
import MiniBtn, { MiniLink } from "../ui/MiniBtn";
import { EmptyState, Input, Label, Skeleton } from "../ui/kit";
import ChatBridgePanel from "./ChatBridgePanel";

type ShapeDef = {
  shape: WidgetShape;
  name: string;
  detail: string;
  /** พารามิเตอร์ประจำทรงที่ต้องติดไปกับลิงก์เสมอ (หน้าเดียวกัน คนละทรง) */
  params: Record<string, string>;
};

const SHAPES: ShapeDef[] = [
  {
    shape: "bar",
    name: "แถบยาว",
    params: {},
    detail: "เพลงที่กำลังเล่นกับคิวถัดไปสามเพลง วางขอบล่างจอ ตอนคิวว่างแถบจะซ่อนตัวเอง",
  },
  {
    shape: "tall",
    // card=1 คือค่าที่แจกไปตั้งแต่ก่อนมีทรงนอน ลิงก์ใน OBS ของคนเก่ายังใช้อยู่ ห้ามเปลี่ยน
    name: "การ์ดสูง",
    params: { card: "1" },
    detail: "ปกใหญ่ ชื่อเพลง คนขอ และแถบเวลา วางข้างจอ ตอนไม่มีเพลงจะค้างเป็นการ์ดรอ",
  },
  {
    shape: "wide",
    name: "การ์ดนอน",
    params: { card: "wide" },
    detail: "ปกอยู่ข้างชื่อเพลง เตี้ยพอวางมุมบนหรือล่างของจอ ตอนไม่มีเพลงจะค้างเป็นการ์ดรอ",
  },
];

/**
 * ขนาด Browser Source ตามสเกลที่เลือก
 * ขอบรอบ widget ไม่ได้ขยายตาม (อยู่นอกชั้นที่ถูก scale) จึงคูณเฉพาะตัว widget
 * ที่ 1 เท่าได้ค่าตรงกับ SOURCE_SIZE เป๊ะ
 */
function sourceSize(shape: WidgetShape, scale: number): { w: number; h: number } {
  const { w, h } = SOURCE_SIZE[shape];
  const pad = SHELL_PAD * 2;
  return { w: Math.ceil((w - pad) * scale + pad), h: Math.ceil((h - pad) * scale + pad) };
}

const HEX = /^[0-9a-f]{6}$/i;

const OBS_STEPS: ReactNode[] = [
  <>
    ใน OBS กด <b>+</b> ในช่อง Sources แล้วเลือก <b>Browser</b>{" "}
    <span className="text-muted">
      (Streamlabs ใช้ชื่อเดียวกัน ส่วน TikTok LIVE Studio ให้กดเพิ่มแหล่ง แล้วเลือกเว็บเพจ)
    </span>
  </>,
  <>
    วางลิงก์ที่คัดลอกมาในช่อง <b>URL</b> แล้วตั้ง <b>Width</b> กับ <b>Height</b>{" "}
    ตามขนาดที่บอกไว้ข้างชื่อทรง
  </>,
  <>
    ช่อง <b>Custom CSS</b> ปล่อยไว้ตามเดิมได้ หน้า widget ทำพื้นโปร่งใสมาให้แล้ว
  </>,
  <>
    อยากได้ใหญ่ขึ้น ให้เลื่อน <b>ขนาด</b> ในหน้านี้ แล้วคัดลอกลิงก์ใหม่กับตั้ง Width/Height
    ตามขนาดใหม่ อย่าลากยืดกรอบใน OBS เพราะตัวหนังสือจะเบลอ
  </>,
  <>
    แก้ค่าแล้วภาพใน OBS ไม่เปลี่ยน ให้เปิด <b>Properties</b> ของ source แล้วกด{" "}
    <b>Refresh cache of current page</b>
  </>,
];

export default function WidgetBuilder() {
  const { admin, uid, loading: roleLoading } = useSiteRole();
  const hydrated = useHydrated();
  /** โค้ดสีไม่มี # — ว่าง = ไม่ใส่ accent ในลิงก์ (การ์ดเป็นเทาตอนไม่มีสีจากปก) */
  const [accent, setAccent] = useState("");
  const [scale, setScale] = useState(1);

  /*
    ช่องที่ทำลิงก์ให้ได้ — สตรีมเมอร์ได้เฉพาะช่องตัวเอง ผู้ดูแลได้ทุกช่อง

    ผู้ดูแลต้องได้ทุกช่อง เพราะเป็นคนตั้ง OBS ให้สตรีมเมอร์จริงๆ
    เคยกรองเหลือแค่ ownerUid === เรา แล้วพอโอนช่อง @affarain ให้เจ้าของตัวจริง
    widget ของช่องนั้นทั้งชุดก็หายไปจากหน้านี้ของผู้ดูแลเงียบๆ
    (ลิงก์ widget เป็นแค่ ?ch=รหัสช่อง ซึ่งอ่านได้สาธารณะอยู่แล้ว ไม่มีอะไรรั่ว)

    ช่องที่เลือกเก็บใน #c= แบบเดียวกับหน้าช่อง รีโหลดแล้วไม่เด้งกลับไปช่องแรก
  */
  const { channels, loaded } = useManageableChannels(admin, uid);
  const pickedChannelId = useHashParam("c");

  /* ช่องของเราขึ้นก่อน ช่องคนอื่น (เห็นเฉพาะผู้ดูแล) ตามหลัง */
  const pickable = useMemo(() => {
    const mine = channels.filter((c) => c.ownerUid === uid);
    const others = channels.filter((c) => c.ownerUid !== uid);
    return [...mine, ...others];
  }, [channels, uid]);
  /* ช่องที่เลือกไว้ในหน้านี้มาก่อน ไม่มีก็เอาช่องล่าสุดของเรา
     ตั้งใจไม่ไปดูร่างที่ค้างอยู่ในหน้าตั้งค่าช่อง — ร่างนั้นเป็นของแท็บนั้น
     ถ้ายังไม่เคยเปิดหน้านั้นในแท็บนี้มันจะว่างเปล่า แล้วลิงก์ widget จะขาดรหัสช่อง */
  const activeChannel =
    pickable.find((c) => c.id === pickedChannelId) ?? pickable[0] ?? null;

  const validAccent = HEX.test(accent) ? accent.toLowerCase() : "";
  // หน่วงก่อนส่งเข้า iframe ไม่งั้นพิมพ์โค้ดสีทีละตัวหรือลากสไลเดอร์แล้วพรีวิวรีโหลดรัวๆ
  const previewAccent = useDebounced(validAccent, 400);
  const previewScale = useDebounced(scale, 400);

  const origin = hydrated ? `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}` : "";

  const makeUrl = (def: ShapeDef, opts: { accent: string; scale: number; solid?: boolean }) => {
    const params = new URLSearchParams(def.params);
    if (opts.accent) params.set("accent", opts.accent);
    if (opts.scale !== 1) params.set("scale", String(opts.scale));
    if (opts.solid) params.set("solid", "1");
    /*
      ใช้ ?ch= ไม่ใช่ #ch=
      ถ้าลืมใส่ / ปิดท้าย เซิร์ฟเวอร์จะเด้ง URL ใหม่แล้วส่วน #hash หายไปเลย
      (ทดสอบกับ GitHub Pages แล้ว: /widget/song#ch=... → 301 ไป /widget/song/ เฉยๆ)
      ส่วน ?ch= รอดทั้งสองแบบ และ Browser Source บางตัวก็ตัด # ทิ้งอยู่แล้ว
    */
    if (activeChannel) params.set("ch", activeChannel.id);
    return `${origin}/widget/song/?${params.toString()}`;
  };

  const head = (
    <PageHead
      title="ลิงก์สำหรับ OBS"
      description="โชว์เพลงที่กำลังเล่นบนจอไลฟ์ สีของการ์ดเปลี่ยนตามปกเพลงเอง เลือกทรงที่ชอบ คัดลอกลิงก์ แล้ววางเป็น Browser Source"
    />
  );

  if (!hasBackend) {
    return (
      <div className="space-y-8">
        {head}
        <EmptyState
          title="เว็บชุดนี้ยังไม่ได้เชื่อมฐานข้อมูล"
          description="widget อ่านคิวเพลงจากฐานข้อมูล ต้องตั้งค่า Firebase ก่อนถึงจะทำลิงก์ได้"
        />
      </div>
    );
  }

  if (roleLoading || (!!uid && !loaded)) {
    return (
      <div className="space-y-8" aria-busy="true">
        {head}
        <Skeleton className="h-28 w-full rounded-sheet" />
        <div className="space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-4 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:gap-6">
              <Skeleton className="h-44 w-full rounded-sheet" />
              <div className="space-y-3 pt-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-32 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!activeChannel) {
    return (
      <div className="space-y-8">
        {head}
        <EmptyState
          title={uid ? "ยังไม่มีช่อง" : "ล็อกอินก่อน"}
          description={
            uid
              ? "ลิงก์ widget ผูกกับช่องของคุณ ตั้งค่าช่องก่อน แล้วกลับมาคัดลอกลิงก์ที่นี่"
              : "ลิงก์ widget ผูกกับช่องของบัญชี ล็อกอินด้วยบัญชีสตรีมเมอร์ก่อน"
          }
          action={
            uid ? (
              <Link
                href="/studio/channel/"
                className="inline-flex min-h-11 items-center rounded-full bg-ink px-5 font-medium text-onink transition-opacity hover:opacity-85"
              >
                ตั้งค่าช่อง
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {head}

      {/* เลือกช่อง — โผล่ก็ต่อเมื่อมีมากกว่าหนึ่งช่อง ช่องเดียวไม่ต้องให้เลือกให้รก */}
      {pickable.length > 1 ? (
        <div>
          <Label>ทำลิงก์ให้ช่องไหน</Label>
          <div
            role="radiogroup"
            aria-label="ช่อง"
            className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            {pickable.map((c) => {
              const on = c.id === activeChannel.id;
              // ช่องคนอื่นต้องบอกเจ้าของ ไม่งั้นผู้ดูแลแยกไม่ออกว่ากำลังทำลิงก์ให้ใคร
              const owner = c.ownerUid !== uid ? c.ownerEmail?.split("@")[0] : null;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setHashParams({ c: c.id })}
                  className={`min-h-11 shrink-0 cursor-pointer rounded-field px-4 py-2 text-left transition-colors ${
                    on ? "bg-ink text-onink" : "bg-fill text-ink hover:bg-fill-2"
                  }`}
                >
                  <span className="block max-w-48 truncate font-medium">
                    {c.name || c.handle || c.id.slice(0, 8)}
                  </span>
                  <span className={`block max-w-48 truncate text-sm ${on ? "opacity-75" : "text-muted"}`}>
                    {c.handle ? `@${c.handle}` : "ยังไม่ตั้ง handle"}
                    {owner && ` ของ ${owner}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-muted">
          ลิงก์ของช่อง{" "}
          <span className="font-medium text-ink">
            {activeChannel.name || (activeChannel.handle ? `@${activeChannel.handle}` : activeChannel.id)}
          </span>
        </p>
      )}

      {/* ปรับหน้าตา — มีผลกับลิงก์ทั้งสามทรง */}
      <Panel className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
        <div>
          <Label
            htmlFor="widget-accent"
            hint="การ์ดใช้สีจากปกเพลงเสมอ สีนี้ใช้ตอนยังไม่มีเพลงหรือดึงสีจากปกไม่ได้ ไม่ใส่ = เทา"
          >
            สีสำรอง
          </Label>
          <div className="flex items-center gap-2">
            {/* จานสีจริงสำหรับคนที่อยากกดเลือก ช่องข้อความไว้วางโค้ดสีของช่อง */}
            <label
              className="relative h-12 w-12 shrink-0 cursor-pointer overflow-hidden rounded-field ring-1 ring-line"
              style={{ background: validAccent ? `#${validAccent}` : "rgb(34 34 38)" }}
            >
              <input
                type="color"
                value={`#${validAccent || "222226"}`}
                onChange={(e) => setAccent(e.target.value.replace("#", ""))}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="เลือกสีสำรองจากจานสี"
              />
            </label>
            <Input
              id="widget-accent"
              value={accent}
              onChange={(e) => setAccent(e.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6))}
              placeholder="ไม่ใส่"
              maxLength={7}
              spellCheck={false}
              aria-invalid={accent !== "" && !validAccent}
              className="num w-36"
            />
            {accent && <MiniBtn onClick={() => setAccent("")}>ใช้เทา</MiniBtn>}
          </div>
          {accent !== "" && !validAccent && (
            <p className="mt-1.5 text-sm text-danger">ใส่โค้ดสีให้ครบ 6 หลัก เช่น ff5b7a</p>
          )}
        </div>

        <div>
          <Label
            htmlFor="widget-scale"
            hint="ขยายในหน้านี้แล้วตัวหนังสือยังคม ขนาด Browser Source ด้านล่างคิดตามให้แล้ว"
          >
            ขนาด <span className="num font-normal text-muted">{scale.toFixed(2)} เท่า</span>
          </Label>
          <div className="flex items-center gap-3">
            <input
              id="widget-scale"
              type="range"
              min={0.6}
              max={2}
              step={0.05}
              value={scale}
              // ปัดทิ้งเศษทศนิยมของ step ไม่งั้นลิงก์ได้ scale=1.1500000000000001
              onChange={(e) => setScale(Math.round(Number(e.target.value) * 100) / 100)}
              className="min-h-11 min-w-0 flex-1 cursor-pointer"
            />
            {scale !== 1 && <MiniBtn onClick={() => setScale(1)}>1 เท่า</MiniBtn>}
          </div>
        </div>
      </Panel>

      <section aria-labelledby="widget-shapes">
        <h2 id="widget-shapes" className="text-title font-bold">
          เลือกทรง
        </h2>
        <p className="mt-1 text-muted">ตัวอย่างใช้คิวจริงของช่องตอนนี้ บนจอไลฟ์พื้นหลังจะโปร่งใส</p>
        <ul className="rows mt-2">
          {SHAPES.map((def) => {
            const size = sourceSize(def.shape, scale);
            const previewSize = sourceSize(def.shape, previewScale);
            const url = makeUrl(def, { accent: validAccent, scale });
            const preview = makeUrl(def, { accent: previewAccent, scale: previewScale, solid: true });
            return (
              <li
                key={def.shape}
                className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]"
              >
                <WidgetPreview src={preview} w={previewSize.w} h={previewSize.h} name={def.name} />
                <LinkRow
                  kind="obs"
                  label={def.name}
                  url={url}
                  size={`${size.w} × ${size.h}`}
                  hint={def.detail}
                  extra={<MiniLink href={url}>เปิดดู</MiniLink>}
                />
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="widget-obs">
        <h2 id="widget-obs" className="text-title font-bold">
          วิธีใส่ใน OBS
        </h2>
        <ol className="mt-3 max-w-prose space-y-3">
          {OBS_STEPS.map((node, i) => (
            <li key={i} className="flex gap-3">
              <span className="num w-5 shrink-0 font-semibold text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1">{node}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* key = รีเซ็ตชื่อ TikTok กับรหัสที่ออกไว้ทุกครั้งที่สลับช่อง */}
      <ChatBridgePanel key={activeChannel.id} channel={activeChannel} />
    </div>
  );
}

/**
 * พรีวิวของจริงด้วย iframe ขนาดเท่า Browser Source แล้วย่อให้พอดีกล่อง
 * โหลดเฉพาะแถวที่เลื่อนมาถึง กัน iframe หลายตัวยิงพร้อมกันตอนเปิดหน้า
 *
 * iframe เปิดแบบ solid=1 — พื้นเทาเข้มแทนฉากเกม ให้เห็นกรอบ Browser Source
 * กับตัว widget ในกรอบนั้น และขึ้นคำอธิบายแทนที่จะว่างตอนคิวยังไม่มีเพลง
 */
function WidgetPreview({ src, w, h, name }: { src: string; w: number; h: number; name: string }) {
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
    <div className="pt-4">
      <div ref={box} className="relative h-44 overflow-hidden rounded-sheet bg-fill">
        <div
          ref={inner}
          className="absolute top-0 left-0 origin-top-left"
          style={{ width: w, height: h }}
        >
          {visible && src && (
            <iframe
              src={src}
              width={w}
              height={h}
              loading="lazy"
              title={`ตัวอย่าง${name}`}
              className="block border-0"
              tabIndex={-1}
            />
          )}
        </div>
      </div>
    </div>
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
