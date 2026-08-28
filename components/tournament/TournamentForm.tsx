"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { Channel } from "@/lib/channel/types";
import { safeImageSrc } from "@/lib/safe";
import { PRIZE_PRESETS, calcPrizes, formatMoney } from "@/lib/tournament/prize";
import { formatThaiDay } from "@/lib/tournament/share";
import { tournamentStore } from "@/lib/tournament/store";
import type { Tournament, TournamentStatus } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
import { IconCheck } from "../ui/icons";
import TournamentCard from "./TournamentCard";
import {
  Input,
  Label,
  NumberInput,
  STATUS_META,
  Textarea,
  fromLocalInput,
  toLocalInput,
} from "./ui";

type Props = {
  tournament: Tournament;
  onClose: () => void;
  onSaved?: (t: Tournament) => void;
  /**
   * ช่องที่ "คนที่เปิดฟอร์มอยู่" ผูกทัวร์เข้าไปได้
   *
   * ต้องรับมาจากผู้เรียก ไม่ใช่ไปถาม useMyChannels() เอง — เพราะผู้ดูแลระบบ
   * ไม่จำเป็นต้องมีช่องของตัวเองสักช่อง แต่ต้องสร้างทัวร์ให้ช่องไหนก็ได้
   * ถ้าฟอร์มถามเอง ผู้ดูแลที่ไม่มีช่องจะไม่เห็นตัวเลือกเลย แล้วทัวร์ที่สร้าง
   * จะกลายเป็นทัวร์ที่ไม่ผูกกับช่องไหนโดยที่คนสร้างไม่รู้ตัว
   */
  channels?: Channel[];
};

const MAX_COVER_KB = 400;

/**
 * ฟอร์มถูกหั่นเป็นสามขั้น ไม่ใช่หน้ายาวหน้าเดียว
 *
 * ของเดิมกางทุกอย่างพร้อมกัน — ชื่อทัวร์ รูปปก โหมดรับสมัคร วันเปิด/ปิด สถานะ
 * PIN เงินรางวัล ลิงก์ไลฟ์ — รวมสิบเจ็ดช่องเรียงลงมาสามจอครึ่ง
 * คนสร้างทัวร์ครั้งแรกไม่รู้ว่าต้องกรอกอะไรบ้างถึงจะพอ เลยกรอกทุกช่องหรือไม่ก็ยอมแพ้
 *
 * ★ ปุ่ม "บันทึก" ยังกดได้ทุกขั้น ★ ขั้นที่ 2 กับ 3 มีค่าเริ่มต้นที่ใช้ได้จริงอยู่แล้ว
 * (ทีมละ 5 · รับ 8 ทีม · แบ่งรางวัล 50/30/20) การหั่นขั้นจึงเป็นการ "จัดกลุ่ม"
 * ไม่ใช่การบังคับให้เดินครบทาง
 */
const STEPS = [
  { key: "basic", label: "ข้อมูลทัวร์", hint: "ชื่อ ปก และช่องที่สังกัด" },
  { key: "reg", label: "การรับสมัคร", hint: "โหมด ขนาดทีม และกำหนดเวลา" },
  { key: "extra", label: "รางวัลกับไลฟ์", hint: "เงินรางวัล ลิงก์ไลฟ์ และกติกา" },
] as const;

/** ฟอร์มสร้าง/แก้ข้อมูลทัวร์ — เก็บลง localStorage ทันทีที่กดบันทึก */
export default function TournamentForm({
  tournament,
  onClose,
  onSaved,
  channels = [],
}: Props) {
  const [draft, setDraft] = useState<Tournament>(tournament);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const reduced = useReducedMotion();

  const set = <K extends keyof Tournament>(key: K, value: Tournament[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /*
    มีช่องเดียวให้เลือกก็ผูกให้เลย ไม่ต้องถาม

    ปรับ state ระหว่างเรนเดอร์ตามที่ React แนะนำ ไม่ใช่ setState ใน effect
    (เงื่อนไขแคบมาก: ทำครั้งเดียวตอนที่ยังไม่เคยผูกช่อง แล้วจะไม่เข้าอีก)
  */
  if (!draft.channelId && channels.length === 1) {
    setDraft((prev) =>
      prev.channelId ? prev : { ...prev, channelId: channels[0].id },
    );
  }

  const prizePreview = calcPrizes(draft.prize);

  const pickCover = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_COVER_KB * 1024) {
      setCoverError(
        `รูปใหญ่เกิน ${MAX_COVER_KB}KB — ย่อรูปก่อนนะ (เก็บในเบราว์เซอร์มีพื้นที่จำกัด)`,
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCoverError(null);
      set("cover", String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  const save = () => {
    const clean: Tournament = {
      ...draft,
      name: draft.name.trim() || "ทัวร์นาเมนต์ไม่มีชื่อ",
      teamSize: Math.max(1, Math.min(10, draft.teamSize)),
      maxTeams: Math.max(0, Math.min(64, draft.maxTeams)),
    };
    tournamentStore.upsert({ ...clean, updatedAt: new Date().toISOString() });
    onSaved?.(clean);
    onClose();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="slug">{tournament.name ? "Edit" : "New tournament"}</p>
          <h2 className="mt-1.5 font-display text-2xl font-light text-ice">
            {tournament.name ? "แก้ไขทัวร์นาเมนต์" : "สร้างทัวร์นาเมนต์"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="hover-tile tile min-h-10 shrink-0 cursor-pointer rounded-xl px-4 text-sm text-muted transition-colors hover:text-ice"
        >
          ปิด
        </button>
      </div>

      {/* กดข้ามไปขั้นไหนก็ได้ ไม่ต้องเดินตามลำดับ — คนที่มาแก้ทัวร์เดิม
          มักมาแก้เรื่องเดียว (เลื่อนวันแข่ง / เพิ่มเงินรางวัล) ไม่ได้มากรอกใหม่ทั้งใบ */}
      <div className="tile no-scrollbar flex gap-1 overflow-x-auto rounded-xl p-1">
        {STEPS.map((s, i) => {
          const on = step === i;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStep(i)}
              aria-current={on ? "step" : undefined}
              className={`relative shrink-0 grow cursor-pointer rounded-lg px-3 py-2.5 text-left transition-colors ${
                on ? "text-onaccent" : "text-muted hover:text-ice"
              }`}
            >
              {on && (
                <motion.span
                  layoutId="form-step"
                  className="accent-fill absolute inset-0 rounded-lg"
                  transition={{ type: "spring", stiffness: 340, damping: 32 }}
                />
              )}
              <span className="relative z-10 block">
                <span className="num font-display text-eyebrow opacity-70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="ml-2 font-display text-xs sm:text-sm">{s.label}</span>
                <span
                  className={`mt-0.5 hidden truncate text-xs sm:block ${
                    on ? "text-onaccent/70" : "text-muted/70"
                  }`}
                >
                  {s.hint}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
        ขั้นที่ไม่ได้เปิดใช้ hidden ไม่ใช่ถอดออกจาก DOM
        เพราะ Choice ใช้ layoutId ร่วมกัน ถ้าถอดออกแล้วใส่กลับ motion จะวิ่งจาก
        ตำแหน่งเดิมข้ามจอ และค่าที่พิมพ์ค้างไว้จะถูก React ทิ้งพร้อม subtree
      */}
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(280px,21rem)] lg:items-start">
        <Panel className="p-6 sm:p-7">
          {/* ไม่ต้องมี space-y ระหว่างขั้นแล้ว เพราะเห็นทีละขั้น —
              ถ้าปล่อยไว้ ขั้นที่ 2 กับ 3 จะได้ margin-top ติดมาเป็นช่องว่างลอยๆ ด้านบน */}
          <div>
            {/* ---------- 01 ข้อมูลทั่วไป ---------- */}
            {/* ไม่มี SectionHead ในนี้แล้ว — แถบขั้นด้านบนบอกชื่อกับคำอธิบายของ
                ขั้นนี้อยู่แล้ว หัวข้อซ้ำอีกรอบขนาดพาดหัวกินไปเกือบร้อยพิกเซล
                ก่อนถึงช่องแรกที่ต้องกรอกจริง */}
            <section className={step === 0 ? "" : "hidden"}>
              <div className="space-y-5">
                {/*
                  ทัวร์สังกัดช่องไหน — ถามตั้งแต่ตอนสร้าง ไม่ใช่เดาตอนเผยแพร่

                  ยอดสมทบทุนเงินรางวัลดึงจากใบโดเนทของช่องที่ผูกไว้ ผูกผิดช่อง
                  แปลว่าเงินไปโผล่ผิดทัวร์เงียบๆ โดยไม่มีอะไรฟ้อง
                  มีช่องเดียวก็ไม่ต้องถาม เลือกให้เลย
                */}
                {channels.length > 1 && (
                  <div>
                    <Label hint="ยอดสมทบทุนเงินรางวัลจะดึงจากใบโดเนทของช่องนี้">
                      ทัวร์ของช่องไหน
                    </Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {channels.map((c) => {
                        const on = draft.channelId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => set("channelId", c.id)}
                            aria-pressed={on}
                            className={`min-h-11 cursor-pointer rounded-xl px-4 py-2 font-display text-xs transition-colors ${
                              on
                                ? "accent-fill text-onaccent"
                                : "tile text-muted hover:text-ice"
                            }`}
                          >
                            {c.name || (c.handle ? `@${c.handle}` : c.id.slice(0, 8))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <Label>ชื่อทัวร์นาเมนต์</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="เช่น AFFA RAIN CUP #1"
                    maxLength={80}
                  />
                </div>

                <div>
                  <Label>คำโปรยสั้นๆ</Label>
                  <Input
                    value={draft.tagline ?? ""}
                    onChange={(e) => set("tagline", e.target.value)}
                    placeholder="เช่น ศึกชิงแชมป์ประจำเดือน"
                    maxLength={120}
                  />
                </div>

                <div>
                  <Label>รายละเอียด / กติกา</Label>
                  <Textarea
                    rows={6}
                    value={draft.description ?? ""}
                    onChange={(e) => set("description", e.target.value)}
                    placeholder={
                      "เช่น\n- แข่ง 5v5 โหมดจัดอันดับ\n- ห้ามใช้ตัวละครซ้ำในซีรีส์เดียวกัน"
                    }
                  />
                </div>

                <div>
                  <Label hint={`ไฟล์ไม่เกิน ${MAX_COVER_KB}KB`}>รูปปก</Label>
                  <div className="flex items-center gap-3">
                    {draft.cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={safeImageSrc(draft.cover) ?? ""}
                        alt="รูปปก"
                        className="h-16 w-28 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="tile-dashed grid h-16 w-28 place-items-center rounded-lg text-xs text-muted">
                        ยังไม่มีรูป
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <label className="hover-tile tile cursor-pointer rounded-lg px-3 py-2 text-xs text-ice/80 transition-colors">
                        เลือกรูป
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => pickCover(e.target.files?.[0])}
                        />
                      </label>
                      {draft.cover && (
                        <button
                          type="button"
                          onClick={() => set("cover", undefined)}
                          className="cursor-pointer text-xs text-muted transition-colors hover:text-danger"
                        >
                          ลบรูป
                        </button>
                      )}
                    </div>
                  </div>
                  {coverError && (
                    <p className="mt-2 text-xs text-danger">{coverError}</p>
                  )}
                </div>
              </div>
            </section>

            {/* ---------- 02 การรับสมัคร ---------- */}
            <section className={step === 1 ? "" : "hidden"}>
              <div className="space-y-5">
                <div>
                  <Label hint="เปลี่ยนภายหลังได้ แต่ต้องรับสมัครใหม่">วิธีรับสมัคร</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        {
                          value: "team",
                          title: "ล็อกทีม",
                          detail: "สมัครมาเป็นทีมพร้อมรายชื่อ ใช้ทีมนั้นแข่งเลย",
                        },
                        {
                          value: "solo",
                          title: "สมัครเดี่ยว แล้วสุ่มทีม",
                          detail: "รับรายบุคคล แล้วผู้จัดกดสุ่มแบ่งทีมให้",
                        },
                      ] as const
                    ).map((opt) => {
                      const active = draft.entryMode === opt.value;
                      return (
                        <Choice
                          key={opt.value}
                          active={active}
                          reduced={!!reduced}
                          layoutId="form-entry"
                          onClick={() => set("entryMode", opt.value)}
                          className="px-4 py-3 text-left"
                        >
                          <p
                            className={`flex items-center gap-1.5 font-display text-sm ${active ? "text-iris" : "text-ice"
                              }`}
                          >
                            {active && <IconCheck className="h-3.5 w-3.5" strokeWidth={2} />}
                            {opt.title}
                          </p>
                          <p className="mt-1 text-xs text-muted">{opt.detail}</p>
                        </Choice>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>ทีมละกี่คน</Label>
                    <NumberInput
                      min={1}
                      max={10}
                      value={draft.teamSize}
                      onChange={(teamSize) => set("teamSize", teamSize)}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Label >รับกี่ทีม</Label>
                    <NumberInput
                      min={0}
                      max={64}
                      value={draft.maxTeams}
                      onChange={(maxTeams) => set("maxTeams", maxTeams)}
                      placeholder="ไม่จำกัด"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>เปิดรับสมัคร</Label>
                    <Input
                      type="datetime-local"
                      value={toLocalInput(draft.registerOpenAt)}
                      onChange={(e) =>
                        set("registerOpenAt", fromLocalInput(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <Label>ปิดรับสมัคร</Label>
                    <Input
                      type="datetime-local"
                      value={toLocalInput(draft.registerCloseAt)}
                      onChange={(e) =>
                        set("registerCloseAt", fromLocalInput(e.target.value))
                      }
                    />
                  </div>
                  <div>
                    <Label>วันแข่ง</Label>
                    <Input
                      type="datetime-local"
                      value={toLocalInput(draft.startAt)}
                      onChange={(e) => set("startAt", fromLocalInput(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>สถานที่ / ช่องทาง</Label>
                    <Input
                      value={draft.venue ?? ""}
                      onChange={(e) => set("venue", e.target.value)}
                      placeholder="เช่น ออนไลน์"
                    />
                  </div>
                </div>

                <div>
                  <Label>สถานะ</Label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(STATUS_META) as TournamentStatus[]).map((status) => {
                      const meta = STATUS_META[status];
                      const active = draft.status === status;
                      return (
                        <Choice
                          key={status}
                          active={active}
                          reduced={!!reduced}
                          layoutId="form-status"
                          indicatorStyle={{
                            background: `rgb(${meta.rgb} / 0.16)`,
                            boxShadow: `inset 0 0 0 1px rgb(${meta.rgb} / 0.45)`,
                          }}
                          onClick={() => set("status", status)}
                          className="px-3 py-1.5"
                        >
                          <span
                            className="font-display text-xs"
                            style={{ color: active ? meta.hex : "var(--color-muted)" }}
                          >
                            {meta.label}
                          </span>
                        </Choice>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label hint="ผู้ชมยังดูสายและผลได้ตามปกติ">
                    PIN โหมดผู้จัด (ไม่ใส่ก็ได้)
                  </Label>
                  <Input
                    value={draft.adminPin ?? ""}
                    onChange={(e) => set("adminPin", e.target.value.trim() || undefined)}
                    placeholder="เช่น 2468"
                    maxLength={12}
                  />
                  <p className="mt-2 text-xs text-muted">
                    กันมือลั่นเฉยๆ ไม่ใช่ระบบความปลอดภัยจริง เพราะเว็บนี้ไม่มีเซิร์ฟเวอร์
                  </p>
                </div>
              </div>
            </section>

            {/* ---------- 03 รางวัลกับไลฟ์ ---------- */}
            <section className={step === 2 ? "" : "hidden"}>
              <div className="space-y-5">
                <div>
                  <Label>เงินรางวัลรวม</Label>
                  <div className="flex gap-2">
                    <NumberInput
                      value={draft.prize.total}
                      onChange={(total) => set("prize", { ...draft.prize, total })}
                      placeholder="0"
                      max={100_000_000}
                    />
                    <Input
                      value={draft.prize.currency}
                      onChange={(e) =>
                        set("prize", { ...draft.prize, currency: e.target.value })
                      }
                      className="w-16 text-center"
                      maxLength={3}
                    />
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {PRIZE_PRESETS.map((preset) => {
                      const active =
                        preset.slots.length === draft.prize.slots.length &&
                        preset.slots.every(
                          (s, i) => draft.prize.slots[i]?.percent === s.percent,
                        );
                      return (
                        <Choice
                          key={preset.name}
                          active={active}
                          reduced={!!reduced}
                          layoutId="form-preset"
                          onClick={() =>
                            set("prize", {
                              ...draft.prize,
                              slots: preset.slots.map((s) => ({ ...s })),
                            })
                          }
                          className="px-2.5 py-1.5"
                        >
                          <span
                            className={`text-xs ${active ? "text-iris" : "text-muted"}`}
                          >
                            {preset.name}
                          </span>
                        </Choice>
                      );
                    })}
                  </div>

                  {/* โชว์ผลทันทีที่กด ไม่งั้นดูเหมือนปุ่มไม่ทำงาน */}
                  <ul className="tile mt-3 space-y-1.5 rounded-xl px-4 py-3">
                    {prizePreview.breakdown.map((row) => (
                      <li
                        key={row.slot.place}
                        className="flex items-center justify-between gap-3 text-xs"
                      >
                        <span className="text-muted">
                          {row.slot.label}{" "}
                          <span className="num text-muted/60">({row.slot.percent}%)</span>
                        </span>
                        <span className="num font-display text-ice">
                          {formatMoney(row.amount, draft.prize.currency)}
                        </span>
                      </li>
                    ))}
                    {prizePreview.breakdown.length === 0 && (
                      <li className="text-xs text-muted">ยังไม่ได้เลือกรูปแบบการแบ่ง</li>
                    )}
                  </ul>
                </div>

                <div>
                  <Label hint="แปะลิงก์ไลฟ์ TikTok / YouTube / Facebook">ลิงก์ไลฟ์</Label>
                  <Input
                    value={draft.live.url}
                    onChange={(e) =>
                      set("live", { ...draft.live, url: e.target.value.trim() })
                    }
                    placeholder="https://www.tiktok.com/@affarain/live"
                  />
                  <label className="mt-2.5 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ice/85">
                    <input
                      type="checkbox"
                      checked={draft.live.isLive}
                      onChange={(e) =>
                        set("live", { ...draft.live, isLive: e.target.checked })
                      }
                      className="h-4 w-4 accent-live"
                    />
                    ตอนนี้กำลังไลฟ์อยู่ (จะขึ้นป้าย LIVE)
                  </label>
                </div>
              </div>
            </section>
          </div>
        </Panel>

        {/* ---------- พรีวิวการ์ดจริง อัปเดตสดตามที่พิมพ์ ---------- */}
        <aside className="lg:sticky lg:top-24">
          <p className="slug mb-3">พรีวิว</p>
          <TournamentCard tournament={draft} preview />
          <p className="mt-3 text-xs leading-relaxed text-muted">
            นี่คือหน้าตาการ์ดที่คนอื่นจะเห็นในหน้ารายการทัวร์และในลิงก์ที่แชร์ออกไป
          </p>
        </aside>
      </div>

      {/* ---------- แถบบันทึกที่ลอยอยู่เหนือขอบล่าง ---------- */}
      <div className="sticky bottom-0 z-20 -mx-1 px-1 pt-3 pb-[max(1rem,var(--sab))]">
        <div className="glass-panel flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl py-3 pr-3 pl-5">
          {/*
            สามอย่างนี้เคยเป็นข้อความยาวบรรทัดเดียวคั่นด้วยจุด ซึ่งอ่านแล้วแยกไม่ออก
            ว่าอันไหน "กรอกแล้ว" อันไหน "ยังไม่ได้กรอก" — ทั้งที่นั่นคือสิ่งเดียว
            ที่แถบนี้ควรบอกก่อนคนกดบันทึก จุดนำหน้าเลยทำหน้าที่นั้นแทน
          */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
            <FormStat
              filled={!!draft.name.trim()}
              text={draft.name.trim() || "ยังไม่ได้ตั้งชื่อ"}
            />
            {/* มีหลายช่องให้เลือกแล้วยังไม่เลือก = ยอดโดเนทจะไปผูกผิดที่ ต้องเห็นก่อนกดบันทึก */}
            {channels.length > 1 && (
              <FormStat
                filled={!!draft.channelId}
                text={
                  channels.find((c) => c.id === draft.channelId)?.name ||
                  (draft.channelId ? "ช่องที่เลือกไว้" : "ยังไม่ได้เลือกช่อง")
                }
              />
            )}
            <FormStat
              filled={!!draft.startAt}
              text={draft.startAt ? formatThaiDay(draft.startAt) : "ยังไม่ระบุวันแข่ง"}
            />
            <FormStat
              filled={draft.prize.total > 0}
              text={
                draft.prize.total > 0
                  ? formatMoney(draft.prize.total, draft.prize.currency)
                  : "ไม่มีเงินรางวัล"
              }
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep(step - 1)}>
                ย้อน
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <>
                <Button variant="outline" onClick={save} className="rounded-2xl">
                  บันทึก
                </Button>
                <Button onClick={() => setStep(step + 1)} className="rounded-2xl">
                  ต่อไป
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose}>
                  ยกเลิก
                </Button>
                <Button onClick={save} className="rounded-2xl">
                  บันทึก
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * ปุ่มตัวเลือกที่ตัวชี้ตำแหน่ง "เลื่อน" ไปหาตัวที่เลือก แทนการสลับสีเฉยๆ
 * ปิด layout animation เมื่อผู้ใช้ขอลดการเคลื่อนไหว
 */
function Choice({
  active,
  onClick,
  children,
  layoutId,
  indicatorStyle,
  reduced,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  layoutId: string;
  indicatorStyle?: React.CSSProperties;
  reduced: boolean;
  className?: string;
}) {
  const fallback: React.CSSProperties = {
    background: "rgb(var(--accent) / 0.14)",
    boxShadow: "inset 0 0 0 1px rgb(var(--accent) / 0.45)",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`hover-tile relative cursor-pointer rounded-xl transition-colors ${active ? "" : "tile"
        } ${className}`}
    >
      {active &&
        (reduced ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-xl"
            style={indicatorStyle ?? fallback}
          />
        ) : (
          <motion.span
            layoutId={layoutId}
            className="pointer-events-none absolute inset-0 rounded-xl"
            style={indicatorStyle ?? fallback}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
          />
        ))}
      <span className="relative block">{children}</span>
    </button>
  );
}

/**
 * สถานะหนึ่งช่องบนแถบบันทึก — จุดทองคือกรอกแล้ว วงกลมกลวงคือยังว่าง
 *
 * ตั้งใจไม่ใช้เครื่องหมายถูก/กากบาท เพราะสามอย่างนี้ไม่ได้ "ผิด" ถ้าไม่กรอก
 * (บันทึกได้อยู่ดี) มันแค่ยังไม่ได้ใส่ — จุดกับวงกลมสื่อว่า "มี/ยังไม่มี"
 * โดยไม่ตำหนิคนกรอก
 */
function FormStat({ filled, text }: { filled: boolean; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          filled ? "accent-fill" : "border border-hair"
        }`}
      />
      <span
        className={`truncate text-xs ${filled ? "text-ice" : "text-muted"}`}
      >
        {text}
      </span>
    </span>
  );
}
