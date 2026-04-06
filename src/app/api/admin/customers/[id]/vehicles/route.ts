import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

/**
 * جلب سيارات العميل السابقة من أوامر الإصلاح
 * تُرجع السيارات الفريدة (حسب اللوحة) مع أحدث بيانات لكل سيارة
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id: customerId } = await params;

  try {
    const result = await db.execute({
      sql: `SELECT vehicle_plate, vehicle_model, vehicle_year, mileage
            FROM repair_orders
            WHERE company_id = ? AND customer_id = ? AND vehicle_plate IS NOT NULL AND vehicle_plate != ''
            ORDER BY created_at DESC`,
      args: [companyId, customerId],
    });

    const seen = new Set<string>();
    const vehicles: { vehicle_plate: string; vehicle_model: string | null; vehicle_year: number | null; mileage: number | null }[] = [];

    for (const row of result.rows) {
      const plate = String(row.vehicle_plate ?? "").trim();
      if (!plate || seen.has(plate)) continue;
      seen.add(plate);
      vehicles.push({
        vehicle_plate: plate,
        vehicle_model: row.vehicle_model ? String(row.vehicle_model) : null,
        vehicle_year: row.vehicle_year != null ? Number(row.vehicle_year) : null,
        mileage: row.mileage != null ? Number(row.mileage) : null,
      });
    }

    return NextResponse.json(vehicles);
  } catch (error) {
    console.error("Customer vehicles GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
