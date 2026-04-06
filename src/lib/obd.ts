import { db } from "@/lib/db/client";
import { SYSTEM_COMPANY_ID } from "@/lib/company";
import { fullObdSystemPersona } from "@/lib/obd-ai-context";
import type { ObdSymptomsPayloadV2 } from "@/lib/obd-symptoms-parse";
import { randomUUID } from "crypto";
import { extractText, getDocumentProxy } from "unpdf";

export const OBD_SEARCH_COST = 1;

const OBD_SYSTEM_PROMPT = fullObdSystemPersona();

export const OBD_PROMPT = `كود OBD: {code}

المطلوب (تحليل كود عطل — تشخيص ورشة):
1) معنى الكود بلغة بسيطة ومهنية + النظام المتأثر (محرك، كهرباء، BCM، ناقل، فرامل، حساسات…).
2) درجة الخطورة: واحدة فقط من: منخفض | متوسط | عالي (مع جملة تبرير قصيرة في الحقل المناسب).
3) الأسباب المحتملة مرتبة حسب الأكثر شيوعاً في الورشة — ابدأ بالأبسط والأرخص فحصاً (فيوز، أرضي، فيشة) قبل ECU.
4) طريقة الفحص خطوة بخطوة (testing_steps) — كل خطوة في سطر، افصل بـ |
5) إشارات تأكيد العطل (symptoms) + إن أمكن ذكر ما يُنظر إليه في Live Data بصيغة عامة (بدون أرقام وهمية).
6) الحلول من الأسهل للأصعب (solutions) — افصل بـ |
7) متى إصلاح ومتى استبدال (repair_vs_replace_ar) — جملتان كحد أقصى
8) نصائح تمنع التكرار (prevention_tips_ar) — سطر أو سطران
9) ملاحظات احترافية وأخطاء شائعة (professional_notes_ar) — مختصر

أجب JSON فقط بدون markdown:
{
  "plain_description_ar": "شرح معنى الكود والنظام — فقرة قصيرة",
  "affected_system_ar": "مثال: نظام الحقن / كهرباء المحرك",
  "severity": "منخفض|متوسط|عالي",
  "severity_note_ar": "لماذا هذه الدرجة — جملة",
  "causes": "سبب1|سبب2|سبب3",
  "testing_steps": "خطوة1|خطوة2|خطوة3",
  "symptoms": "عرض1|عرض2 أو نص متصل قصير",
  "how_to_confirm_ar": "كيف يؤكد الفني — نقاط قصيرة",
  "solutions": "حل1|حل2|حل3",
  "repair_vs_replace_ar": "متى يصلح ومتى يستبدل",
  "prevention_tips_ar": "نصيحة منع تكرار المشكلة",
  "professional_notes_ar": "نصائح تشخيص + أخطاء شائعة يجب تجنبها — مختصر"
}`;

export type ParsedAiCodeFields = {
  description_ar: string;
  causes: string;
  solutions: string;
  symptoms: string;
};

export function parseAIResponse(text: string): ParsedAiCodeFields | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]) as Record<string, unknown>;
    const plain =
      (typeof p.plain_description_ar === "string" && p.plain_description_ar.trim()) ||
      (typeof p.description_ar === "string" && p.description_ar.trim()) ||
      "";
    const causes = typeof p.causes === "string" ? p.causes : "";
    const solutions = typeof p.solutions === "string" ? p.solutions : "";
    const symptoms = typeof p.symptoms === "string" ? p.symptoms : "";
    if (!plain && !causes && !solutions && !symptoms) return null;

    const payload: ObdSymptomsPayloadV2 = {
      v: 2,
      symptoms: symptoms || "—",
    };
    if (typeof p.affected_system_ar === "string" && p.affected_system_ar.trim()) payload.affected_system_ar = p.affected_system_ar.trim();
    if (typeof p.severity === "string" && p.severity.trim()) payload.severity = p.severity.trim();
    if (typeof p.severity_note_ar === "string" && p.severity_note_ar.trim()) payload.severity_note_ar = p.severity_note_ar.trim();
    if (typeof p.testing_steps === "string" && p.testing_steps.trim()) payload.testing_steps = p.testing_steps.trim();
    if (typeof p.how_to_confirm_ar === "string" && p.how_to_confirm_ar.trim()) payload.how_to_confirm_ar = p.how_to_confirm_ar.trim();
    if (typeof p.repair_vs_replace_ar === "string" && p.repair_vs_replace_ar.trim()) payload.repair_vs_replace_ar = p.repair_vs_replace_ar.trim();
    if (typeof p.prevention_tips_ar === "string" && p.prevention_tips_ar.trim()) payload.prevention_tips_ar = p.prevention_tips_ar.trim();
    if (typeof p.professional_notes_ar === "string" && p.professional_notes_ar.trim()) payload.professional_notes_ar = p.professional_notes_ar.trim();

    return {
      description_ar: plain || symptoms || "—",
      causes,
      solutions,
      symptoms: JSON.stringify(payload),
    };
  } catch {
    return null;
  }
}

export async function searchLocal(code: string) {
  const normalized = code.trim().toUpperCase().replace(/\s/g, "");
  const candidates = [normalized];
  const withoutSuffix = normalized.replace(/-\d{2}$/, "");
  if (withoutSuffix !== normalized) candidates.push(withoutSuffix);
  for (const c of candidates) {
    const result = await db.execute({
      sql: "SELECT * FROM obd_codes WHERE UPPER(TRIM(code)) = ? LIMIT 1",
      args: [c],
    });
    if (result.rows[0]) return result.rows[0];
  }
  return null;
}

async function searchWithGemini(code: string): Promise<{ description_ar: string; causes: string; solutions: string; symptoms: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const models = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: `${OBD_SYSTEM_PROMPT}\n\nأجب بالعربية فقط. JSON صالح فقط.` }],
            },
            contents: [{ parts: [{ text: OBD_PROMPT.replace("{code}", code) }] }],
            generationConfig: { temperature: 0.3 },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = parseAIResponse(text);
      if (parsed) return parsed;
    } catch {
      // try next model
    }
  }
  return null;
}

async function searchWithGroq(code: string): Promise<{ description_ar: string; causes: string; solutions: string; symptoms: string } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  for (const model of models) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: `${OBD_SYSTEM_PROMPT}\n\nأجب بالعربية فقط. JSON صالح فقط.` },
            { role: "user", content: OBD_PROMPT.replace("{code}", code) },
          ],
          temperature: 0.3,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? "";
      const parsed = parseAIResponse(text);
      if (parsed) return parsed;
    } catch {
      // try next model
    }
  }
  return null;
}

async function searchWithOpenAI(code: string): Promise<{ description_ar: string; causes: string; solutions: string; symptoms: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: `${OBD_SYSTEM_PROMPT}\n\nأجب بالعربية فقط. JSON صالح فقط.` },
          { role: "user", content: OBD_PROMPT.replace("{code}", code) },
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    return parseAIResponse(text);
  } catch {
    return null;
  }
}

export async function searchWithAI(code: string): Promise<{ description_ar: string; causes: string; solutions: string; symptoms: string } | null> {
  const gemini = await searchWithGemini(code);
  if (gemini) return gemini;
  const groq = await searchWithGroq(code);
  if (groq) return groq;
  return searchWithOpenAI(code);
}

export type ObdResult = {
  code: string;
  description_ar: string | null;
  description_en: string | null;
  causes: string | null;
  solutions: string | null;
  symptoms: string | null;
  source: string;
};

export async function resolveCode(
  code: string,
  companyId: string = SYSTEM_COMPANY_ID
): Promise<{ result: ObdResult; obdCodeId: string | null }> {
  const local = await searchLocal(code);
  let result: ObdResult;
  let obdCodeId: string | null = null;

  if (local) {
    await db.execute({
      sql: "UPDATE obd_codes SET search_count = search_count + 1, updated_at = datetime('now') WHERE id = ?",
      args: [local.id],
    });
    obdCodeId = local.id as string;
    result = {
      code: String(local.code ?? code),
      description_ar: local.description_ar ? String(local.description_ar) : null,
      description_en: local.description_en ? String(local.description_en) : null,
      causes: local.causes ? String(local.causes) : null,
      solutions: local.solutions ? String(local.solutions) : null,
      symptoms: local.symptoms ? String(local.symptoms) : null,
      source: "local",
    };
  } else {
    const aiResult = await searchWithAI(code);
    if (aiResult) {
      obdCodeId = randomUUID();
      await db.execute({
        sql: `INSERT INTO obd_codes (id, company_id, code, description_ar, causes, solutions, symptoms, source)
              VALUES (?, ?, ?, ?, ?, ?, ?, 'ai')`,
        args: [
          obdCodeId,
          companyId,
          code.toUpperCase(),
          aiResult.description_ar || null,
          aiResult.causes || null,
          aiResult.solutions || null,
          aiResult.symptoms || null,
        ],
      });
      result = {
        code: code.toUpperCase(),
        description_ar: aiResult.description_ar || null,
        description_en: null,
        causes: aiResult.causes || null,
        solutions: aiResult.solutions || null,
        symptoms: aiResult.symptoms || null,
        source: "ai",
      };
    } else {
      result = {
        code: code.toUpperCase(),
        description_ar:
          "لم يتم العثور على الكود في القاعدة المحلية. لتفعيل التحليل الموسّع عبر EFCT، أضف GEMINI_API_KEY أو OPENAI_API_KEY في إعدادات Vercel.",
        description_en: null,
        causes: null,
        solutions: null,
        symptoms: null,
        source: "not_found",
      };
    }
  }
  return { result, obdCodeId };
}

export const EXTRACT_CODES_PROMPT = `هذا تقرير تشخيص لسيارة. استخرج كل أكواد الأعطال (DTC) التي تظهر في التقرير.

صيغ الأكواد المدعومة (استخرجها كما هي):
- P0100, P0796, P0746
- C1211, C1206, C1201, C1215, C1200, C1340, C1216, C1210
- B1419, B3902-00
- P0796.1, C1211.1 (مع نقطة ورقم)
- 01314, B250000

وابحث عن: System fault code, DTC, كود العطل، أي حرف P/B/C/U متبوع بأرقام.

أجب JSON فقط:
{"codes":["P0796","P0746","C1211","C1206",...],"vehicle":{"brand":"Mitsubishi","model":"Mirage","year":2014,"vin":"..."}}

إذا لم تجد: {"codes":[],"vehicle":null}`;

const OBD_CODE_PATTERNS = [
  /^[PBCU]\d{4}$/,           // P0100, B0001
  /^[PBCU]\d{4}-\d{2}$/,     // B3902-00, U0184-00
  /^[PBCU]\d{4}\.\d$/,       // P0796.1, C1211.1 (Mitsubishi, etc.)
  /^[PBCU]\d{5,6}$/,         // B250000, B251800
  /^0\d{4}$/,                // 01314, 01317 (VAG/Skoda manufacturer)
];

function isValidObdCode(c: string): boolean {
  const s = String(c).trim().toUpperCase().replace(/\s/g, "");
  if (s.length < 4 || s.length > 12) return false;
  return OBD_CODE_PATTERNS.some((p) => p.test(s));
}

/** يُرجع الكود الأساسي للتخزين والبحث (يزيل .1, -00 إلخ) */
function normalizeCode(c: string): string {
  let s = String(c).trim().toUpperCase().replace(/\s/g, "");
  s = s.replace(/\.\d+$/, "").replace(/-\d{2}$/, ""); // P0796.1 -> P0796, B3902-00 -> B3902
  return s;
}

export type ExtractedReport = {
  codes: string[];
  vehicle: { brand: string; model: string; year: number | null; vin: string } | null;
  reason?: "no_api_key" | "api_error" | "no_codes_in_file";
  /** تفاصيل الخطأ من API */
  errorDetail?: string;
};

export async function extractCodesFromFile(
  base64: string,
  mimeType: string
): Promise<ExtractedReport> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!geminiKey && !(groqKey && (mimeType.startsWith("image/") || mimeType === "application/pdf"))) {
    return { codes: [], vehicle: null, reason: "no_api_key" };
  }

  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash"];
  let lastReason: "api_error" | "no_codes_in_file" = "no_codes_in_file";
  let lastError = "";

  if (geminiKey) {
    for (const model of models) {
    try {
      const parts: Array<{ inlineData?: { mimeType: string; data: string }; text?: string }> = [
        { inlineData: { mimeType, data: base64 } },
        { text: EXTRACT_CODES_PROMPT },
      ];

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: { temperature: 0.1 },
          }),
        }
      );

      if (!res.ok) {
        lastReason = "api_error";
        const errBody = await res.text();
        try {
          const errJson = JSON.parse(errBody);
          lastError = errJson?.error?.message || errBody.slice(0, 200);
        } catch {
          lastError = errBody.slice(0, 200);
        }
        continue;
      }
      const data = await res.json();
      const blockReason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason;
      if (blockReason && blockReason !== "STOP" && blockReason !== "END_TURN") {
        lastReason = "api_error";
        lastError = `تم حظر المحتوى: ${blockReason}`;
        continue;
      }
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      let rawCodes: string[] = [];
      let parsed: { codes?: string[]; vehicle?: { brand?: string; model?: string; year?: number; vin?: string } | null } = {};
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          parsed = JSON.parse(match[0]);
          rawCodes = parsed?.codes ?? [];
        } catch {
          const codeRegex = /[PBCU]\d{4}(?:\.\d|-\d{2})?|\b0\d{4}\b|[PBCU]\d{5,6}/gi;
          rawCodes = [...(text.match(codeRegex) ?? [])];
        }
      } else {
        const codeRegex = /[PBCU]\d{4}(?:\.\d|-\d{2})?|\b0\d{4}\b|[PBCU]\d{5,6}/gi;
        rawCodes = [...(text.match(codeRegex) ?? [])];
      }
      const codes = [...new Set(rawCodes.map(normalizeCode).filter(isValidObdCode))];
      const v = parsed?.vehicle;
      const vehicle =
        v && (v.brand || v.model || v.year || v.vin)
          ? {
              brand: String(v.brand ?? "").trim(),
              model: String(v.model ?? "").trim(),
              year: typeof v.year === "number" ? v.year : null,
              vin: String(v.vin ?? "").trim(),
            }
          : null;
      return { codes, vehicle };
    } catch {
      lastReason = "api_error";
    }
  }
  }

  if (mimeType === "application/pdf" && groqKey) {
    try {
      const buffer = Buffer.from(base64, "base64");
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      const pdfText = text ?? "";
      if (pdfText.length > 100) {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${groqKey}`,
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "user",
                content: `استخرج كل أكواد الأعطال (DTC) من هذا النص. صيغ الأكواد: P0100, C1211, B1419, P0796.1, 01314. أجب JSON فقط: {"codes":["P0796","P0746",...],"vehicle":{"brand":"","model":"","year":null,"vin":""}}\n\nنص التقرير:\n${pdfText.slice(0, 100000)}`,
              },
            ],
            temperature: 0.1,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = data.choices?.[0]?.message?.content ?? "";
          let rawCodes: string[] = [];
          const match = text.match(/\{[\s\S]*\}/);
          if (match) {
            try {
              const parsed = JSON.parse(match[0]) as { codes?: string[]; vehicle?: { brand?: string; model?: string; year?: number; vin?: string } };
              rawCodes = parsed?.codes ?? [];
              const codes = [...new Set(rawCodes.map(normalizeCode).filter(isValidObdCode))];
              if (codes.length > 0) {
                const v = parsed?.vehicle;
                const vehicle = v && (v.brand || v.model || v.year || v.vin)
                  ? { brand: String(v.brand ?? "").trim(), model: String(v.model ?? "").trim(), year: typeof v.year === "number" ? v.year : null, vin: String(v.vin ?? "").trim() }
                  : null;
                return { codes, vehicle };
              }
            } catch {
              const codeRegex = /[PBCU]\d{4}(?:\.\d|-\d{2})?|\b0\d{4}\b|[PBCU]\d{5,6}/gi;
              rawCodes = [...(text.match(codeRegex) ?? [])];
            }
          } else {
            const codeRegex = /[PBCU]\d{4}(?:\.\d|-\d{2})?|\b0\d{4}\b|[PBCU]\d{5,6}/gi;
            rawCodes = [...(text.match(codeRegex) ?? [])];
          }
          const codes = [...new Set(rawCodes.map(normalizeCode).filter(isValidObdCode))];
          if (codes.length > 0) return { codes, vehicle: null };
        }
      }
    } catch (e) {
      lastError = String(e);
    }
  }

  if (mimeType.startsWith("image/") && groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "meta-llama/llama-4-scout-17b-16e-instruct",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: EXTRACT_CODES_PROMPT },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
              ],
            },
          ],
          temperature: 0.1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        let rawCodes: string[] = [];
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]) as { codes?: string[]; vehicle?: { brand?: string; model?: string; year?: number; vin?: string } };
            rawCodes = parsed?.codes ?? [];
            const codes = [...new Set(rawCodes.map(normalizeCode).filter(isValidObdCode))];
            if (codes.length > 0) {
              const v = parsed?.vehicle;
              const vehicle = v && (v.brand || v.model || v.year || v.vin)
                ? { brand: String(v.brand ?? "").trim(), model: String(v.model ?? "").trim(), year: typeof v.year === "number" ? v.year : null, vin: String(v.vin ?? "").trim() }
                : null;
              return { codes, vehicle };
            }
          } catch {
            const codeRegex = /[PBCU]\d{4}(?:\.\d|-\d{2})?|\b0\d{4}\b|[PBCU]\d{5,6}/gi;
            rawCodes = [...(text.match(codeRegex) ?? [])];
          }
        } else {
          const codeRegex = /[PBCU]\d{4}(?:\.\d|-\d{2})?|\b0\d{4}\b|[PBCU]\d{5,6}/gi;
          rawCodes = [...(text.match(codeRegex) ?? [])];
        }
        const codes = [...new Set(rawCodes.map(normalizeCode).filter(isValidObdCode))];
        if (codes.length > 0) {
          return { codes, vehicle: null };
        }
      }
    } catch {
      // Groq vision failed
    }
  }

  return { codes: [], vehicle: null, reason: lastReason, errorDetail: lastError || undefined };
}
