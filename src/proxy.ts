import { auth } from "@/auth";
import { NextResponse } from "next/server";

function isDashboardUserRole(role: string | undefined): boolean {
  return role === "super_admin" || role === "tenant_owner" || role === "employee";
}

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const path = nextUrl.pathname;
  const role = req.auth?.user?.role;

  // صفحات عامة - مسارات Next-Auth
  if (path.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  /** Cron داخلي — يحمى بـ CRON_SECRET في المسار نفسه */
  if (path.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  /** سوق EFCT — للمستخدمين المسجّلين في النظام فقط (B2B) */
  if (path.startsWith("/api/marketplace")) {
    if (!isLoggedIn || !isDashboardUserRole(role)) {
      return NextResponse.json({ error: "يجب تسجيل الدخول لعرض السوق" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Digital Asset Links (TWA / APK احترافي) — يجب أن يبقى عاماً
  if (path === "/.well-known/assetlinks.json") {
    return NextResponse.next();
  }

  // صفحات عامة (SEO، PWA، لا تتطلب تسجيل دخول)
  const publicPaths = [
    "/login",
    "/register",
    "/reset-password",
    "/how-it-works",
    "/faq",
    "/terms",
    "/manifest.json",
    "/manifest.webmanifest",
  ];
  if (publicPaths.includes(path)) {
    if (path === "/login" || path === "/register") {
      if (isLoggedIn && isDashboardUserRole(role)) {
        return NextResponse.redirect(new URL("/admin", nextUrl));
      }
    }
    return NextResponse.next();
  }

  // حماية /admin - Super Admin أو Tenant Owner أو Employee
  if (path.startsWith("/admin")) {
    if (!isLoggedIn) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    if (!isDashboardUserRole(role)) {
      return NextResponse.redirect(new URL("/", nextUrl));
    }
    return NextResponse.next();
  }

  // سوق EFCT — نفس صلاحية لوحة التحكم (شركة مسجّلة أو موظف)
  if (path === "/market" || path.startsWith("/market/")) {
    if (!isLoggedIn) {
      const loginUrl = new URL("/login", nextUrl);
      loginUrl.searchParams.set("callbackUrl", path);
      return NextResponse.redirect(loginUrl);
    }
    if (!isDashboardUserRole(role)) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    return NextResponse.next();
  }

  // الصفحة الرئيسية - صفحة ترحيبية عامة (لا تتطلب تسجيل دخول)
  if (path === "/") {
    if (isLoggedIn && isDashboardUserRole(role)) {
      return NextResponse.redirect(new URL("/admin", nextUrl));
    }
    return NextResponse.next();
  }

  // باقي المسارات المحمية
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  // استثناء "/" والملفات الثابتة - الصفحة الترحيبية تُحمّل مباشرة
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|webmanifest)$|$).+)",
  ],
};
