import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId } from "@/lib/company";
import { randomUUID } from "crypto";
import { WALLET_TOPUP_MIN_AMOUNT } from "@/lib/wallet-topup-constants";

function isValidBlobUrl(url: string): boolean {
  const u = url.trim();
  return u.startsWith("https://") && u.includes("blob.vercel-storage.com");
}

/** قائمة الطلبات: سوبر أدمن = المعلّقة + آخر 100؛ مالك = طلبات شركته */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const role = session.user.role;
  if (role === "super_admin") {
    try {
      const pending = await db.execute({
        sql: `SELECT r.id, r.company_id, r.requested_amount, r.receipt_blob_url, r.status, r.approved_amount, r.admin_comment, r.reject_reason,
              r.processed_at, r.created_at, r.tenant_ack_at,
              c.name as company_name,
              u.name as requested_by_name
              FROM wallet_topup_requests r
              JOIN companies c ON c.id = r.company_id
              JOIN users u ON u.id = r.requested_by
              WHERE r.status = 'pending'
              ORDER BY r.created_at DESC`,
      });
      const recent = await db.execute({
        sql: `SELECT r.id, r.company_id, r.requested_amount, r.receipt_blob_url, r.status, r.approved_amount, r.admin_comment, r.reject_reason,
              r.processed_at, r.created_at, r.tenant_ack_at,
              c.name as company_name,
              u.name as requested_by_name
              FROM wallet_topup_requests r
              JOIN companies c ON c.id = r.company_id
              JOIN users u ON u.id = r.requested_by
              WHERE r.status != 'pending'
              ORDER BY datetime(COALESCE(r.processed_at, r.created_at)) DESC
              LIMIT 100`,
      });
      return NextResponse.json({
        pending: pending.rows.map(mapRow),
        processed: recent.rows.map(mapRow),
      });
    } catch (e) {
      console.error("topup-requests GET super:", e);
      return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
    }
  }

  if (role !== "tenant_owner") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) {
    return NextResponse.json({ error: "لا توجد شركة مرتبطة" }, { status: 400 });
  }

  try {
    const r = await db.execute({
      sql: `SELECT r.id, r.company_id, r.requested_amount, r.receipt_blob_url, r.status, r.approved_amount, r.admin_comment, r.reject_reason,
            r.processed_at, r.created_at, r.tenant_ack_at,
            c.name as company_name,
            u.name as requested_by_name
            FROM wallet_topup_requests r
            JOIN companies c ON c.id = r.company_id
            JOIN users u ON u.id = r.requested_by
            WHERE r.company_id = ?
            ORDER BY r.created_at DESC
            LIMIT 50`,
      args: [companyId],
    });
    return NextResponse.json({ requests: r.rows.map(mapRow) });
  } catch (e) {
    console.error("topup-requests GET owner:", e);
    return NextResponse.json({ error: "فشل في جلب البيانات" }, { status: 500 });
  }
}

function mapRow(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ""),
    company_id: String(row.company_id ?? ""),
    company_name: row.company_name != null ? String(row.company_name) : "",
    requested_amount: Number(row.requested_amount ?? 0),
    receipt_blob_url: String(row.receipt_blob_url ?? ""),
    status: String(row.status ?? ""),
    approved_amount: row.approved_amount != null ? Number(row.approved_amount) : null,
    admin_comment: row.admin_comment != null ? String(row.admin_comment) : null,
    reject_reason: row.reject_reason != null ? String(row.reject_reason) : null,
    processed_at: row.processed_at != null ? String(row.processed_at) : null,
    created_at: String(row.created_at ?? ""),
    tenant_ack_at: row.tenant_ack_at != null ? String(row.tenant_ack_at) : null,
    requested_by_name: row.requested_by_name != null ? String(row.requested_by_name) : "",
  };
}

/** إنشاء طلب شحن معلّق */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "tenant_owner") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const companyId = getCompanyId(session);
  if (!companyId) {
    return NextResponse.json({ error: "لا توجد شركة مرتبطة" }, { status: 400 });
  }

  let body: { requested_amount?: unknown; receipt_blob_url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "جسم الطلب غير صالح" }, { status: 400 });
  }

  const amt = Number(body.requested_amount);
  if (!Number.isFinite(amt) || amt < WALLET_TOPUP_MIN_AMOUNT) {
    return NextResponse.json(
      { error: `المبلغ المطلوب يجب أن يكون ${WALLET_TOPUP_MIN_AMOUNT} ج.م أو أكثر` },
      { status: 400 }
    );
  }

  const receiptUrl = typeof body.receipt_blob_url === "string" ? body.receipt_blob_url.trim() : "";
  if (!receiptUrl || !isValidBlobUrl(receiptUrl)) {
    return NextResponse.json({ error: "رابط إيصال غير صالح — ارفع الصورة من النموذج" }, { status: 400 });
  }

  const id = randomUUID();
  try {
    await db.execute({
      sql: `INSERT INTO wallet_topup_requests (id, company_id, requested_by, requested_amount, receipt_blob_url, status)
            VALUES (?, ?, ?, ?, ?, 'pending')`,
      args: [id, companyId, session.user.id, amt, receiptUrl],
    });
    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error("topup-requests POST:", e);
    return NextResponse.json({ error: "فشل في إنشاء الطلب" }, { status: 500 });
  }
}
