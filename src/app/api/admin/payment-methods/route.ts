import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function GET() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const result = await db.execute({
      sql: "SELECT id, name, type FROM payment_methods WHERE (company_id IS NULL OR company_id = '') AND (is_active = 1 OR is_active IS NULL)",
      args: [],
    });

    const order: Record<string, number> = { cash: 0, vodafone_cash: 1, instapay: 2, cheque: 3, bank: 4, credit: 5 };
    const methods = result.rows
      .map((row) => ({
        id: row.id,
        name: row.name,
        type: String(row.type ?? ""),
      }))
      .sort((a, b) => (order[a.type] ?? 99) - (order[b.type] ?? 99));

    return NextResponse.json(methods);
  } catch (error) {
    console.error("Payment methods GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
