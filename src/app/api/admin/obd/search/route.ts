import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId, isPlatformOwnerCompany } from "@/lib/company";
import { OBD_SEARCH_COST, resolveCode } from "@/lib/obd";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json({ error: "كود OBD مطلوب" }, { status: 400 });
    }

    const companyCheck = await db.execute({
      sql: "SELECT id FROM companies WHERE id = ?",
      args: [companyId],
    });
    if (companyCheck.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO companies (id, name, is_active) VALUES (?, 'نظام EFCT', 1)",
        args: [companyId],
      });
    }

    let walletResult = await db.execute({
      sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
      args: [companyId],
    });

    if (walletResult.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO company_wallets (id, company_id, balance, currency) VALUES (?, ?, 0, 'EGP')",
        args: [randomUUID(), companyId],
      });
      walletResult = await db.execute({
        sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
        args: [companyId],
      });
    }

    const skipWallet = isPlatformOwnerCompany(companyId);
    if (
      !skipWallet &&
      (walletResult.rows.length === 0 || Number(walletResult.rows[0].balance ?? 0) < OBD_SEARCH_COST)
    ) {
      return NextResponse.json(
        { error: `رصيد المحفظة غير كافٍ (تكلفة البحث: ${OBD_SEARCH_COST} ج.م)` },
        { status: 400 }
      );
    }

    const { result, obdCodeId } = await resolveCode(code, companyId);

    let wtId: string | null = null;
    if (!skipWallet) {
      const walletId = walletResult.rows[0].id;
      wtId = randomUUID();
      await db.execute({
        sql: "UPDATE company_wallets SET balance = balance - ? WHERE company_id = ?",
        args: [OBD_SEARCH_COST, companyId],
      });
      await db.execute({
        sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'obd_search', ?, 'obd_search', ?, ?)`,
        args: [wtId, walletId, OBD_SEARCH_COST, `بحث OBD - كود ${code.toUpperCase()}`, wtId, session.user.id],
      });
    }

    await db.execute({
      sql: `INSERT INTO obd_searches (id, company_id, code, obd_code_id, wallet_transaction_id, result_summary, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        randomUUID(),
        companyId,
        code.toUpperCase(),
        obdCodeId,
        wtId,
        result.description_ar ?? "",
        session.user.id,
      ],
    });

    return NextResponse.json({
      ...result,
      cost: OBD_SEARCH_COST,
    });
  } catch (error) {
    console.error("OBD search error:", error);
    return NextResponse.json({ error: "فشل في البحث" }, { status: 500 });
  }
}
