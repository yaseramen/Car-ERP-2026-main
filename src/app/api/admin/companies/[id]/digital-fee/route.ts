import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (session?.user?.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const rate = body.rate;
  const minFee = body.minFee;
  const clear = body.clear === true;

  if (clear) {
    await db.execute({
      sql: "UPDATE companies SET digital_service_rate = NULL, digital_service_min_fee = NULL, updated_at = datetime('now') WHERE id = ?",
      args: [id],
    });
    return NextResponse.json({ ok: true });
  }

  if (rate === undefined && minFee === undefined) {
    return NextResponse.json({ error: "أرسل rate أو minFee أو كليهما" }, { status: 400 });
  }

  const updates: string[] = [];
  const args: (string | number | null)[] = [];

  if (rate !== undefined) {
    const r = parseFloat(String(rate));
    if (isNaN(r) || r < 0) {
      return NextResponse.json({ error: "المعدل غير صالح" }, { status: 400 });
    }
    updates.push("digital_service_rate = ?");
    args.push(r);
  }
  if (minFee !== undefined) {
    const m = parseFloat(String(minFee));
    if (isNaN(m) || m < 0) {
      return NextResponse.json({ error: "الحد الأدنى غير صالح" }, { status: 400 });
    }
    updates.push("digital_service_min_fee = ?");
    args.push(m);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE companies SET ${updates.join(", ")}, updated_at = datetime('now') WHERE id = ?`,
    args,
  });

  return NextResponse.json({ ok: true });
}
