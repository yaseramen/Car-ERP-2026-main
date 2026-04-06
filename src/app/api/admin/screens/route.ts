import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const result = await db.execute({
      sql: "SELECT id, name_ar, name_en, module FROM screens ORDER BY name_ar",
    });

    const screens = result.rows.map((r) => ({
      id: String(r.id ?? ""),
      name_ar: String(r.name_ar ?? ""),
      name_en: String(r.name_en ?? ""),
      module: String(r.module ?? ""),
    }));

    return NextResponse.json(screens);
  } catch (error) {
    console.error("Screens GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
