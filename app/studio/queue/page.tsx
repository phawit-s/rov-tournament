import type { Metadata } from "next";
import QueueManager from "@/components/song/QueueManager";
import { pageTitle } from "@/lib/brand";

export const metadata: Metadata = {
  title: pageTitle("คิวเพลง"),
  description: "จัดคิวเพลงที่คนดูขอเข้ามา เปิด ข้าม ลบ และย้ายขึ้นหัวคิว",
};

export default function StudioQueuePage() {
  return <QueueManager />;
}
