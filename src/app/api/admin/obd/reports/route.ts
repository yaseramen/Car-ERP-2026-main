import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, parseInt(searchParams.get("limit") || "20", 10) || 20);

  const reports = await db.execute({
    sql: `SELECT id, file_name, vehicle_brand, vehicle_model, vehicle_year, vehicle_vin, codes_count, total_cost, codes_extracted, created_at
          FROM obd_reports
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [limit],
  });

  const stats = await db.execute({
    sql: `SELECT
            (SELECT COUNT(*) FROM obd_reports) as reports_count,
            (SELECT COUNT(*) FROM obd_codes) as codes_count,
            (SELECT COUNT(*) FROM obd_searches) as searches_count`,
  });

  return NextResponse.json({
    reports: reports.rows.map((r) => ({
      id: r.id,
      file_name: r.file_name,
      vehicle_brand: r.vehicle_brand,
      vehicle_model: r.vehicle_model,
      vehicle_year: r.vehicle_year,
      vehicle_vin: r.vehicle_vin,
      codes_count: r.codes_count,
      total_cost: r.total_cost,
      codes_extracted: r.codes_extracted,
      created_at: r.created_at,
    })),
    stats: stats.rows[0]
      ? {
          reports_count: Number(stats.rows[0].reports_count ?? 0),
          codes_count: Number(stats.rows[0].codes_count ?? 0),
          searches_count: Number(stats.rows[0].searches_count ?? 0),
        }
      : { reports_count: 0, codes_count: 0, searches_count: 0 },
  });
}
