/**
 * استخراج نص القراءات الحية من صورة شاشة السكانر (OCR عبر Gemini Vision).
 */
const OCR_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.5-flash"] as const;

const LIVE_SCREEN_OCR_PROMPT = `هذه صورة لشاشة سكانر سيارات أو قائمة "Live Data" / قراءات حية / PID.

المطلوب: انسخ **كل** النصوص والأرقام الظاهرة كما هي (تسميات القيم مثل RPM، Coolant، STFT، O2، إلخ مع قيمها).
- أخرج **نصاً عادياً فقط** بدون مقدمات أو شرح.
- إن كانت الصورة غير واضحة أو ليست شاشة قراءات، اكتب بدقة ما تستطيع قراءته من أرقام ونصوص.
- لا تخترع أرقاماً غير ظاهرة في الصورة.`;

export async function transcribeLiveDataFromImage(base64: string, mimeType: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  for (const model of OCR_MODELS) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { inlineData: { mimeType, data: base64 } },
                  { text: LIVE_SCREEN_OCR_PROMPT },
                ],
              },
            ],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
          }),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = String(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
      if (text.length >= 8) return text;
    } catch {
      continue;
    }
  }
  return null;
}
