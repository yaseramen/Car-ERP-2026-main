import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { normalizeExpiryInput } from "@/lib/item-expiry-api";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const {
      name,
      code,
      barcode,
      category,
      unit,
      purchase_price,
      sale_price,
      min_quantity,
      min_quantity_enabled,
      has_expiry,
      expiry_date,
    } = body;

    const updates: string[] = ["updated_at = datetime('now')"];
    const args: (string | number | null)[] = [];

    if (name !== undefined) {
      updates.push("name = ?");
      args.push(name?.trim() || "");
    }
    if (code !== undefined) {
      const codeVal = code?.trim() || null;
      if (codeVal) {
        const existingCode = await db.execute({
          sql: `SELECT id FROM items WHERE company_id = ? AND id != ? AND code IS NOT NULL AND TRIM(code) != ''
                AND UPPER(TRIM(code)) = UPPER(?)`,
          args: [companyId, id, codeVal],
        });
        if (existingCode.rows.length > 0) {
          return NextResponse.json({ error: "كود المنتج مستخدم لصنف آخر" }, { status: 400 });
        }
      }
      updates.push("code = ?");
      args.push(codeVal);
    }
    if (barcode !== undefined) {
      const bcVal = barcode?.trim() || null;
      if (bcVal) {
        const dupBc = await db.execute({
          sql: `SELECT id FROM items WHERE company_id = ? AND id != ? AND barcode IS NOT NULL AND TRIM(barcode) != ''
                AND UPPER(TRIM(barcode)) = UPPER(?)`,
          args: [companyId, id, bcVal],
        });
        if (dupBc.rows.length > 0) {
          return NextResponse.json({ error: "الباركود مستخدم لصنف آخر" }, { status: 400 });
        }
      }
      updates.push("barcode = ?");
      args.push(bcVal);
    }
    if (category !== undefined) {
      updates.push("category = ?");
      args.push(category?.trim() || null);
    }
    if (unit !== undefined) {
      updates.push("unit = ?");
      args.push(unit?.trim() || "قطعة");
    }
    if (purchase_price !== undefined) {
      updates.push("purchase_price = ?");
      args.push(Number(purchase_price) || 0);
    }
    if (sale_price !== undefined) {
      updates.push("sale_price = ?");
      args.push(Number(sale_price) || 0);
    }
    if (min_quantity !== undefined || min_quantity_enabled !== undefined) {
      const minQty = min_quantity_enabled ? Number(min_quantity) || 0 : 0;
      updates.push("min_quantity = ?");
      args.push(minQty);
    }
    if (has_expiry !== undefined || expiry_date !== undefined) {
      try {
        const ex = normalizeExpiryInput({ has_expiry, expiry_date });
        updates.push("has_expiry = ?");
        args.push(ex.has_expiry);
        updates.push("expiry_date = ?");
        args.push(ex.expiry_date);
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "تاريخ غير صالح" }, { status: 400 });
      }
    }

    if (updates.length <= 1) {
      return NextResponse.json({ error: "لا توجد بيانات للتحديث" }, { status: 400 });
    }

    args.push(id, companyId);

    await db.execute({
      sql: `UPDATE items SET ${updates.join(", ")} WHERE id = ? AND company_id = ?`,
      args: args as (string | number)[],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Item update error:", error);
    return NextResponse.json({ error: "فشل في التحديث" }, { status: 500 });
  }
}

export async function DELETE(
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
    const usedInInvoices = await db.execute({
      sql: "SELECT 1 FROM invoice_items WHERE item_id = ? LIMIT 1",
      args: [id],
    });

    const usedInRepair = await db.execute({
      sql: "SELECT 1 FROM repair_order_items WHERE item_id = ? LIMIT 1",
      args: [id],
    });

    if (usedInInvoices.rows.length > 0 || usedInRepair.rows.length > 0) {
      await db.execute({
        sql: "UPDATE items SET is_active = 0, updated_at = datetime('now') WHERE id = ? AND company_id = ?",
        args: [id, companyId],
      });
      return NextResponse.json({ success: true, message: "تم تعطيل الصنف (مستخدم سابقاً)" });
    }

    await db.execute({
      sql: "DELETE FROM item_warehouse_stock WHERE item_id = ?",
      args: [id],
    });
    await db.execute({
      sql: "DELETE FROM items WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Item delete error:", error);
    return NextResponse.json({ error: "فشل في الحذف" }, { status: 500 });
  }
}
