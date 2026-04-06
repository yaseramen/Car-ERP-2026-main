import type { ObdResult } from "@/lib/obd";
import { fullObdSystemPersona, WORKSHOP_SYSTEM_PERSONA as WORKSHOP_PERSONA } from "@/lib/obd-ai-context";

export { WORKSHOP_PERSONA as WORKSHOP_SYSTEM_PERSONA };

export type IntegratedStep = {
  priority: number;
  title: string;
  detail: string;
  related_codes?: string[];
};

export type CodeRelation = {
  from: string;
  to: string;
  relation_ar: string;
};

export type PerCodeWorkshopLine = {
  code: string;
  /** وظيفة الكود والنظام المرتبط — تحليل منفصل مختصر */
  role_ar: string;
};

export type IntegratedAnalysis = {
  /** ملخص قصير للحالة ككل */
  summary_ar: string;
  /** تحليل منفذ لكل كود: وظيفة + نظام */
  per_code_analysis?: PerCodeWorkshopLine[];
  /** علاقات تقنية واضحة فقط؛ إن لم توجد قل ذلك صراحة */
  code_relations: CodeRelation[];
  /** سبب جذري واحد محتمل + نسبة تقريبية إن أمكن */
  root_cause_ar?: string;
  /** أسباب استبعدتها ولماذا */
  excluded_causes_ar?: string;
  /** كيف قد يتسلسل العطل */
  cascade_ar: string;
  /** 5 إلى 7 خطوات فقط: من الأبسط والأرخص إلى ECU آخراً */
  prioritized_steps: IntegratedStep[];
  /** أخطاء شائعة للفني */
  common_mistakes_ar?: string;
  /** متى الاستبدال ضروري مقابل الفحص */
  replacement_guidance_ar?: string;
  disclaimer_ar: string;
};

const INTEGRATED_PROMPT = `لديك أكواد من تقرير OBD واحد لنفس المركبة. الحقل vehicle قد يحتوي على ماركة/موديل/سنة بالعربية إذا زوّدها المستخدم — استخدمها لتفسير أقرب للواقع دون اختراع أعطال خاصة بماركة لم تُذكر.
البيانات (JSON):
{payload}

🚨 قواعد إلزامية:
1- لا تفترض أن وحدة إلكترونية (BCM/ECU/TCU…) هي السبب الرئيسي قبل استبعاد الأسباب البسيطة (فيوز، أرضي، فيشة، تآكل).
2- لا تدمج الأكواد كسبب واحد إلا إذا كان هناك رابط تقني واضح ومؤكد؛ وإلا اذكر أنها قد تكون مستقلة.
3- رتّب الأسباب حسب الاحتمال الفعلي في الورشة — الأرخص والأسهل فحصاً أولاً.
4- إذا كان أكثر من كود: تعامل معها كنظام واحد لكن حلّل كل كود منفرداً أولاً ثم الربط.
5- prioritized_steps يجب أن يكون بين 5 و 7 خطوات فقط، تبدأ بـ: فيوز/أرضي/لمبة/فيشة → قياسات كهربائية → حساسات → وحدات تحكم كآخر خيار.

تشخيص ورشة شامل للتقرير (كما يطلب فني محترف):
- حدّد السبب الرئيسي المحتمل للظهور المشترك للأكواد إن وُجد دليل تقني.
- خطة إصلاح كاملة بترتيب أولويات واضح.
- لا تخترع بيانات Live Data؛ اذكر الفحص العام (سكانر، قياس، رسم بياني) دون أرقام وهمية.

المطلوب بالعربية فقط، JSON صالح فقط بدون markdown:
{
  "summary_ar": "2-4 جمل: صورة الحالة ككل للفني",
  "per_code_analysis": [
    { "code": "P0XXX", "role_ar": "معنى الكود بلغة بسيطة + النظام المتأثر + درجة خطورة مختصرة (منخفض/متوسط/عالي) — سطران كحد أقصى" }
  ],
  "code_relations": [
    { "from": "P0XXX", "to": "P0YYY", "relation_ar": "رابط تقني واضح أو اكتب إن لا يوجد رابط مباشر" }
  ],
  "root_cause_ar": "السبب الجذري الأرجح مع نسبة تقريبية إن أمكن (مثلاً 60٪)",
  "excluded_causes_ar": "ما استبعدته ولماذا — مختصر",
  "cascade_ar": "كيف قد يتسلسل العطل إن وُجد سبب جذري واحد",
  "prioritized_steps": [
    { "priority": 1, "title": "عنوان", "detail": "ماذا تفعل بالضبط ولماذا", "related_codes": ["P0XXX"] }
  ],
  "common_mistakes_ar": "أخطاء شائعة يقع فيها الفني في هذه الحالة — نقاط",
  "replacement_guidance_ar": "متى يكون استبدال القطعة ضرورياً وليس مجرد اختبار",
  "disclaimer_ar": "جملة: استرشادي وليس بديلاً عن الفحص بالمعدات والورشة."
}

قيود:
- prioritized_steps: العدد بين 5 و 7 (إذا كود واحد فقط يمكن 5 خطوات تغطي نفس الكود).
- related_codes فقط من الأكواد الموجودة في البيانات أعلاه.
- لا تخترع أكواداً.`;

function safeJsonParse<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function normalizeIntegrated(raw: unknown): IntegratedAnalysis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary_ar = typeof o.summary_ar === "string" ? o.summary_ar.trim() : "";
  const cascade_ar = typeof o.cascade_ar === "string" ? o.cascade_ar.trim() : "";
  const root_cause_ar = typeof o.root_cause_ar === "string" ? o.root_cause_ar.trim() : undefined;
  const excluded_causes_ar = typeof o.excluded_causes_ar === "string" ? o.excluded_causes_ar.trim() : undefined;
  const common_mistakes_ar = typeof o.common_mistakes_ar === "string" ? o.common_mistakes_ar.trim() : undefined;
  const replacement_guidance_ar = typeof o.replacement_guidance_ar === "string" ? o.replacement_guidance_ar.trim() : undefined;
  const disclaimer_ar =
    typeof o.disclaimer_ar === "string"
      ? o.disclaimer_ar.trim()
      : "هذا التحليل استرشادي ولا يغني عن الفحص اليدوي والمعدات الاحترافية.";

  const perRaw = Array.isArray(o.per_code_analysis) ? o.per_code_analysis : [];
  const per_code_analysis: PerCodeWorkshopLine[] = perRaw
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      const x = p as Record<string, unknown>;
      const code = typeof x.code === "string" ? x.code.trim().toUpperCase() : "";
      const role_ar = typeof x.role_ar === "string" ? x.role_ar.trim() : "";
      if (!code || !role_ar) return null;
      return { code, role_ar };
    })
    .filter((x): x is PerCodeWorkshopLine => x !== null);

  const stepsRaw = Array.isArray(o.prioritized_steps) ? o.prioritized_steps : [];
  const prioritized_steps: IntegratedStep[] = [];
  stepsRaw.forEach((s, idx) => {
    if (!s || typeof s !== "object") return;
    const st = s as Record<string, unknown>;
    const title = typeof st.title === "string" ? st.title.trim() : "";
    const detail = typeof st.detail === "string" ? st.detail.trim() : "";
    if (!title && !detail) return;
    const priority = typeof st.priority === "number" && Number.isFinite(st.priority) ? st.priority : idx + 1;
    const related_codes = Array.isArray(st.related_codes)
      ? st.related_codes.filter((c): c is string => typeof c === "string").map((c) => c.trim().toUpperCase())
      : undefined;
    const step: IntegratedStep = { priority, title: title || `خطوة ${idx + 1}`, detail };
    if (related_codes && related_codes.length > 0) step.related_codes = related_codes;
    prioritized_steps.push(step);
  });

  const relRaw = Array.isArray(o.code_relations) ? o.code_relations : [];
  const code_relations: CodeRelation[] = relRaw
    .map((r) => {
      if (!r || typeof r !== "object") return null;
      const x = r as Record<string, unknown>;
      const from = typeof x.from === "string" ? x.from.trim().toUpperCase() : "";
      const to = typeof x.to === "string" ? x.to.trim().toUpperCase() : "";
      const relation_ar = typeof x.relation_ar === "string" ? x.relation_ar.trim() : "";
      if (!from || !to) return null;
      return { from, to, relation_ar };
    })
    .filter((x): x is CodeRelation => x !== null);

  if (!summary_ar && prioritized_steps.length === 0 && code_relations.length === 0) return null;

  const out: IntegratedAnalysis = {
    summary_ar: summary_ar || "—",
    cascade_ar: cascade_ar || "",
    prioritized_steps,
    code_relations,
    disclaimer_ar,
  };
  if (per_code_analysis.length > 0) out.per_code_analysis = per_code_analysis;
  if (root_cause_ar) out.root_cause_ar = root_cause_ar;
  if (excluded_causes_ar) out.excluded_causes_ar = excluded_causes_ar;
  if (common_mistakes_ar) out.common_mistakes_ar = common_mistakes_ar;
  if (replacement_guidance_ar) out.replacement_guidance_ar = replacement_guidance_ar;
  return out;
}

export type VehicleContextForIntegrated = {
  brand_ar?: string;
  model_ar?: string;
  year?: number;
};

function buildIntegratedPayload(results: ObdResult[], vehicle?: VehicleContextForIntegrated): string {
  return JSON.stringify(
    {
      vehicle:
        vehicle && (vehicle.brand_ar || vehicle.model_ar || vehicle.year != null)
          ? {
              brand_ar: vehicle.brand_ar ?? null,
              model_ar: vehicle.model_ar ?? null,
              year: vehicle.year ?? null,
            }
          : null,
      codes: results.map((r) => ({
        code: r.code,
        description_ar: r.description_ar,
        causes: r.causes,
        solutions: r.solutions,
        symptoms: r.symptoms,
      })),
    },
    null,
    0
  );
}

async function analyzeIntegratedWithGemini(prompt: string, apiKey: string): Promise<IntegratedAnalysis | null> {
  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash"];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: `${fullObdSystemPersona(WORKSHOP_PERSONA)}\n\nأجب بالعربية فقط. JSON صالح فقط بدون تعليقات أو markdown.`,
                },
              ],
            },
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.25 },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const parsed = safeJsonParse<unknown>(text);
      const normalized = normalizeIntegrated(parsed);
      if (normalized) return normalized;
    } catch {
      continue;
    }
  }
  return null;
}

async function analyzeIntegratedWithGroq(prompt: string, apiKey: string): Promise<IntegratedAnalysis | null> {
  const models = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
  const system = `${fullObdSystemPersona(WORKSHOP_PERSONA)}\n\nأجب بالعربية فقط. JSON صالح فقط بدون markdown أو تعليقات.`;
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
            { role: "system", content: system },
            { role: "user", content: prompt },
          ],
          temperature: 0.25,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content ?? "";
      const parsed = safeJsonParse<unknown>(text);
      const normalized = normalizeIntegrated(parsed);
      if (normalized) return normalized;
    } catch {
      continue;
    }
  }
  return null;
}

export async function analyzeIntegratedObdReport(
  results: ObdResult[],
  vehicle?: VehicleContextForIntegrated
): Promise<IntegratedAnalysis | null> {
  if (results.length === 0) return null;

  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!geminiKey && !groqKey) return null;

  const payload = buildIntegratedPayload(results, vehicle);
  const prompt = INTEGRATED_PROMPT.replace("{payload}", payload);

  if (geminiKey) {
    const g = await analyzeIntegratedWithGemini(prompt, geminiKey);
    if (g) return g;
  }
  if (groqKey) {
    const gq = await analyzeIntegratedWithGroq(prompt, groqKey);
    if (gq) return gq;
  }
  return null;
}
