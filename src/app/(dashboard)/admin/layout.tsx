import { auth } from "@/auth";
import { redirect } from "next/navigation";

/** شعار الشركة يتغيّر من الإعدادات — لا نخزّن التخطيط ليُحدَّث فوراً بعد الحفظ */
export const dynamic = "force-dynamic";
import { db } from "@/lib/db/client";
import { AdminLayoutClient } from "@/components/dashboard/admin-layout-client";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { ChargeRequiredBlock } from "@/components/charge-required-block";
import { SYSTEM_COMPANY_ID } from "@/lib/company";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role)) {
    redirect("/login");
  }

  /** رصيد المحفظة ≤ 0: إيقاف البرنامج للمستأجر (عدا super_admin) — انظر ChargeRequiredBlock */
  let showChargeRequired = false;
  if (session.user.role !== "super_admin" && session.user.companyId) {
    const wallet = await db.execute({
      sql: "SELECT balance FROM company_wallets WHERE company_id = ?",
      args: [session.user.companyId],
    });
    const balance = wallet.rows[0] ? Number(wallet.rows[0].balance ?? 0) : 0;
    if (balance <= 0) showChargeRequired = true;
  }

  if (showChargeRequired) {
    return <ChargeRequiredBlock />;
  }

  let companyLogoUrl: string | null = null;
  /** سوبر أدمن يحرّر إعدادات شركة النظام (انظر getCompanyId) — لا نعتمد على company_id في الجلسة فقط */
  let companyNameForHeader = session.user.companyName ?? null;
  if (session.user.role === "super_admin") {
    const br = await db.execute({
      sql: "SELECT logo_url, name FROM companies WHERE id = ?",
      args: [SYSTEM_COMPANY_ID],
    });
    const row = br.rows[0];
    if (row?.logo_url) companyLogoUrl = String(row.logo_url);
    if (row?.name) companyNameForHeader = String(row.name);
  } else if (session.user.companyId) {
    const br = await db.execute({
      sql: "SELECT logo_url FROM companies WHERE id = ?",
      args: [session.user.companyId],
    });
    const u = br.rows[0]?.logo_url;
    companyLogoUrl = u ? String(u) : null;
  }

  return (
    <NotificationsProvider>
      <AdminLayoutClient
        role={session.user.role ?? "employee"}
        businessType={session.user.companyBusinessType ?? null}
        companyName={companyNameForHeader}
        companyLogoUrl={companyLogoUrl}
      >
        {children}
      </AdminLayoutClient>
    </NotificationsProvider>
  );
}
