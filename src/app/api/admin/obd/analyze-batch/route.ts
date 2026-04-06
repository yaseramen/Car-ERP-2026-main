import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId, isPlatformOwnerCompany } from "@/lib/company";
import { OBD_SEARCH_COST, resolveCode, type ObdResult } from "@/lib/obd";
import { analyzeIntegratedObdReport } from "@/lib/obd-integrated-analysis";
import { ensureVehicleBrand, ensureVehicleModel } from "@/lib/obd-vehicles";
import { parseObdCodesFromFreeText, parseYearInput } from "@/lib/obd-codes-input";
import { randomUUID } from "crypto";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;
const MAX_CODES = 40;

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const codesRaw = typeof body.codes_text === "string" ? body.codes_text : "";
    const brand = typeof body.vehicle_brand === "string" ? body.vehicle_brand.trim() : "";
    const model = typeof body.vehicle_model === "string" ? body.vehicle_model.trim() : "";
    const year = parseYearInput(typeof body.vehicle_year === "string" ? body.vehicle_year : "");

    const uniqueCodes = parseObdCodesFromFreeText(codesRaw);
    if (uniqueCodes.length === 0) {
      return NextResponse.json(
        { error: "لم يُعثر على أكواد صالحة. اكتب أكواداً مثل P0300 أو C0123 (سطر لكل كود أو مفصولة بفواصل)." },
        { status: 400 }
      );
    }
    if (uniqueCodes.length > MAX_CODES) {
      return NextResponse.json({ error: `الحد الأقصى ${MAX_CODES} كوداً في طلب واحد` }, { status: 400 });
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

    const skipWallet = isPlatformOwnerCompany(companyId);

    let walletResult = await db.execute({
      sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
      args: [companyId],
    });

    if (!skipWallet && walletResult.rows.length === 0) {
      await db.execute({
        sql: "INSERT INTO company_wallets (id, company_id, balance, currency) VALUES (?, ?, 0, 'EGP')",
        args: [randomUUID(), companyId],
      });
      walletResult = await db.execute({
        sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
        args: [companyId],
      });
    }

    const totalCost = skipWallet ? 0 : uniqueCodes.length * OBD_SEARCH_COST;
    const balance = Number(walletResult.rows[0]?.balance ?? 0);

    if (!skipWallet && (walletResult.rows.length === 0 || balance < uniqueCodes.length * OBD_SEARCH_COST)) {
      const need = uniqueCodes.length * OBD_SEARCH_COST;
      return NextResponse.json(
        { error: `رصيد المحفظة غير كافٍ. المطلوب: ${need} ج.م (${uniqueCodes.length} كود × ${OBD_SEARCH_COST} ج.م)` },
        { status: 400 }
      );
    }

    const results: (ObdResult & { cost: number })[] = [];
    const walletId = walletResult.rows[0]?.id as string | undefined;

    for (const code of uniqueCodes) {
      const { result, obdCodeId } = await resolveCode(code, companyId);
      results.push({ ...result, cost: skipWallet ? 0 : OBD_SEARCH_COST });

      let wtId: string | null = null;
      if (!skipWallet && walletId) {
        wtId = randomUUID();
        await db.execute({
          sql: "UPDATE company_wallets SET balance = balance - ? WHERE company_id = ?",
          args: [OBD_SEARCH_COST, companyId],
        });
        await db.execute({
          sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, 'obd_search', ?, 'obd_search', ?, ?)`,
          args: [wtId, walletId, OBD_SEARCH_COST, `تحليل يدوي - كود ${code}`, wtId, session.user.id],
        });
      }
      await db.execute({
        sql: `INSERT INTO obd_searches (id, company_id, code, obd_code_id, wallet_transaction_id, result_summary, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          companyId,
          code,
          obdCodeId,
          wtId,
          result.description_ar ?? "",
          session.user.id,
        ],
      });
    }

    let integratedAnalysis: Awaited<ReturnType<typeof analyzeIntegratedObdReport>> = null;
    try {
      integratedAnalysis = await analyzeIntegratedObdReport(
        results.map((row) => {
          const { cost, ...rest } = row;
          void cost;
          return rest;
        }),
        brand || model || year != null
          ? { brand_ar: brand || undefined, model_ar: model || undefined, year: year ?? undefined }
          : undefined
      );
    } catch (e) {
      console.warn("OBD integrated analysis (batch):", e);
    }

    let vehicleBrandId: string | null = null;
    let vehicleModelId: string | null = null;
    try {
      if (brand) {
        vehicleBrandId = await ensureVehicleBrand(brand);
        if (vehicleBrandId && model) {
          vehicleModelId = await ensureVehicleModel(vehicleBrandId, model);
        }
      }
    } catch (e) {
      console.warn("Auto-expand vehicle tables (batch):", e);
    }

    const vehiclePayload = {
      brand: brand || "",
      model: model || "",
      year: year,
      vin: "",
    };

    try {
      await db.execute({
        sql: `INSERT INTO obd_reports (id, company_id, file_name, vehicle_brand, vehicle_model, vehicle_year, vehicle_vin, vehicle_brand_id, vehicle_model_id, codes_extracted, codes_count, total_cost, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          companyId,
          "manual_codes",
          brand || null,
          model || null,
          year,
          null,
          vehicleBrandId,
          vehicleModelId,
          JSON.stringify(uniqueCodes),
          uniqueCodes.length,
          totalCost,
          session.user.id,
        ],
      });
    } catch (e) {
      try {
        await db.execute({
          sql: `INSERT INTO obd_reports (id, company_id, file_name, vehicle_brand, vehicle_model, vehicle_year, vehicle_vin, codes_extracted, codes_count, total_cost, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            randomUUID(),
            companyId,
            "manual_codes",
            brand || null,
            model || null,
            year,
            null,
            JSON.stringify(uniqueCodes),
            uniqueCodes.length,
            totalCost,
            session.user.id,
          ],
        });
      } catch (e2) {
        console.warn("obd_reports insert failed (batch):", e2);
      }
    }

    return NextResponse.json({
      results,
      totalCost,
      codesFound: uniqueCodes.length,
      vehicle: brand || model || year != null ? vehiclePayload : undefined,
      integrated_analysis: integratedAnalysis || undefined,
    });
  } catch (error) {
    console.error("OBD analyze-batch error:", error);
    const msg = error instanceof Error ? error.message : "فشل الطلب";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
