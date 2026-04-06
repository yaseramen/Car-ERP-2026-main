import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db/client";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name: string;
    role: string;
    companyId?: string | null;
    companyName?: string | null;
    companyBusinessType?: string | null;
    companyMarketplaceEnabled?: boolean;
    companyAdsGloballyDisabled?: boolean;
  }

  interface Session {
    user: User;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: string;
    companyId?: string | null;
    companyName?: string | null;
    companyBusinessType?: string | null;
    companyMarketplaceEnabled?: boolean;
    companyAdsGloballyDisabled?: boolean;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "البريد الإلكتروني", type: "email" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const result = await db.execute({
          sql: `SELECT u.id, u.email, u.name, u.password_hash, u.role, u.company_id, u.is_active, u.is_blocked,
                c.business_type, c.name as company_name, c.is_active as company_is_active,
                COALESCE(c.marketplace_enabled, 1) as marketplace_enabled,
                COALESCE(c.ads_globally_disabled, 0) as ads_globally_disabled
                FROM users u
                LEFT JOIN companies c ON c.id = u.company_id
                WHERE u.email = ?`,
          args: [String(credentials.email).toLowerCase().trim()],
        });

        const user = result.rows[0];
        if (!user || user.is_active !== 1 || user.is_blocked === 1) return null;
        if (user.company_id && user.role !== "super_admin" && Number(user.company_is_active ?? 1) !== 1) return null;

        const valid = await bcrypt.compare(
          String(credentials.password),
          String(user.password_hash)
        );
        if (!valid) return null;

        return {
          id: String(user.id),
          email: String(user.email),
          name: String(user.name),
          role: String(user.role),
          companyId: user.company_id ? String(user.company_id) : null,
          companyName: user.company_name ? String(user.company_name) : null,
          companyBusinessType: user.business_type ? String(user.business_type) : null,
          companyMarketplaceEnabled: Number(user.marketplace_enabled ?? 1) === 1,
          companyAdsGloballyDisabled: Number(user.ads_globally_disabled ?? 0) === 1,
        };
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.companyId = user.companyId;
        token.companyName = (user as { companyName?: string }).companyName ?? null;
        token.companyBusinessType = (user as { companyBusinessType?: string }).companyBusinessType ?? null;
        token.companyMarketplaceEnabled = (user as { companyMarketplaceEnabled?: boolean }).companyMarketplaceEnabled ?? true;
        token.companyAdsGloballyDisabled = (user as { companyAdsGloballyDisabled?: boolean }).companyAdsGloballyDisabled ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.companyId = token.companyId ?? null;
        session.user.companyName = token.companyName ?? null;
        session.user.companyBusinessType = token.companyBusinessType ?? null;
        session.user.companyMarketplaceEnabled = token.companyMarketplaceEnabled !== false;
        session.user.companyAdsGloballyDisabled = token.companyAdsGloballyDisabled === true;
      }
      return session;
    },
    redirect({ url, baseUrl }) {
      if (!url.startsWith(baseUrl)) return baseUrl;
      return url;
    },
  },
});
