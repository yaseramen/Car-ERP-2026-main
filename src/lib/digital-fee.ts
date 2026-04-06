import { db } from "./db/client";

export async function getDigitalFeeConfig(companyId: string): Promise<{ rate: number; minFee: number }> {
  const company = await db.execute({
    sql: "SELECT digital_service_rate, digital_service_min_fee FROM companies WHERE id = ?",
    args: [companyId],
  });
  const row = company.rows[0] as { digital_service_rate?: number | null; digital_service_min_fee?: number | null } | undefined;
  const companyRate = row?.digital_service_rate;
  const companyMin = row?.digital_service_min_fee;

  if (companyRate != null && companyMin != null) {
    return { rate: Number(companyRate), minFee: Number(companyMin) };
  }

  const settings = await db.execute({
    sql: "SELECT key, value FROM system_settings WHERE key IN ('digital_service_rate', 'digital_service_min_fee')",
  });
  const map: Record<string, number> = {};
  for (const r of settings.rows) {
    map[String(r.key)] = Number(r.value ?? 0);
  }
  const rate = map.digital_service_rate ?? 0.0001;
  const minFee = map.digital_service_min_fee ?? 0.5;

  if (companyRate != null) return { rate: Number(companyRate), minFee };
  if (companyMin != null) return { rate, minFee: Number(companyMin) };

  return { rate, minFee };
}

export function calcDigitalFee(amount: number, config: { rate: number; minFee: number }): number {
  return Math.max(config.minFee, amount * config.rate);
}
