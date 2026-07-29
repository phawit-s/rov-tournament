"use client";

import { safeImageSrc } from "@/lib/safe";
import { useState } from "react";
import { PRIZE_PRESETS, calcPrizes, formatMoney } from "@/lib/tournament/prize";
import { tournamentStore } from "@/lib/tournament/store";
import type { Tournament, TournamentStatus } from "@/lib/tournament/types";
import Button from "../ui/Button";
import Panel from "../ui/Panel";
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
};

const MAX_COVER_KB = 400;

/** ฟอร์มสร้าง/แก้ข้อมูลทัวร์ — เก็บลง localStorage ทันทีที่กดบันทึก */
export default function TournamentForm({ tournament, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Tournament>(tournament);
  const [coverError, setCoverError] = useState<string | null>(null);

  const set = <K extends keyof Tournament>(key: K, value: Tournament[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

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
    <Panel className="p-6 sm:p-7">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-display text-xl font-medium text-ice">
          {tournament.name ? "แก้ไขทัวร์นาเมนต์" : "สร้างทัวร์นาเมนต์"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-sm text-muted transition-colors hover:text-ice"
        >
          ✕ ปิด
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
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
              placeholder={"เช่น\n- แข่ง 5v5 โหมดจัดอันดับ\n- ห้ามใช้ตัวละครซ้ำในซีรีส์เดียวกัน"}
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
                <div className="grid h-16 w-28 place-items-center rounded-lg tile-dashed text-xs text-muted">
                  ยังไม่มีรูป
                </div>
              )}
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer rounded-lg tile px-3 py-1.5 text-xs text-ice/80 transition-colors hover-tile">
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
                    className="cursor-pointer text-xs text-muted transition-colors hover:text-[#e79a9a]"
                  >
                    ลบรูป
                  </button>
                )}
              </div>
            </div>
            {coverError && (
              <p className="mt-2 text-xs text-[#e79a9a]">{coverError}</p>
            )}
          </div>
        </div>

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
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set("entryMode", opt.value)}
                    className={`cursor-pointer rounded-xl px-4 py-3 text-left transition-all ${
                      active
                        ? "bg-champagne/14 shadow-[inset_0_0_0_1px_rgb(207_167_101/0.45)]"
                        : "tile hover:border-champagne/30"
                    }`}
                  >
                    <p
                      className={`font-display text-sm ${active ? "text-champagne" : "text-ice"}`}
                    >
                      {active && "✓ "}
                      {opt.title}
                    </p>
                    <p className="mt-1 text-xs text-muted">{opt.detail}</p>
                  </button>
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
            <div>
              <Label hint="0 = ไม่จำกัด">รับกี่ทีม</Label>
              <NumberInput
                min={0}
                max={64}
                value={draft.maxTeams}
                onChange={(maxTeams) => set("maxTeams", maxTeams)}
                placeholder="ไม่จำกัด"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>เปิดรับสมัคร</Label>
              <Input
                type="datetime-local"
                value={toLocalInput(draft.registerOpenAt)}
                onChange={(e) => set("registerOpenAt", fromLocalInput(e.target.value))}
              />
            </div>
            <div>
              <Label>ปิดรับสมัคร</Label>
              <Input
                type="datetime-local"
                value={toLocalInput(draft.registerCloseAt)}
                onChange={(e) => set("registerCloseAt", fromLocalInput(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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
                  <button
                    key={status}
                    type="button"
                    onClick={() => set("status", status)}
                    className="cursor-pointer rounded-lg px-3 py-1.5 font-display text-xs transition-all"
                    style={{
                      color: active ? meta.hex : "var(--color-muted)",
                      background: active ? `rgb(${meta.rgb} / 0.14)` : "transparent",
                      boxShadow: `inset 0 0 0 1px rgb(${meta.rgb} / ${active ? 0.4 : 0.15})`,
                    }}
                  >
                    {meta.label}
                  </button>
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
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() =>
                      set("prize", {
                        ...draft.prize,
                        slots: preset.slots.map((s) => ({ ...s })),
                      })
                    }
                    className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                      active
                        ? "bg-champagne/18 text-champagne shadow-[inset_0_0_0_1px_rgb(207_167_101/0.45)]"
                        : "tile text-muted hover:text-champagne"
                    }`}
                  >
                    {active && "✓ "}
                    {preset.name}
                  </button>
                );
              })}
            </div>

            {/* โชว์ผลทันทีที่กด ไม่งั้นดูเหมือนปุ่มไม่ทำงาน */}
            <ul className="mt-3 space-y-1.5 rounded-xl tile px-4 py-3">
              {prizePreview.breakdown.map((row) => (
                <li
                  key={row.slot.place}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-muted">
                    {row.slot.label}{" "}
                    <span className="text-muted/60">({row.slot.percent}%)</span>
                  </span>
                  <span className="font-display text-ice">
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
            <label className="mt-2.5 flex cursor-pointer items-center gap-2.5 text-sm text-ice/85">
              <input
                type="checkbox"
                checked={draft.live.isLive}
                onChange={(e) =>
                  set("live", { ...draft.live, isLive: e.target.checked })
                }
                className="h-4 w-4 accent-[#e0566b]"
              />
              ตอนนี้กำลังไลฟ์อยู่ (จะขึ้นป้าย LIVE)
            </label>
          </div>
        </div>
      </div>

      <div className="mt-7 flex flex-wrap justify-end gap-2.5">
        <Button variant="ghost" onClick={onClose}>
          ยกเลิก
        </Button>
        <Button onClick={save}>บันทึก</Button>
      </div>
    </Panel>
  );
}
