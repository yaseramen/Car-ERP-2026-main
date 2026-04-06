/** حقول إضافية تُخزَّن في عمود symptoms كـ JSON (v:2) — آمن للاستيراد من العميل */

export type ObdSymptomsPayloadV2 = {
  v: 2;
  symptoms: string;
  affected_system_ar?: string;
  severity?: string;
  severity_note_ar?: string;
  testing_steps?: string;
  how_to_confirm_ar?: string;
  repair_vs_replace_ar?: string;
  prevention_tips_ar?: string;
  professional_notes_ar?: string;
};

export function parseSymptomsColumn(symptoms: string | null | undefined): ObdSymptomsPayloadV2 | null {
  if (!symptoms || typeof symptoms !== "string") return null;
  const t = symptoms.trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as { v?: number };
    if (o && o.v === 2 && typeof o === "object") return o as ObdSymptomsPayloadV2;
  } catch {
    return null;
  }
  return null;
}
