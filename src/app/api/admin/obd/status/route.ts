import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCompanyId } from "@/lib/company";
import { canAccess } from "@/lib/permissions";

/** يتحقق من توفر مفاتيح خدمة التحليل في EFCT (بدون كشف القيم) */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const companyId = getCompanyId(session);
  const isSuperAdmin = session.user.role === "super_admin";
  const isTenantOwner = session.user.role === "tenant_owner";
  const isEmployeeWithAccess =
    session.user.role === "employee" &&
    session.user.id &&
    companyId &&
    (await canAccess(session.user.id, "employee", companyId, "obd", "read"));

  if (!isSuperAdmin && !isTenantOwner && !isEmployeeWithAccess) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const gemini = !!process.env.GEMINI_API_KEY;
  const groq = !!process.env.GROQ_API_KEY;
  const openai = !!process.env.OPENAI_API_KEY;
  const aiAvailable = gemini || groq || openai;
  const providers = [gemini && "Gemini", groq && "Groq", openai && "OpenAI"].filter(Boolean);

  const message = aiAvailable
    ? "أداة التحليل في EFCT جاهزة"
    : isSuperAdmin
      ? "أضف GEMINI_API_KEY أو GROQ_API_KEY أو OPENAI_API_KEY في Vercel → Settings → Environment Variables ثم أعد النشر"
      : "أداة التحليل في EFCT غير مفعّلة. تواصل مع مدير النظام لإضافة مفاتيح API في إعدادات الاستضافة.";

  return NextResponse.json({
    geminiAvailable: gemini,
    groqAvailable: groq,
    openaiAvailable: openai,
    aiAvailable,
    providers,
    message,
  });
}
