import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId, isPlatformOwnerCompany } from "@/lib/company";
import { randomUUID } from "crypto";
import { fullObdSystemPersona, WORKSHOP_SYSTEM_PERSONA } from "@/lib/obd-ai-context";
import { DESCRIPTION_ANALYSIS_PROMPT } from "@/lib/obd-description-prompt";

const OBD_SEARCH_COST = 1;
const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;

type DescStep = { priority: number; title: string; detail: string };

type DescriptionAnalysisResult = {
  summary_ar: string;
  possible_codes: string[];
  hypothesis_ar?: string;
  root_cause_ar?: string;
  excluded_causes_ar?: string;
  causes: string;
  solutions: string;
  prioritized_steps?: DescStep[];
  common_mistakes_ar?: string;
  replacement_guidance_ar?: string;
  recommendations: string;
  disclaimer_ar?: string;
};

function normalizeDescriptionResult(parsed: Record<string, unknown>): DescriptionAnalysisResult {
  const stepsRaw = Array.isArray(parsed.prioritized_steps) ? parsed.prioritized_steps : [];
  const prioritized_steps: DescStep[] = [];
  stepsRaw.forEach((s, idx) => {
    if (!s || typeof s !== "object") return;
    const st = s as Record<string, unknown>;
    const title = typeof st.title === "string" ? st.title.trim() : "";
    const detail = typeof st.detail === "string" ? st.detail.trim() : "";
    if (!title && !detail) return;
    const priority = typeof st.priority === "number" && Number.isFinite(st.priority) ? st.priority : idx + 1;
    prioritized_steps.push({ priority, title: title || `خطوة ${idx + 1}`, detail });
  });

  return {
    summary_ar: typeof parsed.summary_ar === "string" ? parsed.summary_ar : "",
    possible_codes: Array.isArray(parsed.possible_codes) ? (parsed.possible_codes as string[]) : [],
    hypothesis_ar: typeof parsed.hypothesis_ar === "string" ? parsed.hypothesis_ar : undefined,
    root_cause_ar: typeof parsed.root_cause_ar === "string" ? parsed.root_cause_ar : undefined,
    excluded_causes_ar: typeof parsed.excluded_causes_ar === "string" ? parsed.excluded_causes_ar : undefined,
    causes: typeof parsed.causes === "string" ? parsed.causes : "",
    solutions: typeof parsed.solutions === "string" ? parsed.solutions : "",
    prioritized_steps: prioritized_steps.length > 0 ? prioritized_steps : undefined,
    common_mistakes_ar: typeof parsed.common_mistakes_ar === "string" ? parsed.common_mistakes_ar : undefined,
    replacement_guidance_ar: typeof parsed.replacement_guidance_ar === "string" ? parsed.replacement_guidance_ar : undefined,
    recommendations: typeof parsed.recommendations === "string" ? parsed.recommendations : "",
    disclaimer_ar: typeof parsed.disclaimer_ar === "string" ? parsed.disclaimer_ar : undefined,
  };
}

async function analyzeWithAI(description: string, vehicleInfo: string): Promise<DescriptionAnalysisResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const prompt = DESCRIPTION_ANALYSIS_PROMPT.replace("{description}", description).replace("{vehicleInfo}", vehicleInfo);

  if (geminiKey) {
    const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash"];
    for (const model of models) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: `${fullObdSystemPersona(WORKSHOP_SYSTEM_PERSONA)}\n\nأجب بالعربية فقط. JSON صالح فقط بدون markdown.` }],
              },
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3 },
            }),
          }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as Record<string, unknown>;
          return normalizeDescriptionResult(parsed);
        }
      } catch {
        continue;
      }
    }
  }

  if (groqKey) {
    const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
    for (const model of models) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: `${fullObdSystemPersona(WORKSHOP_SYSTEM_PERSONA)}\n\nأجب بالعربية فقط بصيغة JSON صالحة فقط.` },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
          }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as Record<string, unknown>;
          return normalizeDescriptionResult(parsed);
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const description = body.description?.trim();
    if (!description) {
      return NextResponse.json({ error: "وصف الحالة مطلوب" }, { status: 400 });
    }

    const vehicleInfo = [
      body.brand && `المركبة: ${body.brand}`,
      body.model && `النموذج: ${body.model}`,
      body.year && `سنة الصنع: ${body.year}`,
    ]
      .filter(Boolean)
      .join("، ");
    const vehicleInfoStr = vehicleInfo ? `معلومات المركبة: ${vehicleInfo}` : "";

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

    const balance = Number(walletResult.rows[0]?.balance ?? 0);
    if (!skipWallet && (walletResult.rows.length === 0 || balance < OBD_SEARCH_COST)) {
      return NextResponse.json(
        { error: `رصيد المحفظة غير كافٍ (${OBD_SEARCH_COST} ج.م)` },
        { status: 400 }
      );
    }

    const result = await analyzeWithAI(description, vehicleInfoStr);
    if (!result) {
      return NextResponse.json(
        { error: "تعذّر إتمام التحليل عبر EFCT. تأكد من GEMINI_API_KEY أو GROQ_API_KEY." },
        { status: 500 }
      );
    }

    if (!skipWallet && walletResult.rows[0]) {
      const walletId = walletResult.rows[0].id;
      const wtId = randomUUID();
      await db.execute({
        sql: "UPDATE company_wallets SET balance = balance - ? WHERE company_id = ?",
        args: [OBD_SEARCH_COST, companyId],
      });
      await db.execute({
        sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'obd_search', ?, 'obd_search', ?, ?)`,
        args: [wtId, walletId, OBD_SEARCH_COST, `تحليل بالوصف: ${description.slice(0, 50)}...`, wtId, session.user.id],
      });
    }

    return NextResponse.json({
      ...result,
      cost: skipWallet ? 0 : OBD_SEARCH_COST,
    });
  } catch (error) {
    console.error("OBD analyze-by-description error:", error);
    return NextResponse.json({ error: "فشل في التحليل" }, { status: 500 });
  }
}
