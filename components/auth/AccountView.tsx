"use client";

import { useState, useSyncExternalStore } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useIsAdmin } from "@/hooks/useAdmin";
import { recordActivity } from "@/lib/activity";
import { authStore, hasBackend } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import { formatThaiDate } from "@/lib/tournament/share";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import Panel, { PanelHeader } from "../ui/Panel";
import { PageHeading } from "../ui/Reveal";
import { toast } from "../ui/Toast";
import {
  ArtShield,
  Badge,
  EmptyState,
  Input,
  Label,
  Skeleton,
} from "../tournament/ui";

/**
 * โปรไฟล์ของตัวเอง
 *
 * ชื่อในเกมกับช่องทางติดต่อเป็นของที่เปลี่ยนบ่อย (ย้ายไอดี เปลี่ยนไลน์)
 * ถ้าถามแค่ตอนสมัครแล้วแก้ไม่ได้ ข้อมูลจะเน่าและผู้จัดติดต่อไม่ติด
 * หน้านี้จึงเปิดให้ทุกคนที่ล็อกอิน ไม่ใช่เฉพาะผู้ดูแล
 */
export default function AccountView() {
  useSyncExternalStore(
    profileStore.subscribe,
    profileStore.getSnapshot,
    profileStore.getServerSnapshot,
  );
  const authSnapshot = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    authStore.getServerSnapshot,
  );

  const isAdmin = useIsAdmin();
  const user = authStore.user();
  const state = profileStore.state();
  const profile = profileStore.profile();
  const [signOutOpen, setSignOutOpen] = useState(false);

  return (
    <div className="space-y-8">
      <PageHeading
        no="08"
        eyebrow="Account"
        title="โปรไฟล์ของฉัน"
        description="ชื่อในเกมกับช่องทางติดต่อที่ผู้จัดจะเห็นตอนคุณสมัครแข่ง แก้ได้ตลอดเวลา"
        meta={
          isAdmin ? (
            <Badge rgb="221 175 100" hex="#ddaf64">
              ผู้ดูแลระบบ
            </Badge>
          ) : undefined
        }
      />

      {!hasBackend ? (
        <EmptyState
          art={<ArtShield />}
          no="08"
          title="เครื่องนี้ยังไม่ได้เชื่อมคลาวด์"
          description="ข้อมูลทั้งหมดอยู่ในเบราว์เซอร์เครื่องนี้ จึงยังไม่มีบัญชีให้แก้โปรไฟล์"
        />
      ) : state === "loading" || authSnapshot === "loading" ? (
        <AccountSkeleton />
      ) : !user || user.anonymous || state === "none" ? (
        <EmptyState
          art={<ArtShield />}
          no="08"
          title="ยังอ่านโปรไฟล์ไม่ได้"
          description="ลองออกจากระบบแล้วล็อกอินใหม่อีกครั้ง ถ้ายังไม่ได้ให้ทักคนที่ดูแลเว็บ"
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {/*
            key ผูกกับค่าที่บันทึกไว้ เพื่อให้ฟอร์มรีเซ็ตตัวเองหลังบันทึกสำเร็จ
            หรือหลังมีการแก้จากอีกเครื่อง โดยไม่ต้อง setState ใน useEffect
          */}
          <ProfileForm
            key={`${profile?.gameName ?? ""}|${profile?.contact ?? ""}`}
            gameName={profile?.gameName ?? ""}
            contact={profile?.contact ?? ""}
          />

          <Panel className="p-6 sm:p-7">
            <PanelHeader eyebrow="Account" title="บัญชีนี้" />

            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-champagne/40">
                {user.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photo}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="font-display text-lg text-champagne">
                    {(profile?.gameName || user.name).slice(0, 1)}
                  </span>
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate font-display text-lg text-ice">
                  {profile?.gameName || user.name}
                </p>
                {isAdmin && (
                  <span className="mt-1.5 inline-flex">
                    <Badge rgb="221 175 100" hex="#ddaf64">
                      ผู้ดูแลระบบ
                    </Badge>
                  </span>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <InfoRow label="อีเมล" value={user.email ?? "ไม่มีอีเมลผูกไว้"} />
              <InfoRow label="ชื่อบัญชี" value={profile?.name || user.name} />
              <InfoRow label="สมัครเมื่อ" value={formatThaiDate(profile?.createdAt)} />
            </div>

            <span className="rule my-6 block h-px" />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSignOutOpen(true)}
            >
              ออกจากระบบ
            </Button>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              ออกแล้วข้อมูลโปรไฟล์ยังอยู่ ล็อกอินบัญชีเดิมก็เจอเหมือนเดิม
            </p>
          </Panel>
        </div>
      )}

      <ConfirmDialog
        open={signOutOpen}
        title="ออกจากระบบ?"
        description="ต้องล็อกอินใหม่ถึงจะสมัครแข่งหรือจัดการทัวร์ได้อีกครั้ง"
        confirmText="ออกจากระบบ"
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          void authStore
            .signOut()
            .then(() => {
              recordActivity("auth.signout", "ออกจากระบบจากหน้าโปรไฟล์");
              toast("ออกจากระบบแล้ว", "success");
            })
            .catch(() => toast("ออกจากระบบไม่สำเร็จ", "error"));
        }}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile flex items-center justify-between gap-4 rounded-xl px-4 py-3">
      <span className="slug slug-2 shrink-0">{label}</span>
      <span className="min-w-0 truncate text-right text-sm text-ice">{value}</span>
    </div>
  );
}

/** ฟอร์มแก้โปรไฟล์ — ค่าเริ่มต้นมาจาก props ผ่าน lazy initializer ครั้งเดียว */
function ProfileForm({
  gameName: initialGameName,
  contact: initialContact,
}: {
  gameName: string;
  contact: string;
}) {
  const reduced = useReducedMotion();
  const [gameName, setGameName] = useState(() => initialGameName);
  const [contact, setContact] = useState(() => initialContact);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty =
    gameName.trim() !== initialGameName.trim() ||
    contact.trim() !== initialContact.trim();

  const submit = async () => {
    const name = gameName.trim();
    if (!name) {
      toast("ชื่อในเกมเว้นว่างไม่ได้", "error");
      return;
    }
    setBusy(true);
    try {
      // ส่งสตริงว่างแทน undefined เพราะ Firestore ไม่รับค่า undefined
      await profileStore.save({ gameName: name, contact: contact.trim() });
      setSaved(true);
      toast("บันทึกโปรไฟล์แล้ว", "success");
    } catch {
      toast("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <Panel variant="feature" className="p-6 sm:p-7">
        <PanelHeader eyebrow="Profile" title="ข้อมูลที่ผู้จัดเห็น" />

        <div className="space-y-4">
          <div>
            <Label hint="ชื่อที่คนอื่นเห็นในสายการแข่ง ไม่เกิน 40 ตัว">
              ชื่อในเกม
            </Label>
            <Input
              value={gameName}
              onChange={(e) => {
                setGameName(e.target.value);
                setSaved(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="เช่น Violet"
              maxLength={40}
            />
          </div>

          <div>
            <Label hint="ไลน์ เบอร์ หรือดิสคอร์ด ไว้ให้ผู้จัดติดต่อกลับ — จะไม่ใส่ก็ได้">
              ช่องทางติดต่อ
            </Label>
            <Input
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                setSaved(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              placeholder="line: myid หรือ 08x-xxx-xxxx"
              maxLength={120}
            />
          </div>

          <Button
            className="w-full"
            loading={busy}
            success={saved}
            disabled={!dirty && !saved}
            onClick={() => void submit()}
          >
            {saved && !dirty ? "บันทึกแล้ว" : "บันทึกการแก้ไข"}
          </Button>
        </div>
      </Panel>
    </motion.div>
  );
}

function AccountSkeleton() {
  return (
    <div
      className="grid items-start gap-5 lg:grid-cols-2"
      aria-busy="true"
      aria-label="กำลังอ่านโปรไฟล์"
    >
      {[0, 1].map((i) => (
        <div key={i} className="surface hairline-top rounded-2xl p-6 sm:p-7">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="mt-3 h-5 w-40" />
          <Skeleton className="mt-6 h-3 w-24" />
          <Skeleton className="mt-2 h-11 w-full rounded-xl" />
          <Skeleton className="mt-5 h-3 w-28" />
          <Skeleton className="mt-2 h-11 w-full rounded-xl" />
          <Skeleton className="mt-6 h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
