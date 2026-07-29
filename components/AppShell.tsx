"use client";

import BackgroundFX from "./fx/BackgroundFX";
import IntroLoader from "./fx/IntroLoader";
import NavBar from "./NavBar";

export default function AppShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <>
      <IntroLoader />
      <BackgroundFX />

      <main
        className={`relative z-10 mx-auto flex min-h-dvh w-full flex-col gap-6 px-3 pt-[calc(0.75rem+var(--sat))] pb-[calc(2.5rem+var(--sab))] sm:px-5 lg:px-8 ${
          wide ? "max-w-420" : "max-w-350"
        }`}
      >
        <NavBar />

        <div className="flex-1 pt-2">{children}</div>

        <footer className="border-t border-hair pt-5 text-center text-xs text-muted">
          ข้อมูลเก็บในเบราว์เซอร์ของคุณ · เผยแพร่ขึ้นคลาวด์เมื่อกดเองเท่านั้น
        </footer>
      </main>
    </>
  );
}
