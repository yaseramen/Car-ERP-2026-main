import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";

export async function ensureTreasuries(companyId: string) {
  const existing = await db.execute({
    sql: "SELECT id, type FROM treasuries WHERE company_id = ?",
    args: [companyId],
  });

  const types = existing.rows.map((r) => r.type);
  const config = [
    { type: "sales" as const, name: "خزينة المبيعات" },
    { type: "workshop" as const, name: "خزينة الورشة" },
    { type: "main" as const, name: "الخزينة الرئيسية" },
  ];

  for (const { type, name } of config) {
    if (!types.includes(type)) {
      try {
        await db.execute({
          sql: "INSERT OR IGNORE INTO treasuries (id, company_id, name, type, balance) VALUES (?, ?, ?, ?, 0)",
          args: [randomUUID(), companyId, name, type],
        });
      } catch {
        // قد يفشل إذا كان نوع 'main' غير مدعوم
      }
    }
  }
}

export async function getTreasuryIdByType(companyId: string, type: "sales" | "workshop" | "main"): Promise<string | null> {
  const result = await db.execute({
    sql: "SELECT id FROM treasuries WHERE company_id = ? AND type = ?",
    args: [companyId, type],
  });
  return result.rows[0] ? String(result.rows[0].id) : null;
}
