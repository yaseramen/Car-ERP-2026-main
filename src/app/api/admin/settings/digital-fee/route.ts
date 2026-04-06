import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const settings = await db.execute({
    sql: "SELECT key, value FROM system_settings WHERE key IN ('digital_service_rate', 'digital_service_min_fee')",
  });
  const map: Record<string, string> = {};
  for (const r of settings.rows) {
    map[String(r.key)] = String(r.value ?? "");
  }
  return NextResponse.json({
    rate: map.digital_service_rate ?? "0.0001",
    minFee: map.digital_service_min_fee ?? "0.5",
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const body = await request.json();
  const rate = body.rate != null ? String(body.rate) : null;
  const minFee = body.minFee != null ? String(body.minFee) : null;

  if (rate != null) {
    const r = parseFloat(rate);
    if (isNaN(r) || r < 0) {
      return NextResponse.json({ error: "المعدل غير صالح" }, { status: 400 });
    }
    await db.execute({
      sql: "INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('digital_service_rate', ?, datetime('now'))",
      args: [rate],
    });
  }
  if (minFee != null) {
    const m = parseFloat(minFee);
    if (isNaN(m) || m < 0) {
      return NextResponse.json({ error: "الحد الأدنى غير صالح" }, { status: 400 });
    }
    await db.execute({
      sql: "INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('digital_service_min_fee', ?, datetime('now'))",
      args: [minFee],
    });
  }

  return NextResponse.json({ ok: true });
}
