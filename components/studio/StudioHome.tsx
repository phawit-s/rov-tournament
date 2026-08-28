"use client";

import Link from "next/link";
import { hasBackend } from "@/lib/backend/firebase";
import { useLive } from "@/lib/backend/live";
import { watchStreamerRequests, type StreamerRequest } from "@/lib/backend/roles";
import { useOwnChannels } from "@/hooks/useChannels";
import { useSiteRole } from "@/hooks/useRole";
import { useTournamentScope } from "@/hooks/useTournamentScope";
import type { Channel } from "@/lib/channel/types";
import { formatThaiDate } from "@/lib/tournament/share";
import { safeImageSrc } from "@/lib/safe";
import Panel, { PanelHeader } from "@/components/ui/Panel";
import Reveal from "@/components/ui/Reveal";
import PageHead from "./PageHead";
import Button from "@/components/ui/Button";
import { Meter } from "@/components/ui/hud";
import { IconExternal } from "@/components/ui/icons";
import { Badge, EmptyState, STATUS_META, Skeleton } from "@/components/tournament/ui";
import { STUDIO_GROUPS, STUDIO_NAV, type StudioItem } from "./nav";

const NO_REQUESTS: StreamerRequest[] = [];

/**
 * หน้าแรกของสตูดิโอ — ตอบสามคำถามที่ถามทุกครั้งที่เปิดหลังบ้าน
 * "มีอะไรค้างให้ทำ" · "ช่องเราเป็นยังไงอยู่" · "จะไปทำอะไรต่อ"
 *
 * ของเดิมตอบแค่ข้อสองกับสาม แล้ววางทางลัดทุกเมนูเป็นตารางเท่ากันหมด
 * ซึ่งอ่านแล้วไม่รู้ว่าควรเริ่มตรงไหน — งานที่ค้างจริงๆ (ใบคำขอ ทัวร์ที่กำลังแข่ง)
 * จึงถูกยกขึ้นมาเป็นแถวบนสุด และทางลัดถูกจัดกลุ่มตามจังหวะที่ใช้
 */
export default function StudioHome() {
  const { role, local, admin, uid } = useSiteRole();

  const { channels, loaded } = useOwnChannels(uid);
  const loading = !!uid && !loaded;

  const { list: tournaments } = useTournamentScope(admin, uid);

  // ใบคำขอที่ค้างอยู่ — ท่อเดียวกับที่แถบข้างใช้ทำตัวเลขบนเมนู ไม่ได้เปิดซ้ำ
  const { data: requests } = useLive<StreamerRequest[]>(
    admin && hasBackend ? "streamerRequests" : null,
    NO_REQUESTS,
    (onChange, onError) => watchStreamerRequests(onChange, onError),
  );
  const pending = requests.filter((r) => r.status === "pending").length;

  const running = tournaments.filter((t) => t.data.status === "running");
  const openReg = tournaments.filter((t) => t.data.status === "registration");
  const unpublished = tournaments.filter((t) => !t.onCloud).length;

  const shortcuts = STUDIO_NAV.filter(
    (item) => item.href !== "/studio/" && (admin || !item.admin),
  );

  return (
    <div className="space-y-8">
      <PageHead
        eyebrow="Studio"
        title="สตูดิโอ"
        description="ที่ทำงานของสตรีมเมอร์ — ตั้งค่าช่อง คุมคิวเพลง จับเวลาบนสตรีม และจัดทัวร์นาเมนต์"
        action={
          <Badge rgb="169 155 255" hex="var(--color-iris)">
            {local && !uid
              ? "โหมดเครื่องนี้"
              : role === "admin"
                ? "ผู้ดูแลระบบ"
                : role === "streamer"
                  ? "สตรีมเมอร์"
                  : "ผู้ใช้ทั่วไป"}
          </Badge>
        }
      />

      {/* ---- ตัวเลขประจำวัน ---- */}
      <Reveal>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Figure
            label="ช่องของคุณ"
            value={channels.length}
            hint={channels.length ? "กดเพื่อตั้งค่า" : "ยังไม่มี"}
            href={channels[0] ? `/studio/channel/#c=${channels[0].id}` : "/studio/channel/"}
          />
          <Figure
            label="กำลังแข่ง"
            value={running.length}
            hint={running[0]?.data.name ?? "ยังไม่มีทัวร์ที่เริ่มแล้ว"}
            href="/studio/tournaments/"
            tone={running.length ? "live" : undefined}
          />
          <Figure
            label="เปิดรับสมัคร"
            value={openReg.length}
            hint={openReg[0]?.data.name ?? "ยังไม่มีทัวร์ที่เปิดรับ"}
            href="/studio/tournaments/"
            tone={openReg.length ? "next" : undefined}
          />
          {admin ? (
            <Figure
              label="คำขอเป็นสตรีมเมอร์"
              value={pending}
              hint={pending ? "รอคุณกดอนุมัติ" : "ไม่มีใบค้าง"}
              href="/studio/roles/"
              tone={pending ? "next" : undefined}
            />
          ) : (
            <Figure
              label="ยังไม่ได้เผยแพร่"
              value={unpublished}
              hint={unpublished ? "อยู่ในเครื่องนี้เครื่องเดียว" : "เผยแพร่ครบแล้ว"}
              href="/studio/tournaments/"
            />
          )}
        </div>
      </Reveal>

      {/* ---- งานที่ค้าง ---- */}
      {admin && pending > 0 && (
        <Reveal>
          <Link href="/studio/roles/" className="block">
            <div
              className="tally sunken flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl py-3.5 pr-4 pl-5 transition-colors hover:text-ice"
              style={{ ["--st" as string]: "var(--st-next)" }}
            >
              <span className="slug">รออนุมัติ</span>
              <span className="text-sm text-ice">
                มีคำขอเป็นสตรีมเมอร์ {pending} ใบรอคุณกด
              </span>
              <span className="ml-auto font-display text-xs text-iris">ไปดู →</span>
            </div>
          </Link>
        </Reveal>
      )}

      {/* ---- ช่องของฉัน ---- */}
      <Reveal index={1}>
        <section>
          <SectionBar
            title="ช่องของฉัน"
            action={
              channels.length > 0 ? (
                <Link
                  href="/studio/channel/"
                  className="font-display text-xs text-muted transition-colors hover:text-iris"
                >
                  จัดการทั้งหมด →
                </Link>
              ) : undefined
            }
          />

          {!hasBackend ? (
            /* EmptyState มีกรอบของตัวเองอยู่แล้ว ห้ามครอบ Panel ทับ
               ไม่งั้นได้กล่องซ้อนกล่องซึ่งอ่านเป็น "การ์ดที่โหลดไม่ขึ้น" */
            <EmptyState
              title="เครื่องนี้ยังไม่ได้เชื่อมคลาวด์"
              description="โหมดนี้ใช้เครื่องมือที่ทำงานในเบราว์เซอร์ได้ทั้งหมด แต่ยังเปิดช่องรับโดเนทไม่ได้"
            />
          ) : !uid ? (
            /*
              เข้ามาด้วยรหัสผู้จัดในเครื่อง ยังไม่มีบัญชีผูกอยู่
              ช่องเป็นของบัญชี ไม่ใช่ของเครื่อง จึงยังไม่มีอะไรให้โชว์
            */
            <EmptyState
              title="ยังไม่ได้ล็อกอิน"
              description="ช่องผูกกับบัญชี ไม่ใช่กับเครื่อง — ล็อกอินก่อนถึงจะตั้งค่าช่องและรับโดเนทได้ · เครื่องมือที่ทำงานในเบราว์เซอร์ (สุ่มทีม วงล้อ จับเวลา widget) ใช้ได้เลยไม่ต้องล็อกอิน"
            />
          ) : loading ? (
            <Panel className="p-6">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="mt-3 h-5 w-40" />
              <Skeleton className="mt-6 h-20 w-full rounded-xl" />
            </Panel>
          ) : channels.length === 0 ? (
            <Panel variant="feature" className="p-6 sm:p-7">
              <PanelHeader eyebrow="Channel" title="ยังไม่มีช่อง" />
              <p className="text-sm leading-relaxed text-muted">
                ช่องคือที่รวมทุกอย่างของคุณ — พร้อมเพย์สำหรับรับโดเนท แพ็กเกจสมาชิก
                คิวขอเพลง และลิงก์ widget ที่ใช้ได้ตลอดโดยไม่ต้องเปลี่ยนทุกครั้งที่จัดทัวร์ใหม่
              </p>
              <Link href="/studio/channel/" className="mt-5 inline-flex">
                <Button>ตั้งค่าช่องของคุณ</Button>
              </Link>
            </Panel>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {channels.map((c) => (
                <ChannelCard key={c.id} channel={c} />
              ))}
            </div>
          )}
        </section>
      </Reveal>

      {/* ---- ทัวร์ล่าสุด ---- */}
      {tournaments.length > 0 && (
        <Reveal index={2}>
          <section>
            <SectionBar
              title="ทัวร์ล่าสุด"
              action={
                <Link
                  href="/studio/tournaments/"
                  className="font-display text-xs text-muted transition-colors hover:text-iris"
                >
                  ดูทั้งหมด {tournaments.length} รายการ →
                </Link>
              }
            />
            <Panel className="overflow-hidden p-0">
              <ul>
                {tournaments.slice(0, 5).map((row) => (
                  <li key={row.id} className="border-b border-hair last:border-0">
                    <Link
                      href={
                        row.onDevice
                          ? `/studio/tournament/#t=${row.id}`
                          : `/studio/tournament/#c=${row.id}`
                      }
                      className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-iris/6"
                    >
                      <span
                        aria-hidden
                        className="h-8 w-0.75 shrink-0 rounded-full"
                        style={{ background: STATUS_META[row.data.status].hex }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-sm text-ice">
                          {row.data.name || "ทัวร์นาเมนต์ไม่มีชื่อ"}
                        </span>
                        <span className="num mt-0.5 block truncate text-xs text-muted">
                          {STATUS_META[row.data.status].label} ·{" "}
                          {row.data.teams.length} ทีม
                          {row.ownerName && !row.mine ? ` · ${row.ownerName}` : ""}
                        </span>
                      </span>
                      {!row.onCloud && (
                        <span className="slug slug-2 hidden shrink-0 sm:block">
                          ยังไม่เผยแพร่
                        </span>
                      )}
                      <span aria-hidden className="shrink-0 text-xs text-muted">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        </Reveal>
      )}

      {/* ---- ทางลัด ---- */}
      <Reveal index={3}>
        <section>
          <SectionBar title="ไปที่" />
          <div className="space-y-6">
            {STUDIO_GROUPS.filter((g) =>
              shortcuts.some((s) => s.group === g.key),
            ).map((group) => (
              <div key={group.key}>
                <p className="slug mb-3">{group.title}</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {shortcuts
                    .filter((s) => s.group === group.key)
                    .map((item) => (
                      <Shortcut key={item.href} item={item} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </Reveal>
    </div>
  );
}

/** หัวข้อคั่นส่วน — เส้นบางพาดเต็มความกว้าง ให้หน้ายาวๆ อ่านเป็นบทๆ ได้ */
function SectionBar({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <p className="font-display text-sm font-medium text-ice">{title}</p>
      <span className="rule h-px flex-1" />
      {action}
    </div>
  );
}

/**
 * ตัวเลขหนึ่งช่อง — กดได้ พาไปที่ที่จัดการเรื่องนั้น
 * ตั้งใจให้เลขใหญ่กว่าป้ายมาก เพราะคนกวาดตาหาเลขก่อนเสมอ
 */
function Figure({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  href: string;
  tone?: "live" | "next";
}) {
  return (
    <Link href={href} className="group block">
      <div
        className={`tile hover-tile h-full rounded-2xl px-5 py-4 transition-colors ${
          tone ? "tally" : ""
        }`}
        style={tone ? ({ ["--st" as string]: `var(--st-${tone})` } as React.CSSProperties) : undefined}
      >
        <p className="slug">{label}</p>
        <p
          className={`fig num mt-1.5 text-[2.1rem] leading-none ${
            value === 0 ? "text-muted/45" : "text-ice"
          }`}
        >
          {value === 0 ? "—" : value}
        </p>
        <p className="mt-2 truncate text-xs text-muted transition-colors group-hover:text-iris">
          {hint}
        </p>
      </div>
    </Link>
  );
}

function Shortcut({ item }: { item: StudioItem }) {
  const Icon = item.Icon;
  return (
    <Link href={item.href} className="group block h-full">
      <div className="tile hover-tile flex h-full items-start gap-3 rounded-2xl p-4 transition-colors">
        <span className="sunken grid h-10 w-10 shrink-0 place-items-center rounded-xl text-iris transition-colors group-hover:bg-iris/12">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-display text-sm text-ice">
            {item.label}
            {item.external && (
              <IconExternal className="h-3 w-3 shrink-0 opacity-50" />
            )}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">
            {item.detail}
          </span>
        </span>
      </div>
    </Link>
  );
}

function ChannelCard({ channel }: { channel: Channel }) {
  const handle = channel.handle?.trim();
  const publicHref = `/c/#h=${handle || channel.id}`;
  const tiers = channel.member?.tiers?.length ?? 0;

  return (
    <Panel variant="feature" className="flex h-full flex-col p-6">
      <div className="flex items-start gap-4">
        {channel.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={safeImageSrc(channel.avatar) ?? ""}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
          />
        ) : (
          <span className="sunken grid h-14 w-14 shrink-0 place-items-center rounded-2xl font-display text-lg text-iris">
            {(channel.name || handle || "?").slice(0, 1).toUpperCase()}
          </span>
        )}

        <div className="min-w-0 grow">
          <p className="truncate font-display text-lg text-ice">
            {channel.name || "ยังไม่ได้ตั้งชื่อช่อง"}
          </p>
          <p className="num mt-0.5 truncate text-xs text-muted">
            {handle ? `@${handle}` : "ยังไม่ได้ตั้งชื่อในลิงก์"} · แก้ล่าสุด{" "}
            {formatThaiDate(channel.updatedAt)}
          </p>
        </div>

        {channel.live?.isLive && (
          <span
            className="tally shrink-0 rounded-full py-1 pr-3 pl-3.5 text-xs text-ice"
            style={{ ["--st" as string]: "var(--st-live)" }}
          >
            ไลฟ์อยู่
          </span>
        )}
      </div>

      {/* ระบบที่เปิดอยู่ — บอกด้วยแถบสั้นๆ ว่าตั้งไปแล้วกี่อย่างจากสี่อย่าง
          ทำให้ช่องที่ตั้งค่าค้างไว้ครึ่งทางเห็นได้ทันทีโดยไม่ต้องเปิดเข้าไปดู */}
      <ChannelReadiness channel={channel} />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {channel.donate?.enabled && <Badge rgb="169 155 255">รับโดเนท</Badge>}
        {channel.member?.enabled && (
          <Badge rgb="196 130 255">สมาชิก{tiers ? ` ${tiers} แพ็ก` : ""}</Badge>
        )}
        {channel.songs?.enabled && <Badge rgb="52 227 176">ขอเพลง</Badge>}
        {channel.timer?.enabled && <Badge rgb="110 155 240">จับเวลา</Badge>}
        {!channel.donate?.enabled &&
          !channel.member?.enabled &&
          !channel.songs?.enabled && (
            <span className="text-xs text-muted">ยังไม่ได้เปิดระบบไหนเลย</span>
          )}
      </div>

      <span className="rule my-5 block h-px" />

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {/* ★ ต้องพารหัสช่องไปด้วย ★ ของเดิมทุกการ์ดลิงก์ไป /studio/channel/ เฉยๆ
            กดจากช่องไหนก็ไปโผล่ช่องที่แก้ล่าสุดเหมือนกันหมด */}
        <Link href={`/studio/channel/#c=${channel.id}`}>
          <Button size="sm">ตั้งค่าช่อง</Button>
        </Link>
        {handle ? (
          <Link href={publicHref}>
            <Button size="sm" variant="ghost">
              เปิดหน้าสนับสนุน
            </Button>
          </Link>
        ) : (
          <span className="text-xs text-muted">
            ตั้งชื่อในลิงก์ก่อน คนอื่นถึงจะเปิดหน้าสนับสนุนได้
          </span>
        )}
        {channel.songs?.enabled && handle && (
          <Link href={`/song/#h=${handle}`}>
            <Button size="sm" variant="ghost">
              หน้าขอเพลง
            </Button>
          </Link>
        )}
      </div>
    </Panel>
  );
}

/** ตั้งค่าไปแล้วกี่อย่าง — นับของที่ทำให้ช่อง "ใช้งานได้จริง" ไม่ใช่ทุกฟิลด์ */
function ChannelReadiness({ channel }: { channel: Channel }) {
  const steps = [
    { ok: !!channel.handle?.trim(), label: "ชื่อในลิงก์" },
    { ok: !!channel.donate?.promptPayId?.trim(), label: "พร้อมเพย์" },
    { ok: !!channel.avatar || !!channel.cover, label: "รูปช่อง" },
    { ok: (channel.member?.tiers?.length ?? 0) > 0, label: "แพ็กเกจ" },
  ];
  const done = steps.filter((s) => s.ok).length;
  if (done === steps.length) return null;

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="slug slug-2">ตั้งค่าไปแล้ว</span>
        <span className="num font-display text-xs text-ice">
          {done}
          <span className="text-muted">/{steps.length}</span>
        </span>
      </div>
      <Meter pct={done / steps.length} h={3} className="mt-2" />
      <p className="mt-2 text-xs text-muted">
        ยังขาด: {steps.filter((s) => !s.ok).map((s) => s.label).join(" · ")}
      </p>
    </div>
  );
}
