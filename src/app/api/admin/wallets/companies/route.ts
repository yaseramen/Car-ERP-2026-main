import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { normalizeBusinessType } from "@/lib/business-types";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "super_admin" && role !== "tenant_owner") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const isOwner = role === "tenant_owner";
    const companyId = session.user.companyId ?? null;
    if (isOwner && !companyId) {
      return NextResponse.json({ error: "لا توجد شركة مرتبطة بالحساب" }, { status: 400 });
    }

    const result = await db.execute({
      sql: `SELECT c.id, c.name, c.phone, c.address, c.is_active,
            COALESCE(c.business_type, 'both') as business_type,
            COALESCE(c.marketplace_enabled, 1) as marketplace_enabled,
            COALESCE(c.ads_globally_disabled, 0) as ads_globally_disabled,
            COALESCE(cw.id, '') as wallet_id,
            COALESCE(cw.balance, 0) as balance
            FROM companies c
            LEFT JOIN company_wallets cw ON c.id = cw.company_id
            WHERE c.id NOT IN ('company-system', 'company-demo')
            ${isOwner ? "AND c.id = ?" : ""}
            ORDER BY c.is_active DESC, c.name`,
      args: isOwner ? [companyId] : [],
    });

    const companies = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      address: row.address,
      is_active: Number(row.is_active ?? 1) === 1,
      business_type: String(row.business_type ?? "both"),
      marketplace_enabled: Number(row.marketplace_enabled ?? 1) === 1,
      ads_globally_disabled: Number(row.ads_globally_disabled ?? 0) === 1,
      wallet_id: row.wallet_id || null,
      balance: Number(row.balance ?? 0),
    }));

    return NextResponse.json(companies);
  } catch (error) {
    console.error("Companies GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, phone, address, business_type } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "اسم الشركة مطلوب" }, { status: 400 });
    }

    const bt = normalizeBusinessType(business_type);
    const companyId = randomUUID();
    const walletId = randomUUID();

    await db.execute({
      sql: `INSERT INTO companies (id, name, phone, address, business_type, marketplace_enabled, ads_globally_disabled, is_active)
            VALUES (?, ?, ?, ?, ?, 1, 0, 1)`,
      args: [companyId, name.trim(), phone?.trim() || null, address?.trim() || null, bt],
    });

    await db.execute({
      sql: "INSERT INTO company_wallets (id, company_id, balance, currency) VALUES (?, ?, 0, 'EGP')",
      args: [walletId, companyId],
    });

    return NextResponse.json({
      id: companyId,
      name: name.trim(),
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      wallet_id: walletId,
      balance: 0,
    });
  } catch (error) {
    console.error("Company POST error:", error);
    return NextResponse.json({ error: "فشل في إنشاء الشركة" }, { status: 500 });
  }
}
