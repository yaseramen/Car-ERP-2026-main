import { NextResponse } from "next/server";
import { auth } from "@/auth";
import helpGuide from "@/content/help-guide.json";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

type ReleaseNotif = { id: string; title: string; body: string; link?: string };

export async function GET() {
  const session = await auth();
  if (!session?.user || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const raw = helpGuide as {
    appVersion?: string;
    releaseNotifications?: ReleaseNotif[];
  };

  const notifications = Array.isArray(raw.releaseNotifications)
    ? raw.releaseNotifications.filter((n) => n?.id && n?.title && n?.body)
    : [];

  return NextResponse.json({
    appVersion: raw.appVersion ?? "0.0.0",
    notifications,
  });
}
