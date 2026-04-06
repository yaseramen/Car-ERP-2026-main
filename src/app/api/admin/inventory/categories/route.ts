import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const DEFAULT_CATEGORIES = ["زيوت", "فلاتر", "ميكانيكا", "كهرباء", "إطارات", "أخرى"];
const DEFAULT_UNITS = ["قطعة", "لتر", "كيلو", "علبة", "متر", "رول"];
const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

export async function GET() {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const catResult = await db.execute({
      sql: "SELECT DISTINCT category FROM items WHERE company_id = ? AND category IS NOT NULL AND category != ''",
      args: [companyId],
    });
    const unitsResult = await db.execute({
      sql: "SELECT DISTINCT unit FROM items WHERE company_id = ? AND unit IS NOT NULL AND unit != ''",
      args: [companyId],
    });

    const categories = [
      ...DEFAULT_CATEGORIES,
      ...catResult.rows.map((r) => r.category).filter(Boolean),
    ];
    const units = [
      ...DEFAULT_UNITS,
      ...unitsResult.rows.map((r) => r.unit).filter(Boolean),
    ];

    const uniqueCategories = [...new Set(categories)];
    const uniqueUnits = [...new Set(units)];

    return NextResponse.json({
      categories: uniqueCategories,
      units: uniqueUnits,
    });
  } catch {
    return NextResponse.json({
      categories: DEFAULT_CATEGORIES,
      units: DEFAULT_UNITS,
    });
  }
}
