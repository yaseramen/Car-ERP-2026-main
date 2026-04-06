import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await db.execute({
      sql: "SELECT id, description, quantity, unit_price, total, discount_type, discount_value, tax_percent, created_at FROM repair_order_services WHERE repair_order_id = ? ORDER BY created_at",
      args: [id],
    });

    const services = result.rows.map((r) => {
      const qty = Number(r.quantity ?? 1);
      const up = Number(r.unit_price ?? 0);
      const dt = (r.discount_type as string) || null;
      const dv = Number(r.discount_value ?? 0);
      const tp = r.tax_percent != null ? Number(r.tax_percent) : null;
      const base = qty * up;
      let disc = 0;
      if (dt === "percent" && dv > 0) disc = base * (Math.min(100, dv) / 100);
      else if (dt === "amount" && dv > 0) disc = Math.min(base, dv);
      const after = Math.max(0, base - disc);
      let tax = 0;
      if (tp != null && tp > 0) tax = after * (Math.min(100, tp) / 100);
      const total = Math.round((after + tax) * 100) / 100;
      return {
        id: r.id,
        description: String(r.description ?? ""),
        quantity: qty,
        unit_price: up,
        discount_type: dt,
        discount_value: dv,
        tax_percent: tp,
        total,
        created_at: r.created_at,
      };
    });

    return NextResponse.json(services);
  } catch (error) {
    console.error("Services GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: orderId } = await params;

  try {
    const body = await request.json();
    const { description, quantity, unit_price, discount_type, discount_value, tax_percent } = body;

    if (!description?.trim()) {
      return NextResponse.json({ error: "وصف الخدمة مطلوب" }, { status: 400 });
    }

    const qty = Number(quantity) || 1;
    const price = Number(unit_price) || 0;
    const dt = discount_type === "percent" || discount_type === "amount" ? discount_type : null;
    const dv = Math.max(0, Number(discount_value ?? 0));
    const tp = tax_percent != null && !Number.isNaN(Number(tax_percent)) ? Number(tax_percent) : null;
    const base = qty * price;
    let disc = 0;
    if (dt === "percent" && dv > 0) disc = base * (Math.min(100, dv) / 100);
    else if (dt === "amount" && dv > 0) disc = Math.min(base, dv);
    const after = Math.max(0, base - disc);
    let tax = 0;
    if (tp != null && tp > 0) tax = after * (Math.min(100, tp) / 100);
    const total = Math.round((after + tax) * 100) / 100;

    const orderCheck = await db.execute({
      sql: "SELECT id, invoice_id FROM repair_orders WHERE id = ? AND company_id = ?",
      args: [orderId, companyId],
    });
    if (orderCheck.rows.length === 0) {
      return NextResponse.json({ error: "أمر غير موجود" }, { status: 404 });
    }
    if (orderCheck.rows[0]?.invoice_id) {
      return NextResponse.json({ error: "لا يمكن التعديل بعد إصدار الفاتورة" }, { status: 400 });
    }

    const serviceId = randomUUID();
    await db.execute({
      sql: "INSERT INTO repair_order_services (id, repair_order_id, description, quantity, unit_price, total, discount_type, discount_value, tax_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      args: [serviceId, orderId, description.trim(), qty, price, total, dt, dv, tp],
    });

    return NextResponse.json({
      id: serviceId,
      description: description.trim(),
      quantity: qty,
      unit_price: price,
      discount_type: dt,
      discount_value: dv,
      tax_percent: tp,
      total,
    });
  } catch (error) {
    console.error("Service POST error:", error);
    return NextResponse.json({ error: "فشل في إضافة الخدمة" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: orderId } = await params;

  try {
    const body = await request.json();
    const { service_id: svcId, discount_type, discount_value, tax_percent } = body;
    if (!svcId) return NextResponse.json({ error: "معرف الخدمة مطلوب" }, { status: 400 });

    const orderCheck = await db.execute({
      sql: "SELECT invoice_id FROM repair_orders WHERE id = ? AND company_id = ?",
      args: [orderId, companyId],
    });
    if (orderCheck.rows.length === 0) return NextResponse.json({ error: "أمر غير موجود" }, { status: 404 });
    if (orderCheck.rows[0]?.invoice_id) {
      return NextResponse.json({ error: "لا يمكن التعديل بعد إصدار الفاتورة" }, { status: 400 });
    }

    const svc = await db.execute({
      sql: "SELECT quantity, unit_price FROM repair_order_services WHERE id = ? AND repair_order_id = ?",
      args: [svcId, orderId],
    });
    if (svc.rows.length === 0) return NextResponse.json({ error: "الخدمة غير موجودة" }, { status: 404 });

    const qty = Number(svc.rows[0].quantity ?? 1);
    const price = Number(svc.rows[0].unit_price ?? 0);
    const dt = discount_type === "percent" || discount_type === "amount" ? discount_type : null;
    const dv = Math.max(0, Number(discount_value ?? 0));
    const tp = tax_percent != null && !Number.isNaN(Number(tax_percent)) ? Number(tax_percent) : null;

    const base = qty * price;
    let disc = 0;
    if (dt === "percent" && dv > 0) disc = base * (Math.min(100, dv) / 100);
    else if (dt === "amount" && dv > 0) disc = Math.min(base, dv);
    const after = Math.max(0, base - disc);
    let tax = 0;
    if (tp != null && tp > 0) tax = after * (Math.min(100, tp) / 100);
    const total = Math.round((after + tax) * 100) / 100;

    await db.execute({
      sql: "UPDATE repair_order_services SET discount_type = ?, discount_value = ?, tax_percent = ?, total = ? WHERE id = ?",
      args: [dt, dv, tp, total, svcId],
    });

    const res = await db.execute({
      sql: "SELECT id, description, quantity, unit_price, total FROM repair_order_services WHERE id = ?",
      args: [svcId],
    });
    const r = res.rows[0] as Record<string, unknown>;
    return NextResponse.json({
      id: r.id,
      description: r.description,
      quantity: r.quantity,
      unit_price: r.unit_price,
      discount_type: dt,
      discount_value: dv,
      tax_percent: tp,
      total: r.total,
    });
  } catch (error) {
    console.error("Update service error:", error);
    return NextResponse.json({ error: "فشل في التحديث" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const serviceId = searchParams.get("service_id");
  if (!serviceId) {
    return NextResponse.json({ error: "معرف الخدمة مطلوب" }, { status: 400 });
  }

  const { id: orderId } = await params;

  try {
    const orderCheck = await db.execute({
      sql: "SELECT invoice_id FROM repair_orders WHERE id = ? AND company_id = ?",
      args: [orderId, companyId],
    });
    if (orderCheck.rows.length === 0) return NextResponse.json({ error: "أمر غير موجود" }, { status: 404 });
    if (orderCheck.rows[0]?.invoice_id) {
      return NextResponse.json({ error: "لا يمكن التعديل بعد إصدار الفاتورة" }, { status: 400 });
    }
    const svcCheck = await db.execute({
      sql: "SELECT id FROM repair_order_services WHERE id = ? AND repair_order_id = ?",
      args: [serviceId, orderId],
    });
    if (svcCheck.rows.length === 0) return NextResponse.json({ error: "الخدمة غير موجودة" }, { status: 404 });

    await db.execute({
      sql: "DELETE FROM repair_order_services WHERE id = ?",
      args: [serviceId],
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Service DELETE error:", error);
    return NextResponse.json({ error: "فشل في الحذف" }, { status: 500 });
  }
}
