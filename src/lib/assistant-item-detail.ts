/**
 * تفاصيل صنف مع بحث تقريبي (اسم، باركود، كود).
 */

import { db } from "@/lib/db/client";
import type { DistributionContext } from "@/lib/distribution";
import { extractSearchPhrase, likePatternsForPhrase, scoreNameMatch } from "@/lib/assistant-text-fuzzy";

const MAX_SCAN = 400;

export async function answerItemDetail(
  companyId: string,
  message: string,
  dist: DistributionContext | null
): Promise<string | null> {
  const phrase = extractSearchPhrase(message, [
    "صنف",
    "قطعه",
    "قطعة",
    "منتج",
    "مخزون",
    "تفاصيل",
    "مواصفات",
    "بيانات",
    "سيريال",
    "سريال",
    "serial",
    "باركود",
    "كود",
    "رصيد",
    "كميه",
    "كمية",
    "stock",
    "اعرض",
    "عرض",
  ]);
  if (phrase.length < 2) return null;

  const patterns = likePatternsForPhrase(phrase);
  if (patterns.length === 0) return null;

  const qtyExpr = dist
    ? `(SELECT COALESCE(quantity, 0) FROM item_warehouse_stock WHERE item_id = items.id AND warehouse_id = ?)`
    : `COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = items.id), 0)`;

  let sql = `SELECT items.id, items.name, items.code, items.barcode, items.category, items.unit,
            items.purchase_price, items.sale_price, items.min_quantity,
            ${qtyExpr} as qty
            FROM items
            WHERE items.company_id = ? AND items.is_active = 1 AND (`;
  const args: (string | number)[] = [];
  if (dist) args.push(dist.assignedWarehouseId);
  args.push(companyId);

  const ors: string[] = [];
  for (const p of patterns) {
    ors.push(
      `(LOWER(items.name) LIKE ? OR LOWER(COALESCE(items.code,'')) LIKE ? OR LOWER(COALESCE(items.barcode,'')) LIKE ? OR LOWER(COALESCE(items.category,'')) LIKE ?)`
    );
    args.push(p, p, p, p);
  }
  sql += ors.join(" OR ");
  sql += `) LIMIT ${MAX_SCAN}`;

  const res = await db.execute({ sql, args });
  if (res.rows.length === 0) {
    return `لم يُعثر على صنف يطابق «${phrase}»${dist ? ` في مخزن «${dist.warehouseName}»` : ""}. جرّب كتابة اسم أو باركود أو جزء من الاسم.`;
  }

  let best: { row: (typeof res.rows)[0]; score: number } | null = null;
  for (const row of res.rows) {
    const name = String(row.name ?? "");
    const sc = scoreNameMatch(phrase, name);
    const bc = String(row.barcode ?? "");
    const code = String(row.code ?? "");
    let bonus = 0;
    if (bc && phrase.replace(/\s/g, "").toLowerCase() === bc.replace(/\s/g, "").toLowerCase()) bonus += 300;
    if (code && phrase.replace(/\s/g, "").toLowerCase() === code.replace(/\s/g, "").toLowerCase()) bonus += 300;
    const total = sc + bonus;
    if (!best || total > best.score) best = { row, score: total };
  }
  if (!best) return null;

  const r = best.row;
  const name = String(r.name ?? "");
  const qty = Number(r.qty ?? 0);
  const minQ = Number(r.min_quantity ?? 0);
  const low = minQ > 0 && qty < minQ ? " ⚠️ تحت الحد الأدنى للمخزون" : "";
  const whNote = dist ? `\nالمخزن: ${dist.warehouseName}` : "";
  const barcode = r.barcode ? String(r.barcode) : "—";
  const code = r.code ? String(r.code) : "—";
  const cat = r.category ? String(r.category) : "—";
  const unit = r.unit ? String(r.unit) : "قطعة";
  const pp = Number(r.purchase_price ?? 0);
  const sp = Number(r.sale_price ?? 0);

  const wantsSerial = /سيريال|سريال|serial/i.test(message);
  const serialNote = wantsSerial
    ? "\n\nملاحظة: لا يوجد في قاعدة البيانات حقل «سيريال» منفصل لكل قطعة؛ للمرجع يُستخدم **الباركود** و**رمز الصنف** أعلاه. إن كنت تخزّن أرقام تسلسل لكل قطعة، يمكن تسجيلها في ملاحظات الصنف أو في حقل الباركود إن كان فريداً لكل وحدة."
    : "";

  return `تفاصيل الصنف (المطابقة الأقرب لـ «${phrase}»):
الاسم: ${name}
الرمز: ${code}
الباركود: ${barcode}
الفئة: ${cat}
الوحدة: ${unit}
سعر الشراء: ${pp.toFixed(2)} ج.م — سعر البيع: ${sp.toFixed(2)} ج.م
الكمية المتاحة${dist ? " في مخزنك" : ""}: ${qty}${low}${whNote}${serialNote}`;
}
