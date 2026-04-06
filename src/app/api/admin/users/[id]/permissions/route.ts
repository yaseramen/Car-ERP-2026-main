import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";

const SYSTEM_COMPANY_ID = "company-system";

function getCompanyId(session: { user?: { role?: string; companyId?: string | null } }): string | null {
  if (session.user?.role === "super_admin") return SYSTEM_COMPANY_ID;
  return session.user?.companyId ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id } = await params;

  try {
    const userCheck = await db.execute({
      sql: "SELECT id FROM users WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    const result = await db.execute({
      sql: `SELECT s.id as screen_id, s.module, s.name_ar,
             COALESCE(up.can_read, 0) as can_read,
             COALESCE(up.can_create, 0) as can_create,
             COALESCE(up.can_update, 0) as can_update,
             COALESCE(up.can_delete, 0) as can_delete
             FROM screens s
             LEFT JOIN user_permissions up ON up.screen_id = s.id AND up.user_id = ?
             ORDER BY s.name_ar`,
      args: [id],
    });

    const permissions = result.rows.map((r) => {
      const row = r as Record<string, unknown>;
      const nameAr = row.name_ar ?? row.NAME_AR ?? row["name_ar"];
      return {
        screen_id: String(row.screen_id ?? row.SCREEN_ID ?? ""),
        module: String(row.module ?? row.MODULE ?? ""),
        name_ar: String(nameAr ?? "").trim(),
        can_read: Number(row.can_read ?? 0) === 1,
        can_create: Number(row.can_create ?? 0) === 1,
        can_update: Number(row.can_update ?? 0) === 1,
        can_delete: Number(row.can_delete ?? 0) === 1,
      };
    });

    return NextResponse.json(permissions);
  } catch (error) {
    console.error("Permissions GET error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role)) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const { id } = await params;

  try {
    const userCheck = await db.execute({
      sql: "SELECT id, role FROM users WHERE id = ? AND company_id = ?",
      args: [id, companyId],
    });
    if (userCheck.rows.length === 0) {
      return NextResponse.json({ error: "المستخدم غير موجود" }, { status: 404 });
    }

    const userRole = String(userCheck.rows[0].role ?? "");
    if (userRole === "tenant_owner" || userRole === "super_admin") {
      return NextResponse.json({ error: "لا يمكن تعديل صلاحيات المالك" }, { status: 403 });
    }

    const body = await request.json();
    const permissions = Array.isArray(body.permissions) ? body.permissions : body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      return NextResponse.json({ error: "صلاحيات مطلوبة" }, { status: 400 });
    }

    await db.execute({
      sql: "DELETE FROM user_permissions WHERE user_id = ?",
      args: [id],
    });

    for (const p of permissions) {
      const screenId = p.screen_id ?? p.screenId;
      const canRead = p.can_read ?? p.canRead ? 1 : 0;
      const canCreate = p.can_create ?? p.canCreate ? 1 : 0;
      const canUpdate = p.can_update ?? p.canUpdate ? 1 : 0;
      const canDelete = p.can_delete ?? p.canDelete ? 1 : 0;

      if (!screenId || (canRead === 0 && canCreate === 0 && canUpdate === 0 && canDelete === 0)) continue;

      const permId = randomUUID();
      await db.execute({
        sql: `INSERT INTO user_permissions (id, user_id, screen_id, can_read, can_create, can_update, can_delete)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [permId, id, screenId, canRead, canCreate, canUpdate, canDelete],
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Permissions PUT error:", error);
    return NextResponse.json({ error: "فشل في حفظ الصلاحيات" }, { status: 500 });
  }
}
