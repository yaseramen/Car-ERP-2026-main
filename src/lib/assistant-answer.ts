/**
 * مساعد داخلي بدون APIs خارجية — إجابات من قاعدة البيانات فقط، مع احترام الصلاحيات.
 */

import { db } from "@/lib/db/client";
import type { DistributionContext } from "@/lib/distribution";
import { extractSearchPhrase, likePatternsForPhrase, stripDiacritics } from "@/lib/assistant-text-fuzzy";
import { resolvePartyForLedger } from "@/lib/assistant-party-resolve";
import { answerCustomerStatement, answerSupplierStatement } from "@/lib/assistant-party-ledger";
import { answerItemDetail } from "@/lib/assistant-item-detail";

export type AssistantMode = "company" | "obd_global";

export { ASSISTANT_COMPANY_COST_EGP, ASSISTANT_OBD_GLOBAL_COST_EGP } from "@/lib/assistant-pricing";

type PermCheck = (module: string) => Promise<boolean>;

function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** يستخرج أول كود يشبه P0xxx من النص */
export function extractObdCodeFromMessage(message: string): string | null {
  const m = message.toUpperCase().match(/\b(P|C|B|U)[0-9A-Z]{3,5}\b/);
  return m ? normalizeCode(m[0]) : null;
}

/** أول 15 صنفاً نشطاً — للقوائم العامة */
export async function answerInventoryListTop(
  companyId: string,
  dist: DistributionContext | null
): Promise<string> {
  const qtyExpr = dist
    ? `(SELECT COALESCE(quantity, 0) FROM item_warehouse_stock WHERE item_id = items.id AND warehouse_id = ?)`
    : `COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = items.id), 0)`;

  let sql = `SELECT items.name, ${qtyExpr} as qty, items.sale_price
            FROM items WHERE items.company_id = ? AND items.is_active = 1`;
  const args: (string | number)[] = [];
  if (dist) args.push(dist.assignedWarehouseId);
  args.push(companyId);
  sql += ` ORDER BY items.name ASC LIMIT 15`;

  const res = await db.execute({ sql, args });
  if (res.rows.length === 0) return "لا توجد أصناف مسجّلة.";
  const whNote = dist ? ` — مخزن: ${dist.warehouseName}` : "";
  const lines = res.rows.map((row) => {
    const name = String(row.name ?? "");
    const qty = Number(row.qty ?? 0);
    const price = Number(row.sale_price ?? 0);
    return `• ${name}: ${qty} — ${price.toFixed(2)} ج.م`;
  });
  return `أول الأصناف (حتى 15)${whNote}:\n${lines.join("\n")}`;
}

/** ملخص مخزون / أصناف — حسب صلاحية المخزن ومخزن التوزيع */
export async function answerInventoryQuery(
  companyId: string,
  message: string,
  dist: DistributionContext | null
): Promise<string | null> {
  const m = stripDiacritics(message).toLowerCase();

  const wantsSearch =
    /صنف|قطعه|قطعة|باركود|كود|منتج|مخزون|كميه|كمية|رصيد|يوجد|عندي|available|stock/i.test(m) ||
    m.split(/\s+/).length >= 2;

  if (!wantsSearch) return null;

  const searchPhrase = extractSearchPhrase(message, []);
  const patterns = searchPhrase.length >= 2 ? likePatternsForPhrase(searchPhrase) : [];

  const qtyExpr = dist
    ? `(SELECT COALESCE(quantity, 0) FROM item_warehouse_stock WHERE item_id = items.id AND warehouse_id = ?)`
    : `COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = items.id), 0)`;

  let sql = `SELECT items.id, items.name, items.code, items.barcode, items.category,
            ${qtyExpr} as qty,
            items.min_quantity, items.sale_price
            FROM items
            WHERE items.company_id = ? AND items.is_active = 1`;
  const args: (string | number)[] = [];
  if (dist) args.push(dist.assignedWarehouseId);
  args.push(companyId);

  if (patterns.length > 0) {
    const ors: string[] = [];
    for (const p of patterns) {
      ors.push(
        `(LOWER(items.name) LIKE ? OR LOWER(COALESCE(items.code,'')) LIKE ?
         OR LOWER(COALESCE(items.barcode,'')) LIKE ? OR LOWER(COALESCE(items.category,'')) LIKE ?)`
      );
      args.push(p, p, p, p);
    }
    sql += ` AND (${ors.join(" OR ")})`;
  }

  sql += ` ORDER BY items.name ASC LIMIT 15`;

  const res = await db.execute({ sql, args });
  if (res.rows.length === 0) {
    return searchPhrase
      ? `لا توجد أصناف مطابقة لـ «${searchPhrase}»${dist ? ` في مخزن «${dist.warehouseName}»` : ""}.`
      : "لم يُعثر على أصناف مطابقة. جرّب كتابة اسم أو باركود أو جزء من اسم الصنف.";
  }

  const lines = res.rows.map((row) => {
    const name = String(row.name ?? "");
    const qty = Number(row.qty ?? 0);
    const minQ = Number(row.min_quantity ?? 0);
    const price = Number(row.sale_price ?? 0);
    const low = minQ > 0 && qty < minQ ? " ⚠️ تحت الحد الأدنى" : "";
    const whNote = dist ? ` [${dist.warehouseName}]` : "";
    return `• ${name}${whNote}: الكمية ${qty}${low} — سعر البيع ${price.toFixed(2)} ج.م`;
  });

  return `نتائج المخزون:\n${lines.join("\n")}`;
}

export async function answerInvoiceSnippet(companyId: string): Promise<string> {
  const res = await db.execute({
    sql: `SELECT invoice_number, type, status, total, datetime(created_at) as created_at
          FROM invoices WHERE company_id = ? ORDER BY created_at DESC LIMIT 5`,
    args: [companyId],
  });
  if (res.rows.length === 0) return "لا توجد فواتير مسجّلة بعد.";
  const lines = res.rows.map((r) => {
    const num = String(r.invoice_number ?? "");
    const typ = String(r.type ?? "");
    const st = String(r.status ?? "");
    const tot = Number(r.total ?? 0);
    const dt = String(r.created_at ?? "");
    return `• ${num} (${typ}) — ${st} — ${tot.toFixed(2)} ج.م — ${dt}`;
  });
  return `آخر الفواتير:\n${lines.join("\n")}`;
}

/** آخر فواتير مرتجعة / مرتبطة بإرجاع */
export async function answerReturnInvoicesSnippet(companyId: string): Promise<string> {
  const res = await db.execute({
    sql: `SELECT invoice_number, type, status, total, datetime(created_at) as created_at, IFNULL(is_return, 0) as is_ret
          FROM invoices
          WHERE company_id = ? AND (IFNULL(is_return, 0) = 1 OR status = 'returned')
          ORDER BY created_at DESC LIMIT 8`,
    args: [companyId],
  });
  if (res.rows.length === 0) {
    return "لا توجد فواتير مسجّلة كمرتجع في الفترة الأخيرة (أو لا توجد سجلات مطابقة).";
  }
  const lines = res.rows.map((r) => {
    const num = String(r.invoice_number ?? "");
    const typ = String(r.type ?? "");
    const st = String(r.status ?? "");
    const tot = Number(r.total ?? 0);
    const dt = String(r.created_at ?? "");
    const ret = Number(r.is_ret ?? 0) === 1 ? " [مرتجع]" : "";
    return `• ${num} (${typ})${ret} — ${st} — ${tot.toFixed(2)} ج.م — ${dt}`;
  });
  return `آخر المرتجعات / الفواتير ذات حالة مرتجع:\n${lines.join("\n")}`;
}

/** بحث موردين بالاسم أو الهاتف أو قائمة مختصرة */
export async function answerSuppliersQuery(companyId: string, message: string): Promise<string> {
  const m = stripDiacritics(message).toLowerCase();
  const wantsList = /قائمه|قائمة|كل الموردين|كل موردين|عرض الموردين|موردين$/i.test(m);

  const searchPhrase = extractSearchPhrase(message, ["مورد", "موردين", "supplier"]);
  const patterns = !wantsList && searchPhrase.length >= 2 ? likePatternsForPhrase(searchPhrase) : [];

  let sql = `SELECT name, phone, email FROM suppliers WHERE company_id = ? AND is_active = 1`;
  const args: (string | number)[] = [companyId];
  if (patterns.length > 0) {
    const ors: string[] = [];
    for (const p of patterns) {
      ors.push(`(LOWER(name) LIKE ? OR LOWER(COALESCE(phone,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?)`);
      args.push(p, p, p);
    }
    sql += ` AND (${ors.join(" OR ")})`;
  }
  sql += ` ORDER BY name ASC LIMIT 15`;

  const res = await db.execute({ sql, args });
  if (res.rows.length === 0) {
    return searchPhrase && !wantsList
      ? `لا يوجد مورد مطابق لـ «${searchPhrase}».`
      : "لا يوجد موردون نشطون مسجّلون.";
  }
  const lines = res.rows.map((r) => {
    const name = String(r.name ?? "");
    const phone = r.phone ? String(r.phone) : "—";
    return `• ${name} — ${phone}`;
  });
  return `الموردون:\n${lines.join("\n")}`;
}

/** بحث عملاء بالاسم أو الهاتف أو قائمة مختصرة */
export async function answerCustomersQuery(companyId: string, message: string): Promise<string> {
  const m = stripDiacritics(message).toLowerCase();
  const wantsList = /قائمه|قائمة|كل العملاء|كل الزباين|عرض العملاء|العملاء$/i.test(m);

  const searchPhrase = extractSearchPhrase(message, ["عميل", "العميل", "زبون", "زباين", "customer", "عملاء"]);
  const patterns = !wantsList && searchPhrase.length >= 2 ? likePatternsForPhrase(searchPhrase) : [];

  let sql = `SELECT name, phone, email FROM customers WHERE company_id = ? AND is_active = 1`;
  const args: (string | number)[] = [companyId];
  if (patterns.length > 0) {
    const ors: string[] = [];
    for (const p of patterns) {
      ors.push(`(LOWER(name) LIKE ? OR LOWER(COALESCE(phone,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ?)`);
      args.push(p, p, p);
    }
    sql += ` AND (${ors.join(" OR ")})`;
  }
  sql += ` ORDER BY name ASC LIMIT 15`;

  const res = await db.execute({ sql, args });
  if (res.rows.length === 0) {
    return searchPhrase && !wantsList
      ? `لا يوجد عميل مطابق لـ «${searchPhrase}».`
      : "لا يوجد عملاء نشطون مسجّلون.";
  }
  const lines = res.rows.map((r) => {
    const name = String(r.name ?? "");
    const phone = r.phone ? String(r.phone) : "—";
    return `• ${name} — ${phone}`;
  });
  return `العملاء:\n${lines.join("\n")}`;
}

/** ملخص أرقام للتقارير (آخر 30 يوم) — من جدول الفواتير */
export async function answerReportsSummary(companyId: string): Promise<string> {
  const since = "datetime('now', '-30 days')";

  const byType = await db.execute({
    sql: `SELECT type, COUNT(*) as n, COALESCE(SUM(total), 0) as s
          FROM invoices
          WHERE company_id = ? AND datetime(created_at) >= ${since}
          GROUP BY type`,
    args: [companyId],
  });

  const retRes = await db.execute({
    sql: `SELECT COUNT(*) as c, COALESCE(SUM(ABS(total)), 0) as t
          FROM invoices
          WHERE company_id = ? AND datetime(created_at) >= ${since}
            AND (IFNULL(is_return, 0) = 1 OR status = 'returned')`,
    args: [companyId],
  });

  const retCount = Number(retRes.rows[0]?.c ?? 0);
  const retSum = Number(retRes.rows[0]?.t ?? 0);

  const lines: string[] = [];
  lines.push("ملخص آخر 30 يوماً (من سجلات الفواتير):");
  for (const row of byType.rows) {
    const typ = String(row.type ?? "");
    const n = Number(row.n ?? 0);
    const s = Number(row.s ?? 0);
    const label = typ === "sale" ? "بيع" : typ === "purchase" ? "شراء" : typ === "maintenance" ? "صيانة" : typ;
    lines.push(`• ${label}: ${n} فاتورة — إجمالي المبالغ ${s.toFixed(2)} ج.م`);
  }
  if (byType.rows.length === 0) {
    lines.push("• لا توجد فواتير في آخر 30 يوماً.");
  }
  lines.push(`• مرتجعات (عدد السجلات ذات صفة مرتجع): ${retCount} — مجموع المبالغ ${retSum.toFixed(2)} ج.م`);
  lines.push("\n(لتقارير تفصيلية استخدم شاشة التقارير في البرنامج.)");

  return lines.join("\n");
}

export async function answerCompanyAssistant(
  companyId: string,
  message: string,
  dist: DistributionContext | null,
  can: PermCheck
): Promise<{ reply: string }> {
  const m = stripDiacritics(message).toLowerCase();

  const ledgerKeywords =
    /كشف\s*حساب|كشفحساب|حساب\s*(العميل|الزبون|المورد|عميل|مورد|زبون)|مديون|المديونيه|المديونية|دين\s*(عميل|زبون|مورد)|رصيد\s*(العميل|الزبون|المورد|عميل|مورد|زبون)/i.test(
      m
    );
  const customerBrowseKeywords =
    /عميل|زبون|عملاء|customer/i.test(m) && !ledgerKeywords;
  const returnKeywords =
    /مرتجع|مرتجعات|استرجاع|ارجاع|إرجاع|return|مرتجعه|مرتجعة|فواتير مرتجعه|فواتير مرتجعة/i.test(m);
  const supplierKeywords = /مورد|موردين|موردون|supplier/i.test(m) && !ledgerKeywords;
  const reportKeywords =
    /تقارير|تقرير|احصائيات|إحصائيات|احصائيه|إحصائيه|اداء|أداء|ايراد|إيراد|مبيعات|اداء المبيعات|ملخص عام|ملخص الفواتير|ملخص المبيعات|ملخص للشراء/i.test(m) ||
    (/ملخص/.test(m) && /فاتور|بيع|شراء|مبيع|شركات/i.test(m));

  const itemDetailKeywords =
    /تفاصيل|مواصفات|بيانات\s*الصنف|سيريال|سريال|serial|باركود\s*الصنف/i.test(m);
  const invKeywords =
    /مخزون|صنف|قطعه|قطعة|باركود|منتج|كميه|كمية|رصيد|stock|قطع/i.test(m);
  const invListKeywords = /قائمه|قائمة|كل الاصناف|كل الأصناف|عرض الاصناف|عرض الأصناف/i.test(m);
  const invSummaryKeywords =
    /(كم صنف|عدد الاصناف|عدد الأصناف|ملخص\s*المخزون|احصائيه\s*المخزون|إحصائيه\s*المخزون)/i.test(m);

  const invoiceKeywords = /فاتوره|فاتورة|بيع|شراء|صيانه|صيانة|invoice/i.test(m);

  if (ledgerKeywords) {
    if (!(await can("invoices"))) {
      return { reply: "لا تملك صلاحية عرض الفواتير/كشف الحساب." };
    }
    const resolved = await resolvePartyForLedger(companyId, message);
    if (!resolved) {
      return {
        reply:
          "لم أستطع ربط الاسم بعميل أو مورد. اكتب مثلاً: «كشف حساب عميل أحمد» أو «حساب مورد …» أو رقم الهاتف.",
      };
    }
    if (resolved.kind === "customer" && !(await can("customers"))) {
      return { reply: "لا تملك صلاحية عرض بيانات العملاء." };
    }
    if (resolved.kind === "supplier" && !(await can("suppliers"))) {
      return { reply: "لا تملك صلاحية عرض بيانات الموردين." };
    }
    const hint = ` (تم الربط بـ «${resolved.party.name}»)`;
    if (resolved.kind === "customer") {
      const text = await answerCustomerStatement(companyId, resolved.party.id, resolved.party.name);
      return { reply: `${text}${hint}` };
    }
    const text = await answerSupplierStatement(companyId, resolved.party.id, resolved.party.name);
    return { reply: `${text}${hint}` };
  }

  if (returnKeywords) {
    if (!(await can("invoices"))) {
      return { reply: "لا تملك صلاحية عرض الفواتير/المرتجعات." };
    }
    const snippet = await answerReturnInvoicesSnippet(companyId);
    return { reply: snippet };
  }

  if (customerBrowseKeywords) {
    if (!(await can("customers"))) {
      return { reply: "لا تملك صلاحية عرض العملاء. اطلب صلاحية «العملاء» (عرض)." };
    }
    const snippet = await answerCustomersQuery(companyId, message);
    return { reply: snippet };
  }

  if (supplierKeywords) {
    if (!(await can("suppliers"))) {
      return { reply: "لا تملك صلاحية عرض الموردين. اطلب صلاحية «الموردون» (عرض)." };
    }
    const snippet = await answerSuppliersQuery(companyId, message);
    return { reply: snippet };
  }

  if (reportKeywords) {
    if (!(await can("reports"))) {
      return { reply: "لا تملك صلاحية التقارير. اطلب صلاحية «التقارير» (عرض)." };
    }
    const snippet = await answerReportsSummary(companyId);
    return { reply: snippet };
  }

  if (itemDetailKeywords) {
    if (!(await can("inventory"))) {
      return { reply: "لا تملك صلاحية عرض تفاصيل الأصناف." };
    }
    const detail = await answerItemDetail(companyId, message, dist);
    if (detail) return { reply: detail };
  }

  if (invKeywords || invListKeywords || invSummaryKeywords) {
    if (!(await can("inventory"))) {
      return { reply: "لا تملك صلاحية عرض المخزون. اطلب من المسؤول منح صلاحية «المخزن» (عرض)." };
    }
    if (invSummaryKeywords && !invKeywords && !invListKeywords) {
      const countRes = await db.execute({
        sql: "SELECT COUNT(*) as c FROM items WHERE company_id = ? AND is_active = 1",
        args: [companyId],
      });
      const n = Number(countRes.rows[0]?.c ?? 0);
      return { reply: `عدد الأصناف النشطة في الشركة: ${n}. للبحث عن صنف معيّن اكتب اسمه أو الباركود.` };
    }
    if (invListKeywords && !invKeywords) {
      const list = await answerInventoryListTop(companyId, dist);
      return { reply: list };
    }
    const inv = await answerInventoryQuery(companyId, message, dist);
    if (inv) return { reply: inv };
  }

  if (invoiceKeywords) {
    if (!(await can("invoices"))) {
      return { reply: "لا تملك صلاحية عرض الفواتير." };
    }
    const snippet = await answerInvoiceSnippet(companyId);
    return { reply: snippet };
  }

  return {
    reply:
      "يمكنني مساعدتك ضمن بيانات شركتك فقط. أمثلة: «كشف حساب عميل …» أو «حساب مورد …»، «تفاصيل صنف …»، «مخزون …»، «عميل …»، «مورد …»، «تقرير». للأكواد العامة اختر «أكواد السيارات» (1 ج.م).",
  };
}

export async function answerObdGlobalFromDb(code: string): Promise<{ reply: string; found: boolean }> {
  const normalized = normalizeCode(code);
  const res = await db.execute({
    sql: `SELECT code, description_ar, description_en, causes, solutions, symptoms
          FROM obd_codes WHERE company_id IS NULL AND UPPER(TRIM(code)) = ? LIMIT 1`,
    args: [normalized],
  });
  if (res.rows.length === 0) {
    return {
      found: false,
      reply: `لا يوجد سجل لكود «${normalized}» في قاعدة الأكواد العامة داخل البرنامج. يمكنك استخدام صفحة OBD للبحث الموسّع عبر أداة EFCT (برسوم أخرى إن وُجدت).`,
    };
  }
  const row = res.rows[0];
  const desc = String(row.description_ar ?? row.description_en ?? "—");
  const causes = String(row.causes ?? "").replace(/\|/g, " • ");
  const sol = String(row.solutions ?? "").replace(/\|/g, " • ");
  const sym = String(row.symptoms ?? "").replace(/\|/g, " • ");
  let text = `الكود: ${normalized}\nالوصف: ${desc}`;
  if (causes) text += `\nأسباب محتملة: ${causes}`;
  if (sol) text += `\nحلول عملية: ${sol}`;
  if (sym) text += `\nأعراض شائعة: ${sym}`;
  text += "\n\n(من قاعدة بيانات البرنامج العامة — ليس توليداً خارجياً)";
  return { reply: text, found: true };
}
