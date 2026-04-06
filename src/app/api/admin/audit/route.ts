import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner"] as const;

export async function GET(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  try {
    const result = await db.execute({
      sql: `SELECT id, user_name, action, entity_type, entity_id, details, created_at
            FROM audit_log
            WHERE company_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?`,
      args: [companyId, limit, offset],
    });

    const logs = result.rows.map((row) => ({
      id: row.id,
      user_name: row.user_name,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      details: row.details,
      created_at: row.created_at,
    }));

    const countRes = await db.execute({
      sql: "SELECT COUNT(*) as cnt FROM audit_log WHERE company_id = ?",
      args: [companyId],
    });
    const total = Number(countRes.rows[0]?.cnt ?? 0);

    return NextResponse.json({ logs, total });
  } catch (error) {
    console.error("Audit GET error:", error);
    return NextResponse.json({ error: "فشل في جلب السجل" }, { status: 500 });
  }
}
