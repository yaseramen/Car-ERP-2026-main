/**
 * تطبيع نص عربي وبحث تقريبي بدون API خارجي — لتقليل أثر أخطاء الإدخال.
 */

export function stripDiacritics(s: string): string {
  return s.replace(/[\u064B-\u065F\u0670]/g, "");
}

/** توحيد أشكال الحروف الشائعة للمطابقة */
export function normalizeArabicLoose(s: string): string {
  let t = stripDiacritics(s);
  t = t.replace(/[أإآٱ]/g, "ا");
  t = t.replace(/ة/g, "ه");
  t = t.replace(/ى/g, "ي");
  t = t.replace(/ؤ/g, "و");
  t = t.replace(/ئ/g, "ي");
  t = t.replace(/ـ/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t.toLowerCase();
}

/** أنماط LIKE إضافية (أخطاء لوحة مفاتيح عربية شائعة) */
function typoPatternsForToken(token: string): string[] {
  const out = new Set<string>();
  const t = token.toLowerCase();
  out.add(t);
  // أ <-> ي (جوار على لوحة أحياناً)
  if (t.includes("ا")) out.add(t.replace(/ا/g, "ي"));
  if (t.includes("ي")) out.add(t.replace(/ي/g, "ا"));
  // س <-> ش
  if (t.includes("س")) out.add(t.replace(/س/g, "ش"));
  if (t.includes("ش")) out.add(t.replace(/ش/g, "س"));
  // ت <-> ط
  if (t.includes("ت")) out.add(t.replace(/ت/g, "ط"));
  if (t.includes("ط")) out.add(t.replace(/ط/g, "ت"));
  return [...out].filter((x) => x.length >= 1);
}

export function likePatternsForPhrase(phrase: string): string[] {
  const n = normalizeArabicLoose(phrase);
  const words = n.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length === 0) return [];
  const patterns = new Set<string>();
  patterns.add(`%${n.replace(/\s+/g, "%")}%`);
  for (const w of words) {
    for (const v of typoPatternsForToken(w)) {
      patterns.add(`%${v}%`);
    }
  }
  return [...patterns].slice(0, 12);
}

export function scoreNameMatch(query: string, candidate: string): number {
  const q = normalizeArabicLoose(query);
  const c = normalizeArabicLoose(candidate);
  if (!q || !c) return 0;
  if (c === q) return 1000 + q.length;
  if (c.includes(q)) return 500 + q.length;
  const qw = q.split(/\s+/).filter((x) => x.length >= 2);
  let s = 0;
  for (const w of qw) {
    if (c.includes(w)) s += w.length * 10;
    else {
      for (const v of typoPatternsForToken(w)) {
        if (v !== w && c.includes(v)) {
          s += w.length * 6;
          break;
        }
      }
    }
  }
  return s;
}

const DEFAULT_STOP = new Set([
  "ما",
  "هل",
  "كم",
  "عند",
  "في",
  "من",
  "على",
  "هذا",
  "هذه",
  "ذلك",
  "اريد",
  "أريد",
  "بحث",
  "عن",
  "ظهر",
  "لي",
  "لو",
  "سجل",
  "عرض",
  "جلب",
  "اعطني",
  "أعطني",
  "بدي",
  "منفضلك",
  "من",
  "فضلك",
]);

/** يستخرج عبارة بحث من الرسالة بعد إزالة كلمات التوقف */
export function extractSearchPhrase(message: string, extraStop: string[] = []): string {
  const stop = new Set([...DEFAULT_STOP, ...extraStop.map((x) => x.toLowerCase())]);
  const words = message
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !stop.has(normalizeArabicLoose(w)));
  return words.join(" ").trim();
}
