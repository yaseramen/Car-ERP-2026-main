import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { ensureCompanyWarehouse } from "@/lib/warehouse";
import { randomUUID } from "crypto";
import { parseInventorySpreadsheet } from "@/lib/inventory-import-parse";
import { normalizeExpiryInput } from "@/lib/item-expiry-api";
import { logAudit } from "@/lib/audit";
import type { InArgs } from "@libsql/core/api";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;
const MAX_ROWS = 500;
const MAX_FILE = 2 * 1024 * 1024;

function generateBarcode() {
  return "BC" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "يرجى اختيار ملف Excel أو CSV" }, { status: 400 });
    }
    if (file.size > MAX_FILE) {
      return NextResponse.json({ error: "حجم الملف يتجاوز 2 ميجابايت" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { rows, errors: parseErrors } = parseInventorySpreadsheet(buf);
    if (parseErrors.length > 0 && rows.length === 0) {
      return NextResponse.json({ error: parseErrors[0], errors: parseErrors }, { status: 400 });
    }
    if (rows.length === 0) {
      return NextResponse.json({ error: "لا توجد صفوف صالحة للاستيراد" }, { status: 400 });
    }
    if (rows.length > MAX_ROWS) {
      return NextResponse.json({ error: `الحد الأقصى ${MAX_ROWS} صفاً في ملف واحد` }, { status: 400 });
    }

    const warehouseId = await ensureCompanyWarehouse(companyId);

    const countResult = await db.execute({
      sql: "SELECT COUNT(*) as cnt FROM items WHERE company_id = ?",
      args: [companyId],
    });
    let seq = Number(countResult.rows[0]?.cnt ?? 0);

    const existingCodes = await db.execute({
      sql: "SELECT code FROM items WHERE company_id = ? AND code IS NOT NULL AND TRIM(code) != ''",
      args: [companyId],
    });
    const usedCodes = new Set(
      existingCodes.rows.map((r) => String(r.code ?? "").trim().toUpperCase()).filter(Boolean)
    );

    const existingBarcodes = await db.execute({
      sql: "SELECT barcode FROM items WHERE company_id = ? AND barcode IS NOT NULL AND TRIM(barcode) != ''",
      args: [companyId],
    });
    const usedBarcodes = new Set(
      existingBarcodes.rows.map((r) => String(r.barcode ?? "").trim().toUpperCase()).filter(Boolean)
    );

    const stmts: { sql: string; args: InArgs }[] = [];
    let created = 0;
    let skipped = 0;
    const rowErrors: string[] = [...parseErrors];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const line = i + 2;
      let code = r.code?.trim() || "";
      if (code) {
        const up = code.toUpperCase();
        if (usedCodes.has(up)) {
          skipped++;
          rowErrors.push(`السطر ${line}: الكود «${code}» مستخدم مسبقاً — تم التخطي`);
          continue;
        }
        usedCodes.add(up);
      } else {
        seq += 1;
        code = `PRD-${String(seq).padStart(4, "0")}`;
        while (usedCodes.has(code.toUpperCase())) {
          seq += 1;
          code = `PRD-${String(seq).padStart(4, "0")}`;
        }
        usedCodes.add(code.toUpperCase());
      }

      let barcode = r.barcode?.trim() || "";
      if (barcode) {
        const bu = barcode.toUpperCase();
        if (usedBarcodes.has(bu)) {
          skipped++;
          rowErrors.push(`السطر ${line}: الباركود «${barcode}» مستخدم مسبقاً — تم التخطي`);
          continue;
        }
        usedBarcodes.add(bu);
      } else {
        for (let a = 0; a < 25; a++) {
          const cand = generateBarcode();
          const cu = cand.toUpperCase();
          if (!usedBarcodes.has(cu)) {
            barcode = cand;
            usedBarcodes.add(cu);
            break;
          }
        }
        if (!barcode) {
          skipped++;
          rowErrors.push(`السطر ${line}: تعذر توليد باركود فريد — تم التخطي`);
          continue;
        }
      }
      const minQty = r.min_quantity > 0 ? r.min_quantity : 0;
      let expiryNorm: { has_expiry: number; expiry_date: string | null };
      try {
        expiryNorm = normalizeExpiryInput({
          has_expiry: r.has_expiry,
          expiry_date: r.expiry_date,
        });
      } catch {
        skipped++;
        rowErrors.push(`السطر ${line}: تاريخ صلاحية غير صالح — تم التخطي`);
        continue;
      }

      const id = randomUUID();
      stmts.push({
        sql: `INSERT INTO items (id, company_id, name, code, barcode, category, unit, purchase_price, sale_price, min_quantity, has_expiry, expiry_date)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          companyId,
          r.name.trim(),
          code,
          barcode,
          r.category?.trim() || null,
          r.unit.trim() || "قطعة",
          r.purchase_price,
          r.sale_price,
          minQty,
          expiryNorm.has_expiry,
          expiryNorm.expiry_date,
        ] as InArgs,
      });
      stmts.push({
        sql: "INSERT INTO item_warehouse_stock (id, item_id, warehouse_id, quantity) VALUES (?, ?, ?, 0)",
        args: [randomUUID(), id, warehouseId],
      });
      created++;
    }

    if (stmts.length > 0) {
      await db.batch(stmts, "write");
    }

    const issuerName = session.user.name ?? session.user.email ?? undefined;
    await logAudit({
      companyId,
      userId: session.user.id,
      userName: issuerName,
      action: "inventory_import",
      entityType: "items",
      entityId: companyId,
      details: `استيراد مخزن: ${created} صنف جديد${skipped ? `، ${skipped} صف متخطى` : ""}`,
    });

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      errors: rowErrors.length > 0 ? rowErrors.slice(0, 50) : undefined,
      message:
        created > 0
          ? `تم استيراد ${created} صنفاً بنجاح${skipped ? ` (${skipped} صفوف تُخطيت)` : ""}.`
          : "لم يُضف أي صنف — راجع الأخطاء.",
    });
  } catch (e) {
    console.error("inventory import:", e);
    return NextResponse.json({ error: "فشل الاستيراد" }, { status: 500 });
  }
}
