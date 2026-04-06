import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { ensureTreasuries } from "@/lib/treasuries";
import { getCompanyId } from "@/lib/company";
import { getUserPermissions } from "@/lib/permissions";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 19).replace("T", " ");
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = x.getDate() - day + (day === 0 ? -6 : 1);
  x.setDate(diff);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 19).replace("T", " ");
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 19).replace("T", " ");
}

export async function GET() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: "غير مصرح" }, { status: 401 });

  const isFullAccess = session.user.role === "super_admin" || session.user.role === "tenant_owner";
  const perms = !isFullAccess ? await getUserPermissions(session.user.id) : null;
  const canSeeSales = isFullAccess || perms?.invoices?.read || perms?.cashier?.read || perms?.reports?.read;
  const canSeeTreasuries = isFullAccess || perms?.treasuries?.read;
  const canSeeWorkshop = isFullAccess || perms?.workshop?.read;
  const canSeeInventory = isFullAccess || perms?.inventory?.read;

  try {
    await ensureTreasuries(companyId);

    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);
    const monthStart = startOfMonth(now);

    const salesToday = await db.execute({
      sql: `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM invoices WHERE company_id = ? AND type IN ('sale', 'maintenance')
            AND status NOT IN ('cancelled', 'returned') AND created_at >= ?`,
      args: [companyId, todayStart],
    });

    const salesWeek = await db.execute({
      sql: `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM invoices WHERE company_id = ? AND type IN ('sale', 'maintenance')
            AND status NOT IN ('cancelled', 'returned') AND created_at >= ?`,
      args: [companyId, weekStart],
    });

    const salesMonth = await db.execute({
      sql: `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
            FROM invoices WHERE company_id = ? AND type IN ('sale', 'maintenance')
            AND status NOT IN ('cancelled', 'returned') AND created_at >= ?`,
      args: [companyId, monthStart],
    });

    const workshopStats = await db.execute({
      sql: `SELECT stage, COUNT(*) as cnt FROM repair_orders WHERE company_id = ?
            GROUP BY stage`,
      args: [companyId],
    });

    const lowStock = await db.execute({
      sql: `SELECT COUNT(*) as cnt FROM items i
            WHERE i.company_id = ? AND i.is_active = 1 AND i.min_quantity > 0
            AND COALESCE((SELECT SUM(quantity) FROM item_warehouse_stock WHERE item_id = i.id), 0) < i.min_quantity`,
      args: [companyId],
    });

    const pendingInvoices = await db.execute({
      sql: `SELECT COUNT(*) as cnt, COALESCE(SUM(total - paid_amount), 0) as remaining
            FROM invoices WHERE company_id = ? AND status IN ('pending', 'partial')
            AND type IN ('sale', 'maintenance')`,
      args: [companyId],
    });

    const treasuries = await db.execute({
      sql: "SELECT type, balance FROM treasuries WHERE company_id = ? AND is_active = 1",
      args: [companyId],
    });

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysStr = sevenDaysAgo.toISOString().slice(0, 19).replace("T", " ");

    const dailySales = await db.execute({
      sql: `SELECT DATE(created_at) as day, COALESCE(SUM(total), 0) as total
            FROM invoices WHERE company_id = ? AND type IN ('sale', 'maintenance')
            AND status NOT IN ('cancelled', 'returned')
            AND created_at >= ?
            GROUP BY DATE(created_at) ORDER BY day`,
      args: [companyId, sevenDaysStr],
    });

    const workshopByStage: Record<string, number> = {};
    for (const row of workshopStats.rows) {
      workshopByStage[String(row.stage ?? "")] = Number(row.cnt ?? 0);
    }

    const treasuryBalances: Record<string, number> = {};
    for (const row of treasuries.rows) {
      treasuryBalances[String(row.type ?? "")] = Number(row.balance ?? 0);
    }

    const dailyData = dailySales.rows.map((r) => ({
      day: String(r.day ?? ""),
      total: Number(r.total ?? 0),
    }));

    return NextResponse.json({
      canSee: { sales: canSeeSales, treasuries: canSeeTreasuries, workshop: canSeeWorkshop, inventory: canSeeInventory },
      sales: canSeeSales
        ? {
            today: { total: Number(salesToday.rows[0]?.total ?? 0), count: Number(salesToday.rows[0]?.count ?? 0) },
            week: { total: Number(salesWeek.rows[0]?.total ?? 0), count: Number(salesWeek.rows[0]?.count ?? 0) },
            month: { total: Number(salesMonth.rows[0]?.total ?? 0), count: Number(salesMonth.rows[0]?.count ?? 0) },
          }
        : { today: { total: 0, count: 0 }, week: { total: 0, count: 0 }, month: { total: 0, count: 0 } },
      workshop: canSeeWorkshop ? workshopByStage : {},
      lowStockCount: canSeeInventory ? Number(lowStock.rows[0]?.cnt ?? 0) : 0,
      pendingInvoices: canSeeSales
        ? { count: Number(pendingInvoices.rows[0]?.cnt ?? 0), remaining: Number(pendingInvoices.rows[0]?.remaining ?? 0) }
        : { count: 0, remaining: 0 },
      treasuries: canSeeTreasuries ? treasuryBalances : {},
      dailySales: canSeeSales ? dailyData : [],
    });
  } catch (error) {
    console.error("Reports summary error:", error);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}
