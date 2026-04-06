import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserPermissions } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const role = session.user.role;
  if (role === "super_admin" || role === "tenant_owner") {
    return NextResponse.json({ fullAccess: true, permissions: {} });
  }

  const permissions = await getUserPermissions(session.user.id);
  return NextResponse.json({ fullAccess: false, permissions });
}
