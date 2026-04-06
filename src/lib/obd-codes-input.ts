/**
 * استخراج أكواد OBD من نص حر (أسطر، فواصل، مسافات) مع تحمّل أخطاء شائعة.
 */

export function parseObdCodesFromFreeText(text: string): string[] {
  const raw = text.replace(/\u060c/g, ",").trim();
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\b(P|C|B|U)[0-9A-Z]{3,5}\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const c = m[0].replace(/\s/g, "").toUpperCase();
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

export function parseYearInput(y: string): number | null {
  const t = y.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  if (!Number.isFinite(n) || n < 1980 || n > new Date().getFullYear() + 1) return null;
  return n;
}
