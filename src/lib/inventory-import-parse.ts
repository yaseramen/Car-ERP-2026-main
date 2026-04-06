/**
 * تحليل ملفات استيراد المخزن (XLSX / CSV) — يستخدم على الخادم فقط.
 */
import * as XLSX from "xlsx";

export type RowInput = {
  name: string;
  code: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  purchase_price: number;
  sale_price: number;
  min_quantity: number;
  has_expiry: boolean;
  expiry_date: string | null;
};

const NAME_KEYS = new Set(["name", "الاسم", "اسم", "اسم الصنف", "المنتج", "product"]);
const CODE_KEYS = new Set(["code", "الكود", "كود", "رمز"]);
const BARCODE_KEYS = new Set(["barcode", "الباركود", "باركود"]);
const CAT_KEYS = new Set(["category", "القسم", "قسم", "التصنيف"]);
const UNIT_KEYS = new Set(["unit", "الوحدة", "وحدة"]);
const PURCHASE_KEYS = new Set(["purchase_price", "سعر الشراء", "شراء", "purchase"]);
const SALE_KEYS = new Set(["sale_price", "سعر البيع", "بيع", "بيعي", "sale"]);
const MIN_KEYS = new Set(["min_quantity", "الحد الأدنى", "حد", "الحد الأدنى للكمية"]);
const HAS_EXP_KEYS = new Set(["has_expiry", "صلاحية", "تتبع صلاحية", "has expiry"]);
const EXP_DATE_KEYS = new Set(["expiry_date", "تاريخ الصلاحية", "انتهاء"]);

function normKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
}

function normalizeHeaderMap(raw: Record<string, unknown>): Map<string, string> {
  const m = new Map<string, string>();
  for (const k of Object.keys(raw)) {
    const nk = normKey(k);
    if (!nk) continue;
    m.set(nk, k);
  }
  return m;
}

function findColumn(headerMap: Map<string, string>, candidates: Set<string>): string | null {
  for (const c of candidates) {
    const nc = normKey(c);
    if (headerMap.has(nc)) return headerMap.get(nc)!;
  }
  for (const [nk, orig] of headerMap) {
    for (const c of candidates) {
      if (nk.includes(normKey(c)) || normKey(c).includes(nk)) return orig;
    }
  }
  return null;
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number") return String(v);
  return String(v).trim();
}

function num(v: unknown): number {
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

function parseBool(v: unknown): boolean {
  const s = cellStr(v).toLowerCase();
  return s === "1" || s === "yes" || s === "true" || s === "نعم" || s === "yes" || s === "y";
}

function parseExpiryDate(v: unknown): string | null {
  const s = cellStr(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return null;
}

export function parseInventorySpreadsheet(buffer: Buffer): { rows: RowInput[]; errors: string[] } {
  const errors: string[] = [];
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return { rows: [], errors: ["تعذر قراءة الملف. استخدم Excel (.xlsx) أو CSV."] };
  }
  if (!workbook.SheetNames.length) {
    return { rows: [], errors: ["الملف لا يحتوي على أوراق."] };
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!json.length) {
    return { rows: [], errors: ["الملف فارغ أو لا يحتوي على صفوف بيانات بعد الصف الأول."] };
  }

  const headerMap = normalizeHeaderMap(json[0] as Record<string, unknown>);
  const nameCol = findColumn(headerMap, NAME_KEYS);
  if (!nameCol) {
    return {
      rows: [],
      errors: [
        "لم يُعثر على عمود اسم المنتج. أضف عموداً باسم: الاسم أو name أو اسم الصنف في الصف الأول.",
      ],
    };
  }

  const codeCol = findColumn(headerMap, CODE_KEYS);
  const barcodeCol = findColumn(headerMap, BARCODE_KEYS);
  const catCol = findColumn(headerMap, CAT_KEYS);
  const unitCol = findColumn(headerMap, UNIT_KEYS);
  const purCol = findColumn(headerMap, PURCHASE_KEYS);
  const saleCol = findColumn(headerMap, SALE_KEYS);
  const minCol = findColumn(headerMap, MIN_KEYS);
  const hasExpCol = findColumn(headerMap, HAS_EXP_KEYS);
  const expDateCol = findColumn(headerMap, EXP_DATE_KEYS);

  const rows: RowInput[] = [];
  for (let i = 0; i < json.length; i++) {
    const row = json[i] as Record<string, unknown>;
    const name = cellStr(row[nameCol]);
    if (!name) continue;

    const code = codeCol ? cellStr(row[codeCol]) || null : null;
    const barcode = barcodeCol ? cellStr(row[barcodeCol]) || null : null;
    const category = catCol ? cellStr(row[catCol]) || null : null;
    const unit = unitCol ? cellStr(row[unitCol]) || "قطعة" : "قطعة";
    const purchase_price = purCol ? num(row[purCol]) : 0;
    const sale_price = saleCol ? num(row[saleCol]) : 0;
    const min_quantity = minCol ? num(row[minCol]) : 0;
    const has_expiry = hasExpCol ? parseBool(row[hasExpCol]) : false;
    let expiry_date: string | null = null;
    if (expDateCol) {
      expiry_date = parseExpiryDate(row[expDateCol]);
    }

    rows.push({
      name,
      code: code || null,
      barcode: barcode || null,
      category: category || null,
      unit: unit || "قطعة",
      purchase_price,
      sale_price,
      min_quantity,
      has_expiry,
      expiry_date,
    });
  }

  if (rows.length === 0) {
    errors.push("لم يُستخرج أي صف يحتوي على اسم صنف.");
  }
  return { rows, errors };
}
