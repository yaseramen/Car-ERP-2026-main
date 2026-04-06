import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const updates: string[] = [];
  const args: (string | number)[] = [];
  if (typeof body.label_ar === "string" && body.label_ar.trim()) {
    updates.push("label_ar = ?");
    args.push(body.label_ar.trim());
  }
  if (body.price != null && Number.isFinite(Number(body.price)) && Number(body.price) >= 0) {
    updates.push("price = ?");
    args.push(Number(body.price));
  }
  if (body.duration_days != null && Number.isFinite(Number(body.duration_days)) && Number(body.duration_days) > 0) {
    updates.push("duration_days = ?");
    args.push(Math.floor(Number(body.duration_days)));
  }
  if (body.sort_order != null && Number.isFinite(Number(body.sort_order))) {
    updates.push("sort_order = ?");
    args.push(Math.floor(Number(body.sort_order)));
  }
  if (body.is_active === true || body.is_active === false) {
    updates.push("is_active = ?");
    args.push(body.is_active ? 1 : 0);
  }
  if (["parts", "workshop", "both"].includes(String(body.category_scope))) {
    updates.push("category_scope = ?");
    args.push(String(body.category_scope));
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "لا حقول للتحديث" }, { status: 400 });
  }
  updates.push("updated_at = datetime('now')");
  args.push(id);

  try {
    const res = await db.execute({
      sql: `UPDATE marketplace_ad_packages SET ${updates.join(", ")} WHERE id = ?`,
      args,
    });
    const n = "rowsAffected" in res ? (res as { rowsAffected: number }).rowsAffected : 0;
    if (n === 0) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "فشل" }, { status: 500 });
  }
}
