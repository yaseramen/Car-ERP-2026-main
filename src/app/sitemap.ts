import type { MetadataRoute } from "next";

function baseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "http://localhost:3000";
}

/** صفحات عامة للفهرسة — تساعد جوجل على اكتشاف الموقع */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = baseUrl();
  const paths = ["", "/how-it-works", "/faq", "/terms", "/login", "/register"];
  const now = new Date();

  return paths.map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: now,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
