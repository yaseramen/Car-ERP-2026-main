/**
 * توسيع تلقائي لجدول الماركات والنماذج
 * عند ظهور مركبة جديدة من أي تقرير في العالم
 */
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";

function normalizeName(name: string): string {
  return name.trim() || "";
}

export async function ensureVehicleBrand(name: string): Promise<string | null> {
  const n = normalizeName(name);
  if (!n) return null;
  const existing = await db.execute({
    sql: "SELECT id FROM vehicle_brands WHERE LOWER(TRIM(name_ar)) = LOWER(TRIM(?)) OR (name_en IS NOT NULL AND LOWER(TRIM(name_en)) = LOWER(TRIM(?))) LIMIT 1",
    args: [n, n],
  });
  if (existing.rows.length > 0) return existing.rows[0].id as string;
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO vehicle_brands (id, name_ar, name_en) VALUES (?, ?, ?)",
    args: [id, n, n],
  });
  return id;
}

export async function ensureVehicleModel(brandId: string, name: string): Promise<string | null> {
  const n = normalizeName(name);
  if (!n) return null;
  const existing = await db.execute({
    sql: "SELECT id FROM vehicle_models WHERE brand_id = ? AND (LOWER(TRIM(name_ar)) = LOWER(TRIM(?)) OR (name_en IS NOT NULL AND LOWER(TRIM(name_en)) = LOWER(TRIM(?)))) LIMIT 1",
    args: [brandId, n, n],
  });
  if (existing.rows.length > 0) return existing.rows[0].id as string;
  const id = randomUUID();
  await db.execute({
    sql: "INSERT INTO vehicle_models (id, brand_id, name_ar, name_en) VALUES (?, ?, ?, ?)",
    args: [id, brandId, n, n],
  });
  return id;
}
