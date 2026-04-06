import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "@/lib/db/client";
import { normalizeBusinessType } from "@/lib/business-types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, phone, company_name, business_type, device_fingerprint } = body;

    if (!email || !password || !name || !company_name) {
      return NextResponse.json(
        { error: "البريد، كلمة المرور، الاسم، واسم الشركة مطلوبة" },
        { status: 400 }
      );
    }

    const bt = normalizeBusinessType(business_type);

    if (String(password).length < 6) {
      return NextResponse.json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }, { status: 400 });
    }

    const emailNorm = String(email).toLowerCase().trim();
    const existingUser = await db.execute({
      sql: "SELECT id FROM users WHERE email = ?",
      args: [emailNorm],
    });
    if (existingUser.rows.length > 0) {
      return NextResponse.json({ error: "البريد الإلكتروني مستخدم مسبقاً" }, { status: 400 });
    }

    let skipWelcomeGift = false;
    try {
      const excludedResult = await db.execute({
        sql: "SELECT 1 FROM welcome_gift_excluded_emails WHERE email = ?",
        args: [emailNorm],
      });
      if (excludedResult.rows.length > 0) skipWelcomeGift = true;
    } catch {}
    if (!skipWelcomeGift && typeof device_fingerprint === "string" && device_fingerprint.trim()) {
      try {
        const fpResult = await db.execute({
          sql: "SELECT 1 FROM device_fingerprints WHERE fingerprint = ?",
          args: [device_fingerprint.trim()],
        });
        if (fpResult.rows.length > 0) skipWelcomeGift = true;
      } catch {}
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const companyId = randomUUID();
    const userId = randomUUID();

    const marketplaceEnabled = bt === "supplier" ? 0 : 1;
    await db.execute({
      sql: `INSERT INTO companies (id, name, phone, business_type, marketplace_enabled, ads_globally_disabled, is_active)
            VALUES (?, ?, ?, ?, ?, 0, 1)`,
      args: [
        companyId,
        String(company_name).trim(),
        phone ? String(phone) : null,
        bt,
        marketplaceEnabled,
      ],
    });

    await db.execute({
      sql: `INSERT INTO users (id, company_id, email, password_hash, name, phone, role, is_active)
            VALUES (?, ?, ?, ?, ?, ?, 'tenant_owner', 1)`,
      args: [userId, companyId, emailNorm, passwordHash, String(name).trim(), phone ? String(phone) : null],
    });

    const WELCOME_GIFT = skipWelcomeGift ? 0 : 50;
    const walletId = randomUUID();
    await db.execute({
      sql: `INSERT INTO company_wallets (id, company_id, balance, currency)
            VALUES (?, ?, ?, 'EGP')`,
      args: [walletId, companyId, WELCOME_GIFT],
    });
    if (WELCOME_GIFT > 0) {
      await db.execute({
        sql: `INSERT INTO wallet_transactions (id, wallet_id, amount, type, description, performed_by)
              VALUES (?, ?, ?, 'credit', ?, ?)`,
        args: [randomUUID(), walletId, WELCOME_GIFT, `هدية اشتراك - ${WELCOME_GIFT} ج.م`, userId],
      });
      if (typeof device_fingerprint === "string" && device_fingerprint.trim()) {
        try {
          await db.execute({
            sql: "INSERT OR IGNORE INTO device_fingerprints (fingerprint) VALUES (?)",
            args: [device_fingerprint.trim()],
          });
        } catch {}
      }
    }

    return NextResponse.json({
      ok: true,
      message: "تم إنشاء الحساب بنجاح. يمكنك تسجيل الدخول الآن.",
    });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "حدث خطأ أثناء التسجيل" }, { status: 500 });
  }
}
