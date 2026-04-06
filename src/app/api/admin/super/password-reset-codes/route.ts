import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";
import {
  generateTenantResetCodePlain,
  hashTenantResetCode,
  expiresAtIso,
  TENANT_RESET_CODE_TTL_HOURS,
} from "@/lib/tenant-reset-code";
import { logAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  let body: { company_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }

  const companyId = body.company_id?.trim();
  if (!companyId) {
    return NextResponse.json({ error: "معرّف الشركة مطلوب" }, { status: 400 });
  }

  try {
    const ownerResult = await db.execute({
      sql: "SELECT id, email, name FROM users WHERE company_id = ? AND role = 'tenant_owner' LIMIT 1",
      args: [companyId],
    });
    if (ownerResult.rows.length === 0) {
      return NextResponse.json({ error: "لا يوجد مالك (tenant_owner) لهذه الشركة" }, { status: 400 });
    }

    const userId = String(ownerResult.rows[0].id);
    const ownerEmail = String(ownerResult.rows[0].email ?? "");

    await db.execute({
      sql: `UPDATE tenant_password_reset_codes SET used_at = datetime('now')
            WHERE user_id = ? AND used_at IS NULL`,
      args: [userId],
    });

    const plain = generateTenantResetCodePlain();
    const codeHash = await hashTenantResetCode(plain);
    const id = randomUUID();
    const exp = expiresAtIso(TENANT_RESET_CODE_TTL_HOURS);

    await db.execute({
      sql: `INSERT INTO tenant_password_reset_codes
            (id, company_id, user_id, code_hash, expires_at, created_by_super_admin_id)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, companyId, userId, codeHash, exp, session.user.id],
    });

    await logAudit({
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? undefined,
      action: "password_reset_code_issue",
      entityType: "password_reset_code",
      entityId: id,
      details: `كود استعادة كلمة مرور لمالك ${ownerEmail}`,
    });

    return NextResponse.json({
      success: true,
      code: plain,
      expires_at: exp,
      owner_email: ownerEmail,
      ttl_hours: TENANT_RESET_CODE_TTL_HOURS,
      message:
        "أرسل هذا الكود لمالك الشركة لمرة واحدة. صلاحيته محدودة ولا يُعاد عرضه من النظام.",
    });
  } catch (e) {
    console.error("password-reset-codes POST:", e);
    return NextResponse.json({ error: "فشل إنشاء الكود" }, { status: 500 });
  }
}
