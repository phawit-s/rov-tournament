import type { NextConfig } from "next";

/**
 * GitHub Pages เสิร์ฟที่ https://<user>.github.io/<repo>/ ดังนั้นต้องมี basePath
 * ค่านี้ถูกเซ็ตอัตโนมัติโดย .github/workflows/deploy.yml จากชื่อ repo
 * ตอน dev จะเป็นค่าว่าง -> รันที่ http://localhost:3000/ ตามปกติ
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
