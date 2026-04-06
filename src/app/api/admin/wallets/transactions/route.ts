import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "super_admin" && role !== "tenant_owner") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let companyId = searchParams.get("company_id");
  const isOwner = role === "tenant_owner";
  const ownerCompanyId = session.user.companyId ?? null;
  if (isOwner) {
    if (!ownerCompanyId) {
      return NextResponse.json({ error: "لا توجد شركة مرتبطة بالحساب" }, { status: 400 });
    }
    companyId = ownerCompanyId;
  }

  try {
    let sql = `SELECT wt.*, c.name as company_name, u.name as performed_by_name
               FROM wallet_transactions wt
               JOIN company_wallets cw ON wt.wallet_id = cw.id
               JOIN companies c ON cw.company_id = c.id
               LEFT JOIN users u ON wt.performed_by = u.id`;
    const args: (string | number)[] = [];

    if (companyId) {
      sql += " WHERE cw.company_id = ?";
      args.push(companyId);
    }

    const limit = isOwner ? 200 : 50;
    sql += " ORDER BY wt.created_at DESC LIMIT ?";
    args.push(limit);

    const result = await db.execute({ sql, args });

    const transactions = result.rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      type: row.type,
      description: row.description,
      company_name: row.company_name,
      performed_by_name: row.performed_by_name,
      created_at: row.created_at,
    }));

    return NextResponse.json(transactions);
  } catch (error) {
    console.error("Transactions GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
