import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const limit = Math.min(100, Math.max(5, Number(new URL(request.url).searchParams.get("limit")) || 40));
  try {
    const res = await db.execute({
      sql: `SELECT l.id, l.title_ar, l.status, l.ends_at, c.name as company_name, l.company_id
            FROM marketplace_listings l
            JOIN companies c ON c.id = l.company_id
            ORDER BY l.created_at DESC LIMIT ?`,
      args: [limit],
    });
    return NextResponse.json({
      listings: res.rows.map((r) => ({
        id: r.id,
        title_ar: r.title_ar,
        status: r.status,
        ends_at: r.ends_at,
        company_name: r.company_name,
        company_id: r.company_id,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل" }, { status: 500 });
  }
}
