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

  const { id: orderId } = await params;

  try {
    const result = await db.execute({
      sql: `SELECT ir.id, ir.checklist_item_id, ir.status, ir.notes, ci.name_ar
            FROM inspection_results ir
            JOIN inspection_checklist_items ci ON ci.id = ir.checklist_item_id
            WHERE ir.repair_order_id = ?
            ORDER BY ci.sort_order, ci.name_ar`,
      args: [orderId],
    });

    const results = result.rows.map((r) => ({
      id: r.id,
      checklist_item_id: r.checklist_item_id,
      name_ar: r.name_ar,
      status: r.status,
      notes: r.notes,
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Inspection results GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

export async function PUT(
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
    const { results, general_notes } = body as {
      results: { checklist_item_id: string; status: string; notes?: string }[];
      general_notes?: string;
    };

    if (!Array.isArray(results)) {
      return NextResponse.json({ error: "صيغة غير صالحة" }, { status: 400 });
    }

    const orderCheck = await db.execute({
      sql: "SELECT id FROM repair_orders WHERE id = ? AND company_id = ?",
      args: [orderId, companyId],
    });
    if (orderCheck.rows.length === 0) {
      return NextResponse.json({ error: "أمر غير موجود" }, { status: 404 });
    }

    for (const r of results) {
      const status = ["ok", "defect", "needs_repair", "na"].includes(r.status) ? r.status : "na";
      const notes = r.notes?.trim() || null;

      const existing = await db.execute({
        sql: "SELECT id FROM inspection_results WHERE repair_order_id = ? AND checklist_item_id = ?",
        args: [orderId, r.checklist_item_id],
      });

      if (existing.rows.length > 0) {
        await db.execute({
          sql: "UPDATE inspection_results SET status = ?, notes = ?, updated_at = datetime('now') WHERE repair_order_id = ? AND checklist_item_id = ?",
          args: [status, notes, orderId, r.checklist_item_id],
        });
      } else {
        await db.execute({
          sql: "INSERT INTO inspection_results (id, repair_order_id, checklist_item_id, status, notes) VALUES (?, ?, ?, ?, ?)",
          args: [randomUUID(), orderId, r.checklist_item_id, status, notes],
        });
      }
    }

    if (general_notes !== undefined) {
      await db.execute({
        sql: "UPDATE repair_orders SET inspection_notes = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
        args: [general_notes?.trim() || null, orderId, companyId],
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Inspection results PUT error:", error);
    return NextResponse.json({ error: "فشل في الحفظ" }, { status: 500 });
  }
}
