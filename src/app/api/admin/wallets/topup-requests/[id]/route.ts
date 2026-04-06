import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { randomUUID } from "crypto";
import { WALLET_TOPUP_MIN_AMOUNT } from "@/lib/wallet-topup-constants";
import { trimProcessedReceiptBlobsForCompany } from "@/lib/wallet-topup";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "معرف الطلب مطلوب" }, { status: 400 });
  }

  let body: { action?: string; approved_amount?: unknown; admin_comment?: unknown; reject_reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "جسم الطلب غير صالح" }, { status: 400 });
  }

  const action = body.action;
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "إجراء غير صالح" }, { status: 400 });
  }

  try {
    const reqRow = await db.execute({
      sql: "SELECT id, company_id, status FROM wallet_topup_requests WHERE id = ?",
      args: [id],
    });
    if (reqRow.rows.length === 0) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 });
    }
    const row = reqRow.rows[0];
    if (String(row.status) !== "pending") {
      return NextResponse.json({ error: "تمت معالجة هذا الطلب مسبقاً" }, { status: 400 });
    }
    const companyId = String(row.company_id);

    if (action === "reject") {
      const reason = typeof body.reject_reason === "string" ? body.reject_reason.trim() : "";
      if (!reason) {
        return NextResponse.json({ error: "سبب الرفض مطلوب" }, { status: 400 });
      }
      await db.execute({
        sql: `UPDATE wallet_topup_requests SET status = 'rejected', reject_reason = ?, processed_by = ?, processed_at = datetime('now')
              WHERE id = ?`,
        args: [reason, session.user.id, id],
      });
      await trimProcessedReceiptBlobsForCompany(companyId);
      return NextResponse.json({ success: true });
    }

    const approved = Number(body.approved_amount);
    if (!Number.isFinite(approved) || approved < WALLET_TOPUP_MIN_AMOUNT) {
      return NextResponse.json(
        { error: `المبلغ المعتمد يجب أن يكون ${WALLET_TOPUP_MIN_AMOUNT} ج.م أو أكثر` },
        { status: 400 }
      );
    }

    const adminComment =
      typeof body.admin_comment === "string" && body.admin_comment.trim() ? body.admin_comment.trim() : null;

    let walletResult = await db.execute({
      sql: "SELECT cw.id, cw.balance FROM company_wallets cw WHERE cw.company_id = ?",
      args: [companyId],
    });

    if (walletResult.rows.length === 0) {
      const walletId = randomUUID();
      await db.execute({
        sql: "INSERT INTO company_wallets (id, company_id, balance, currency) VALUES (?, ?, 0, 'EGP')",
        args: [walletId, companyId],
      });
      walletResult = await db.execute({
        sql: "SELECT cw.id, cw.balance FROM company_wallets cw WHERE cw.company_id = ?",
        args: [companyId],
      });
    }

    const wallet = walletResult.rows[0];
    const walletId = wallet.id as string;
    const currentBalance = Number(wallet.balance ?? 0);
    const newBalance = currentBalance + approved;

    const txId = randomUUID();
    const descParts = [`شحن محفظة (طلب إيصال ${id.slice(0, 8)}…)`];
    if (adminComment) descParts.push(adminComment);
    const description = descParts.join(" — ");

    await db.execute({
      sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
            VALUES (?, ?, ?, 'credit', ?, 'wallet_topup_request', ?, ?)`,
      args: [txId, walletId, approved, description, id, session.user.id],
    });

    await db.execute({
      sql: "UPDATE company_wallets SET balance = ?, updated_at = datetime('now') WHERE id = ?",
      args: [newBalance, walletId],
    });

    await db.execute({
      sql: `UPDATE wallet_topup_requests SET status = 'approved', approved_amount = ?, admin_comment = ?, wallet_transaction_id = ?,
            processed_by = ?, processed_at = datetime('now')
            WHERE id = ?`,
      args: [approved, adminComment, txId, session.user.id, id],
    });

    await trimProcessedReceiptBlobsForCompany(companyId);

    return NextResponse.json({ success: true, new_balance: newBalance, transaction_id: txId });
  } catch (e) {
    console.error("topup-requests PATCH:", e);
    return NextResponse.json({ error: "فشل في المعالجة" }, { status: 500 });
  }
}
