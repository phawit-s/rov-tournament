"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { ROLE_LABEL, useSiteRole, type SiteRole } from "@/hooks/useRole";
import { authStore, hasBackend, type AuthUser } from "@/lib/backend/firebase";
import { profileStore } from "@/lib/backend/users";
import { formatThaiDate } from "@/lib/format";
import { Avatar } from "../SiteHeader";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { toast } from "../ui/Toast";
import { Badge, EmptyState, Input, Skeleton } from "../ui/kit";

/**
 * โปรไฟล์ของตัวเอง
 *
 * ชื่อที่แสดงเป็นของที่คนอยากเปลี่ยน (เปลี่ยนชื่อเล่น ไม่อยากให้ชื่อจริงขึ้นจอ)
 * ถ้าถามแค่ตอนสมัครแล้วแก้ไม่ได้ ชื่อบนจอไลฟ์จะค้างเป็นของเก่าตลอดไป
 * หน้านี้จึงเปิดให้ทุกคนที่ล็อกอิน ไม่ใช่เฉพาะสตรีมเมอร์
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

  const { role, studio } = useSiteRole();
  const user = authStore.user();
  const state = profileStore.state();
  const profile = profileStore.profile();
  const profileError = profileStore.error();
  const [signOutOpen, setSignOutOpen] = useState(false);

  return (
    <div className="max-w-160 space-y-12">
      <h1 className="text-headline font-bold">โปรไฟล์</h1>

      {!hasBackend ? (
        <EmptyState
          title="เว็บนี้ยังไม่ได้เชื่อมฐานข้อมูล"
          description="ตั้งค่า Firebase แล้ว build ใหม่ ถึงจะมีบัญชีให้แก้โปรไฟล์"
        />
      ) : state === "loading" || authSnapshot === "loading" ? (
        <AccountSkeleton />
      ) : !user || user.anonymous || state === "none" ? (
        /*
          ทางออกต้องอยู่นอกส่วนที่พัง

          ของเดิมปุ่มออกจากระบบอยู่ในส่วน "บัญชีนี้" ซึ่งจะไม่ถูกเรนเดอร์เลย
          ถ้าอ่านโปรไฟล์ไม่ผ่าน — คนที่เจอปัญหานี้จึงติดอยู่กับหน้าที่บอกให้
          "ลองออกจากระบบ" แต่ไม่มีปุ่มให้กด
        */
        <section aria-labelledby="profile-error-title">
          <h2 id="profile-error-title" className="text-title font-bold">
            อ่านโปรไฟล์ไม่ได้
          </h2>
          <p className="mt-2 text-muted">
            บัญชียังล็อกอินอยู่ แต่ดึงโปรไฟล์จากฐานข้อมูลไม่สำเร็จ ลองโหลดหน้าใหม่
            ถ้ายังไม่ได้ ให้ออกจากระบบแล้วล็อกอินอีกครั้ง
          </p>

          {profileError && (
            <p className="num mt-4 rounded-field bg-fill px-4 py-3 text-sm break-all text-muted">
              สาเหตุจากระบบ: <code>{profileError}</code>
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => window.location.reload()}>โหลดหน้าใหม่</Button>
            {user && (
              <Button variant="secondary" onClick={() => setSignOutOpen(true)}>
                ออกจากระบบ
              </Button>
            )}
          </div>

          <div className="mt-6 space-y-2 text-sm text-muted">
            <p>
              ถ้าสาเหตุคือ <code>permission-denied</code> แปลว่ากติกาความปลอดภัยของ
              Firestore ยังไม่ถูกส่งขึ้นไป ต้อง deploy <code>firestore.rules</code>{" "}
              แยกจากการ deploy เว็บ
            </p>
            <p>
              ถ้าเป็น <code>unavailable</code> ให้ลองปิดส่วนขยายกันโฆษณาเฉพาะเว็บนี้
              หรือเปลี่ยนเครือข่าย
            </p>
          </div>
        </section>
      ) : (
        <>
          {/*
            key ผูกกับค่าที่บันทึกไว้ เพื่อให้ฟอร์มรีเซ็ตตัวเองหลังบันทึกสำเร็จ
            หรือหลังมีการแก้จากอีกเครื่อง โดยไม่ต้อง setState ใน useEffect
          */}
          <ProfileForm key={profile?.gameName ?? ""} gameName={profile?.gameName ?? ""} />

          <AccountSection
            user={user}
            accountName={profile?.name || user.name}
            createdAt={profile?.createdAt}
            role={role}
            onSignOut={() => setSignOutOpen(true)}
          />
        </>
      )}

      {/*
        ทางเข้าสตูดิโอ — สตรีมเมอร์ได้ทางลัดเข้าไปทำงาน
        คนทั่วไปได้รู้ว่าเปิดคิวขอเพลงให้ช่องตัวเองได้ และต้องไปขอที่ไหน
      */}
      {hasBackend && user && !user.anonymous && <StudioEntry studio={studio} />}

      <ConfirmDialog
        open={signOutOpen}
        title="ออกจากระบบ?"
        description="ขอเพลงได้เหมือนเดิมโดยไม่ต้องล็อกอิน แต่จะเข้าสตูดิโอกับตัวเล่นเพลงได้ต้องล็อกอินใหม่"
        confirmText="ออกจากระบบ"
        tone="default"
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          setSignOutOpen(false);
          void authStore
            .signOut()
            .then(() => toast("ออกจากระบบแล้ว", "success"))
            .catch(() => toast("ออกจากระบบไม่สำเร็จ ลองใหม่อีกครั้ง", "error"));
        }}
      />
    </div>
  );
}

/** ฟอร์มแก้ชื่อที่แสดง — ค่าเริ่มต้นมาจาก props ผ่าน lazy initializer ครั้งเดียว */
function ProfileForm({ gameName: initialGameName }: { gameName: string }) {
  const [gameName, setGameName] = useState(() => initialGameName);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = gameName.trim() !== initialGameName.trim();

  const submit = async () => {
    const name = gameName.trim();
    if (!name) {
      toast("ใส่ชื่อที่แสดงก่อนกดบันทึก", "error");
      return;
    }
    setBusy(true);
    try {
      await profileStore.save({ gameName: name });
      setSaved(true);
      toast("บันทึกชื่อแล้ว", "success");
    } catch {
      toast("บันทึกไม่สำเร็จ เช็คอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="profile-name-title">
      <h2 id="profile-name-title" className="text-title font-bold">
        ชื่อที่แสดง
      </h2>
      <p className="mt-1 text-muted">
        ขึ้นบนจอไลฟ์ตอนคุณขอเพลง ระบบเติมชื่อนี้ให้เองทุกครั้งที่ล็อกอินอยู่
      </p>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="mt-5 flex gap-2"
      >
        <label htmlFor="profile-name" className="sr-only">
          ชื่อที่แสดง
        </label>
        <Input
          id="profile-name"
          value={gameName}
          onChange={(e) => {
            setGameName(e.target.value);
            setSaved(false);
          }}
          placeholder="เช่น Mint"
          maxLength={40}
          autoComplete="nickname"
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          className="min-h-12"
          loading={busy}
          success={saved}
          disabled={!dirty && !saved}
        >
          {saved && !dirty ? "บันทึกแล้ว" : "บันทึก"}
        </Button>
      </form>
    </section>
  );
}

function AccountSection({
  user,
  accountName,
  createdAt,
  role,
  onSignOut,
}: {
  user: AuthUser;
  accountName: string;
  createdAt?: string;
  role: SiteRole;
  onSignOut: () => void;
}) {
  return (
    <section aria-labelledby="account-title" className="surface p-6 sm:p-8">
      <h2 id="account-title" className="text-title font-bold">
        บัญชีที่ล็อกอินอยู่
      </h2>

      <div className="mt-5 flex items-center gap-4">
        <Avatar user={user} className="h-14 w-14 text-xl!" />
        <div className="min-w-0">
          <p className="truncate font-semibold">{accountName}</p>
          <p className="truncate text-sm text-muted">{user.email ?? "ไม่มีอีเมลผูกไว้"}</p>
        </div>
      </div>

      <dl className="rows mt-5">
        <InfoRow label="สิทธิ์" value={<Badge>{ROLE_LABEL[role]}</Badge>} />
        <InfoRow label="สมัครเมื่อ" value={formatThaiDate(createdAt)} />
      </dl>

      <Button variant="secondary" className="mt-6" onClick={onSignOut}>
        ออกจากระบบ
      </Button>
      <p className="mt-3 text-sm text-muted">
        ออกแล้วชื่อที่แสดงกับสิทธิ์ยังอยู่ครบ ล็อกอินบัญชีเดิมก็กลับมาเหมือนเดิม
      </p>
    </section>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="num min-w-0 truncate text-right">{value}</dd>
    </div>
  );
}

/**
 * ทางเข้าสตูดิโอ — ต่างกันสองแบบตามสิทธิ์
 * มีสิทธิ์แล้ว = ทางลัดเข้าไปทำงาน ยังไม่มี = ชวนส่งคำขอเปิดคิวเพลง
 */
function StudioEntry({ studio }: { studio: boolean }) {
  return (
    <section aria-labelledby="studio-entry-title" className="surface p-6 sm:p-8">
      <h2 id="studio-entry-title" className="text-title font-bold">
        {studio ? "สตูดิโอของคุณ" : "เป็นสตรีมเมอร์?"}
      </h2>
      <p className="mt-2 max-w-xl text-muted">
        {studio
          ? "จัดคิวเพลง เปิดตัวเล่น ตั้งค่าช่อง และเอาลิงก์สำหรับ OBS ไปใส่ไลฟ์"
          : "เปิดคิวขอเพลงให้ช่องของคุณ คนดูสแกน QR บนไลฟ์แล้วขอเพลงได้ทันที ส่งคำขอที่สตูดิโอแล้วรอผู้ดูแลอนุมัติ"}
      </p>
      <Link
        href="/studio/"
        className={`mt-5 inline-flex min-h-11 items-center rounded-full px-5 font-medium transition-[background-color,opacity] ${
          studio ? "bg-ink text-onink hover:opacity-85" : "bg-fill text-ink hover:bg-fill-2"
        }`}
      >
        {studio ? "เข้าสตูดิโอ" : "ขอเปิดคิวเพลงให้ช่องของคุณ"}
      </Link>
    </section>
  );
}

function AccountSkeleton() {
  return (
    <div className="space-y-12" aria-busy="true" aria-label="กำลังอ่านโปรไฟล์">
      <div>
        <Skeleton className="h-7 w-40" />
        <Skeleton className="mt-3 h-4 w-4/5" />
        <div className="mt-5 flex gap-2">
          <Skeleton className="h-12 min-w-0 flex-1 rounded-field" />
          <Skeleton className="h-12 w-24 rounded-full" />
        </div>
      </div>
      <div className="surface p-6 sm:p-8">
        <Skeleton className="h-7 w-52" />
        <div className="mt-5 flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3.5 w-1/2" />
          </div>
        </div>
      </div>
    </div>
  );
}
