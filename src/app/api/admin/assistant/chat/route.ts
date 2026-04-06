import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db/client";
import { getCompanyId, isPlatformOwnerCompany } from "@/lib/company";
import { canAccess } from "@/lib/permissions";
import { getDistributionContext } from "@/lib/distribution";
import { randomUUID } from "crypto";
import {
  answerCompanyAssistant,
  answerObdGlobalFromDb,
  extractObdCodeFromMessage,
  type AssistantMode,
} from "@/lib/assistant-answer";
import { ASSISTANT_COMPANY_COST_EGP, ASSISTANT_OBD_GLOBAL_COST_EGP } from "@/lib/assistant-pricing";
import { walletInsufficientError } from "@/lib/wallet-charge-contact";

const ALLOWED_ROLES = ["super_admin", "tenant_owner", "employee"] as const;
const MAX_MESSAGE = 4000;

async function ensureWallet(companyId: string) {
  let walletResult = await db.execute({
    sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
    args: [companyId],
  });
  if (walletResult.rows.length === 0) {
    await db.execute({
      sql: "INSERT INTO company_wallets (id, company_id, balance, currency) VALUES (?, ?, 0, 'EGP')",
      args: [randomUUID(), companyId],
    });
    walletResult = await db.execute({
      sql: "SELECT id, balance FROM company_wallets WHERE company_id = ?",
      args: [companyId],
    });
  }
  const row = walletResult.rows[0];
  if (!row) return undefined;
  return { id: String(row.id ?? ""), balance: Number(row.balance ?? 0) };
}

export async function POST(request: Request) {
  const session = await auth();
  const companyId = getCompanyId(session);
  if (!session?.user || !companyId || !ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  let body: { message?: string; mode?: AssistantMode; confirm_charge?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const mode: AssistantMode = body.mode === "obd_global" ? "obd_global" : "company";
  const confirmCharge = body.confirm_charge === true;

  if (!message) {
    return NextResponse.json({ error: "اكتب رسالة للمساعد" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json({ error: `الرسالة طويلة جداً (الحد ${MAX_MESSAGE} حرفاً)` }, { status: 400 });
  }

  const role = session.user.role;
  const userId = session.user.id;

  const perm = async (module: string) => {
    return canAccess(userId, role, companyId, module, "read");
  };

  const skipWallet = isPlatformOwnerCompany(companyId);

  const cost = mode === "obd_global" ? ASSISTANT_OBD_GLOBAL_COST_EGP : ASSISTANT_COMPANY_COST_EGP;

  if (!confirmCharge) {
    return NextResponse.json({
      needs_confirmation: true,
      mode,
      cost_egp: cost,
      message_ar:
        mode === "obd_global"
          ? `هذا الاستعلام من قاعدة أكواد السيارات العامة داخل البرنامج. التكلفة: ${cost} ج.م من محفظة الشركة. اضغط تأكيداً لإتمام الخصم والإجابة.`
          : `استخدام المساعد على بيانات شركتك: ${cost} ج.م لكل رسالة. اضغط تأكيداً للمتابعة.`,
    });
  }

  if (!skipWallet) {
    const walletRow = await ensureWallet(companyId);
    if (!walletRow) {
      return NextResponse.json({ error: "تعذر الوصول للمحفظة" }, { status: 500 });
    }
    const bal = Number(walletRow.balance ?? 0);
    if (bal < cost) {
      return NextResponse.json({ error: walletInsufficientError(cost, bal) }, { status: 400 });
    }
  }

  const dist = role === "employee" ? await getDistributionContext(userId, companyId) : null;

  let reply: string;
  let charged = false;
  let obdCode: string | null = null;

  if (mode === "company") {
    const out = await answerCompanyAssistant(companyId, message, dist, perm);
    reply = out.reply;
  } else {
    if (!(await perm("obd"))) {
      return NextResponse.json(
        { error: "لا تملك صلاحية استخدام قاعدة أكواد OBD. يُطلب صلاحية عرض شاشة OBD." },
        { status: 403 }
      );
    }
    obdCode = extractObdCodeFromMessage(message);
    if (!obdCode) {
      reply =
        "اكتب كود العطل بوضوح (مثل P0300 أو C0123) لأجلبه من قاعدة الأكواد العامة داخل البرنامج.";
    } else {
      const obd = await answerObdGlobalFromDb(obdCode);
      reply = obd.reply;
    }
  }

  if (!skipWallet) {
    const walletRow = await ensureWallet(companyId);
    if (!walletRow) {
      return NextResponse.json({ error: "تعذر الوصول للمحفظة" }, { status: 500 });
    }
    const wtId = randomUUID();
    const txType = mode === "obd_global" ? "assistant_obd_global" : "assistant_company";
    const desc =
      mode === "obd_global"
        ? `مساعد OBD — كود ${obdCode ?? "?"}`
        : `مساعد الشركة — ${message.slice(0, 80)}${message.length > 80 ? "…" : ""}`;

    await db.batch(
      [
        {
          sql: "UPDATE company_wallets SET balance = balance - ?, updated_at = datetime('now') WHERE id = ?",
          args: [cost, walletRow.id],
        },
        {
          sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, reference_type, reference_id, performed_by)
              VALUES (?, ?, ?, ?, ?, 'assistant', ?, ?)`,
          args: [wtId, walletRow.id, cost, txType, desc, wtId, userId],
        },
      ],
      "write"
    );
    charged = true;
  }

  return NextResponse.json({
    reply,
    mode,
    cost_egp: skipWallet ? 0 : cost,
    charged: skipWallet ? false : charged,
    obd_code: obdCode,
  });
}
