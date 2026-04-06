import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { ensureCompanyWarehouse } from "@/lib/warehouse";
import { getDistributionContext } from "@/lib/distribution";
import { randomUUID } from "crypto";
import { normalizeExpiryInput } from "@/lib/item-expiry-api";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

function generateBarcode() {
  return "BC" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function GET(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const categoryParam = searchParams.get("category")?.trim() || "";
  const inStockOnly = searchParams.get("in_stock") === "1" || searchParams.get("in_stock") === "true";
  const search = searchParams.get("search")?.trim() || "";
  const expiryFilter = searchParams.get("expiry")?.trim() || "";
  const usePagination =
    searchParams.has("limit") ||
    searchParams.has("offset") ||
    searchParams.get("search") ||
    categoryParam ||
    inStockOnly ||
    !!expiryFilter;
  /** حد أعلى أعلى للكاشير وقوائم كبيرة (كان 200 فيخفي أصناف عن البحث المحلي) */
  const limit = usePagination ? Math.min(3000, Math.max(1, Number(searchParams.get("limit")) || 50)) : 10000;
  const offset = usePagination ? Math.max(0, Number(searchParams.get("offset")) || 0) : 0;

  try {
    const dist = await getDistributionContext(session.user.id, companyId);
    const qtyExpr = dist
      ? `(SELECT COALESCE(quantity, 0) FROM item_warehouse_stock WHERE item_id = items.id AND warehouse_id = ?)`
      : `COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = items.id), 0)`;

    const stockPositive = dist
      ? `(SELECT COALESCE(quantity, 0) FROM item_warehouse_stock WHERE item_id = items.id AND warehouse_id = ?) > 0`
      : `COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = items.id), 0) > 0`;

    let sql = `SELECT id, name, code, barcode, category, unit, purchase_price, sale_price, min_quantity,
            IFNULL(has_expiry, 0) as has_expiry, expiry_date,
            ${qtyExpr} as quantity
            FROM items 
            WHERE company_id = ? AND is_active = 1`;
    const args: (string | number)[] = [];
    if (dist) {
      args.push(dist.assignedWarehouseId);
    }
    args.push(companyId);
    if (inStockOnly) {
      sql += ` AND ${stockPositive}`;
      if (dist) {
        args.push(dist.assignedWarehouseId);
      }
    }
    if (categoryParam === "__uncategorized__") {
      sql += ` AND (category IS NULL OR TRIM(category) = '')`;
    } else if (categoryParam) {
      sql += ` AND LOWER(TRIM(COALESCE(category,''))) = LOWER(?)`;
      args.push(categoryParam);
    }
    if (search) {
      sql += ` AND (LOWER(name) LIKE ? OR LOWER(COALESCE(code,'')) LIKE ? OR LOWER(COALESCE(barcode,'')) LIKE ? OR LOWER(COALESCE(category,'')) LIKE ?)`;
      const q = `%${search.toLowerCase()}%`;
      args.push(q, q, q, q);
    }
    if (expiryFilter === "tracked") {
      sql += ` AND IFNULL(has_expiry, 0) = 1`;
    } else if (expiryFilter === "expired") {
      sql += ` AND IFNULL(has_expiry, 0) = 1 AND expiry_date IS NOT NULL AND date(expiry_date) < date('now')`;
    } else if (expiryFilter === "soon") {
      sql += ` AND IFNULL(has_expiry, 0) = 1 AND expiry_date IS NOT NULL AND date(expiry_date) >= date('now') AND date(expiry_date) <= date('now', '+30 days')`;
    }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    args.push(limit, offset);

    let total = 0;
    if (usePagination) {
      const countArgs: (string | number)[] = [];
      let countWhere = "company_id = ? AND is_active = 1";
      countArgs.push(companyId);
      if (inStockOnly) {
        countWhere += ` AND ${stockPositive}`;
        if (dist) {
          countArgs.push(dist.assignedWarehouseId);
        }
      }
      if (categoryParam === "__uncategorized__") {
        countWhere += " AND (category IS NULL OR TRIM(category) = '')";
      } else if (categoryParam) {
        countWhere += " AND LOWER(TRIM(COALESCE(category,''))) = LOWER(?)";
        countArgs.push(categoryParam);
      }
      if (search) {
        countWhere += ` AND (LOWER(name) LIKE ? OR LOWER(COALESCE(code,'')) LIKE ? OR LOWER(COALESCE(barcode,'')) LIKE ? OR LOWER(COALESCE(category,'')) LIKE ?)`;
        const q = `%${search.toLowerCase()}%`;
        countArgs.push(q, q, q, q);
      }
      if (expiryFilter === "tracked") {
        countWhere += ` AND IFNULL(has_expiry, 0) = 1`;
      } else if (expiryFilter === "expired") {
        countWhere += ` AND IFNULL(has_expiry, 0) = 1 AND expiry_date IS NOT NULL AND date(expiry_date) < date('now')`;
      } else if (expiryFilter === "soon") {
        countWhere += ` AND IFNULL(has_expiry, 0) = 1 AND expiry_date IS NOT NULL AND date(expiry_date) >= date('now') AND date(expiry_date) <= date('now', '+30 days')`;
      }
      const countResult = await db.execute({
        sql: `SELECT COUNT(*) as cnt FROM items WHERE ${countWhere}`,
        args: countArgs,
      });
      total = Number(countResult.rows[0]?.cnt ?? 0);
    }

    const result = await db.execute({ sql, args });

    const role = session.user.role;
    const items = result.rows.map((row) => {
      const base = {
        id: row.id,
        name: row.name,
        code: row.code,
        barcode: row.barcode,
        category: row.category,
        unit: row.unit || "قطعة",
        sale_price: row.sale_price ?? 0,
        min_quantity: row.min_quantity ?? 0,
        has_expiry: Number(row.has_expiry ?? 0) === 1,
        expiry_date: row.expiry_date ? String(row.expiry_date) : null,
        quantity: row.quantity ?? 0,
      };
      if (role === "employee") {
        return base;
      }
      return {
        ...base,
        purchase_price: row.purchase_price ?? 0,
      };
    });

    if (usePagination) return NextResponse.json({ items, total });
    return NextResponse.json(items);
  } catch (error) {
    console.error("Inventory GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, code, barcode, category, unit, purchase_price, sale_price, min_quantity, min_quantity_enabled } = body;

    let expiryNorm: { has_expiry: number; expiry_date: string | null };
    try {
      expiryNorm = normalizeExpiryInput(body);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "تاريخ غير صالح" }, { status: 400 });
    }

    if (!name?.trim()) {
      return NextResponse.json({ error: "اسم القطعة مطلوب" }, { status: 400 });
    }

    const warehouseId = await ensureCompanyWarehouse(companyId);
    const id = randomUUID();

    let autoCode = code?.trim() || "";
    if (autoCode) {
      const existingCode = await db.execute({
        sql: `SELECT id FROM items WHERE company_id = ? AND code IS NOT NULL AND TRIM(code) != ''
              AND UPPER(TRIM(code)) = UPPER(?)`,
        args: [companyId, autoCode],
      });
      if (existingCode.rows.length > 0) {
        return NextResponse.json({ error: "كود المنتج مستخدم لصنف آخر" }, { status: 400 });
      }
    } else {
      const countResult = await db.execute({
        sql: "SELECT COUNT(*) as cnt FROM items WHERE company_id = ?",
        args: [companyId],
      });
      const count = (countResult.rows[0]?.cnt as number) ?? 0;
      autoCode = `PRD-${String(count + 1).padStart(4, "0")}`;
    }
    const barcodeTrim = barcode?.trim() ?? "";
    let autoBarcode = "";
    if (barcodeTrim) {
      const dupBc = await db.execute({
        sql: `SELECT id FROM items WHERE company_id = ? AND barcode IS NOT NULL AND TRIM(barcode) != ''
              AND UPPER(TRIM(barcode)) = UPPER(?)`,
        args: [companyId, barcodeTrim],
      });
      if (dupBc.rows.length > 0) {
        return NextResponse.json({ error: "الباركود مستخدم لصنف آخر" }, { status: 400 });
      }
      autoBarcode = barcodeTrim;
    } else {
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = generateBarcode();
        const clash = await db.execute({
          sql: `SELECT id FROM items WHERE company_id = ? AND barcode IS NOT NULL AND TRIM(barcode) != ''
                AND UPPER(TRIM(barcode)) = UPPER(?)`,
          args: [companyId, candidate],
        });
        if (clash.rows.length === 0) {
          autoBarcode = candidate;
          break;
        }
      }
      if (!autoBarcode) {
        return NextResponse.json({ error: "تعذر توليد باركود فريد — أعد المحاولة" }, { status: 409 });
      }
    }

    const minQty = min_quantity_enabled ? Number(min_quantity) || 0 : 0;

    await db.execute({
      sql: `INSERT INTO items (id, company_id, name, code, barcode, category, unit, purchase_price, sale_price, min_quantity, has_expiry, expiry_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        companyId,
        name.trim(),
        autoCode,
        autoBarcode,
        category?.trim() || null,
        unit?.trim() || "قطعة",
        Number(purchase_price) || 0,
        Number(sale_price) || 0,
        minQty,
        expiryNorm.has_expiry,
        expiryNorm.expiry_date,
      ],
    });

    await db.execute({
      sql: "INSERT INTO item_warehouse_stock (id, item_id, warehouse_id, quantity) VALUES (?, ?, ?, 0)",
      args: [randomUUID(), id, warehouseId],
    });

    const newItem = await db.execute({
      sql: `SELECT id, name, code, barcode, category, unit, purchase_price, sale_price, min_quantity,
            IFNULL(has_expiry, 0) as has_expiry, expiry_date, 0 as quantity
            FROM items WHERE id = ?`,
      args: [id],
    });

    const row = newItem.rows[0];
    return NextResponse.json({
      id: row.id,
      name: row.name,
      code: row.code,
      barcode: row.barcode,
      category: row.category,
      unit: row.unit || "قطعة",
      purchase_price: row.purchase_price ?? 0,
      sale_price: row.sale_price ?? 0,
      min_quantity: row.min_quantity ?? 0,
      has_expiry: Number(row.has_expiry ?? 0) === 1,
      expiry_date: row.expiry_date ? String(row.expiry_date) : null,
      quantity: 0,
    });
  } catch (error) {
    console.error("Inventory POST error:", error);
    return NextResponse.json({ error: "فشل في حفظ الصنف" }, { status: 500 });
  }
}
