/**
 * مطابقة عميل/مورد من نص حر مع ترتيب تقريبي.
 */

import { db } from "@/lib/db/client";
import { extractSearchPhrase, likePatternsForPhrase, normalizeArabicLoose, scoreNameMatch } from "@/lib/assistant-text-fuzzy";

const MAX_SCAN = 400;

function extractDigits(s: string): string | null {
  const d = s.replace(/\D/g, "");
  return d.length >= 6 ? d : d.length >= 4 ? d : null;
}

export type ResolvedParty = { id: string; name: string; phone: string | null };

async function resolveFromTable(
  table: "customers" | "suppliers",
  companyId: string,
  phrase: string
): Promise<ResolvedParty | null> {
  const digits = extractDigits(phrase);
  const patterns = likePatternsForPhrase(phrase);
  if (patterns.length === 0 && !digits) return null;

  const cols = table === "customers" ? "id, name, phone" : "id, name, phone";
  let sql = `SELECT ${cols} FROM ${table} WHERE company_id = ? AND is_active = 1`;
  const args: (string | number)[] = [companyId];

  const ors: string[] = [];
  if (digits) {
    ors.push("REPLACE(REPLACE(REPLACE(COALESCE(phone,''), ' ', ''), '-', ''), '+', '') LIKE ?");
    args.push(`%${digits}%`);
  }
  for (const p of patterns) {
    ors.push("(LOWER(name) LIKE ? OR LOWER(COALESCE(phone,'')) LIKE ?)");
    args.push(p, p);
  }
  if (ors.length === 0) return null;
  sql += ` AND (${ors.join(" OR ")})`;
  sql += ` LIMIT ${MAX_SCAN}`;

  const res = await db.execute({ sql, args });
  if (res.rows.length === 0) return null;

  let best: { row: (typeof res.rows)[0]; score: number } | null = null;
  for (const row of res.rows) {
    const name = String(row.name ?? "");
    const sc = scoreNameMatch(phrase, name);
    const phone = row.phone ? String(row.phone) : "";
    const phoneBonus = digits && phone.replace(/\D/g, "").includes(digits) ? 200 : 0;
    const total = sc + phoneBonus;
    if (!best || total > best.score) {
      best = { row, score: total };
    }
  }
  if (!best) return null;

  const r = best.row;
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    phone: r.phone != null ? String(r.phone) : null,
  };
}

/** إذا لم يُطابق LIKE، جرّب مسح أسماء النشطين واختر الأقرب بالدرجة */
async function resolveByFullScan(
  table: "customers" | "suppliers",
  companyId: string,
  phrase: string
): Promise<ResolvedParty | null> {
  const p = extractSearchPhrase(phrase, []);
  if (p.length < 2) return null;

  const res = await db.execute({
    sql: `SELECT id, name, phone FROM ${table} WHERE company_id = ? AND is_active = 1 LIMIT 800`,
    args: [companyId],
  });
  let best: ResolvedParty | null = null;
  let bestScore = 0;
  for (const row of res.rows) {
    const name = String(row.name ?? "");
    const sc = scoreNameMatch(p, name);
    if (sc > bestScore) {
      bestScore = sc;
      best = {
        id: String(row.id ?? ""),
        name,
        phone: row.phone != null ? String(row.phone) : null,
      };
    }
  }
  if (bestScore < 20) return null;
  return best;
}

export async function resolveCustomer(companyId: string, message: string): Promise<ResolvedParty | null> {
  const phrase = extractSearchPhrase(message, [
    "عميل",
    "عميله",
    "العميل",
    "زبون",
    "كشف",
    "حساب",
    "كشفحساب",
    "رصيد",
    "مديونية",
    "دين",
    "customer",
    "فاتوره",
    "فاتورة",
  ]);
  if (phrase.length < 2) return null;
  const hit = await resolveFromTable("customers", companyId, phrase);
  if (hit) return hit;
  return resolveByFullScan("customers", companyId, phrase);
}

export async function resolveSupplier(companyId: string, message: string): Promise<ResolvedParty | null> {
  const phrase = extractSearchPhrase(message, [
    "مورد",
    "موردين",
    "المورد",
    "كشف",
    "حساب",
    "كشفحساب",
    "رصيد",
    "مديونية",
    "دين",
    "supplier",
    "فاتوره",
    "فاتورة",
  ]);
  if (phrase.length < 2) return null;
  const hit = await resolveFromTable("suppliers", companyId, phrase);
  if (hit) return hit;
  return resolveByFullScan("suppliers", companyId, phrase);
}

export function looksLikePhoneQuery(message: string): boolean {
  return extractDigits(message) != null;
}

/** كشف حساب: إن وُجد «مورد» نفضّل المورد، وإلا «عميل/زبون» للعميل، وإلا نأخذ أعلى مطابقة اسم */
export async function resolvePartyForLedger(
  companyId: string,
  message: string
): Promise<{ kind: "customer" | "supplier"; party: ResolvedParty } | null> {
  const m = normalizeArabicLoose(message);
  if (m.includes("مورد")) {
    const p = await resolveSupplier(companyId, message);
    return p ? { kind: "supplier", party: p } : null;
  }
  if (m.includes("عميل") || m.includes("زبون")) {
    const p = await resolveCustomer(companyId, message);
    return p ? { kind: "customer", party: p } : null;
  }
  const phrase = extractSearchPhrase(message, []);
  const c = await resolveCustomer(companyId, message);
  const s = await resolveSupplier(companyId, message);
  const sc = c ? scoreNameMatch(phrase || message, c.name) : 0;
  const ss = s ? scoreNameMatch(phrase || message, s.name) : 0;
  if (!c && !s) return null;
  if (sc >= ss && c) return { kind: "customer", party: c };
  if (s) return { kind: "supplier", party: s };
  if (c) return { kind: "customer", party: c };
  return null;
}
