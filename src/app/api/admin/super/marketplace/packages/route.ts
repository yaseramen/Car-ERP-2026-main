import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  try {
    const res = await db.execute({
      sql: `SELECT id, label_ar, duration_days, price, category_scope, sort_order, is_active
            FROM marketplace_ad_packages ORDER BY sort_order ASC`,
    });
    return NextResponse.json({
      packages: res.rows.map((r) => ({
        id: r.id,
        label_ar: r.label_ar,
        duration_days: Number(r.duration_days),
        price: Number(r.price),
        category_scope: r.category_scope,
        sort_order: Number(r.sort_order ?? 0),
        is_active: Number(r.is_active ?? 1) === 1,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل" }, { status: 500 });
  }
}
