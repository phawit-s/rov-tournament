import type { Metadata } from "next";
import StudioHome from "@/components/studio/StudioHome";

export const metadata: Metadata = {
  title: "สตูดิโอ — Steamer Hub",
  description: "หลังบ้านของสตรีมเมอร์ — ช่อง ทัวร์นาเมนต์ และกราฟิกสำหรับสตรีม",
};

export default function StudioPage() {
  return <StudioHome />;
}
