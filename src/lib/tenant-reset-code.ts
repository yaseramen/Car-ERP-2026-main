import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 10;

/** توليد كود لمرة واحدة (يُعرض للسوبر أدمن مرة واحدة فقط) */
export function generateTenantResetCodePlain(): string {
  let s = "";
  const buf = randomBytes(CODE_LEN);
  for (let i = 0; i < CODE_LEN; i++) {
    s += CODE_CHARS[buf[i]! % CODE_CHARS.length];
  }
  return s;
}

export async function hashTenantResetCode(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyTenantResetCode(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** صلاحية الكود بالساعات */
export const TENANT_RESET_CODE_TTL_HOURS = 48;

export function expiresAtIso(hoursFromNow: number): string {
  const d = new Date();
  d.setHours(d.getHours() + hoursFromNow);
  return d.toISOString();
}
