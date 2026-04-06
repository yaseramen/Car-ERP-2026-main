"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect, useMemo, useRef } from "react";
import { useNotifications } from "@/components/notifications/notifications-provider";

/** معرّف ثابت لكل بند — يُستخدم في تخزين الإخفاء المحلي */
const SIDEBAR_HIDDEN_KEY = "alameen-sidebar-hidden";

type NavItem = {
  navId: string;
  href: string;
  label: string;
  module?: string;
  superAdminOnly?: boolean;
  ownerOrAdmin?: boolean;
  salesOnly?: boolean;
  serviceOnly?: boolean;
  supplierOnly?: boolean;
};

const navItems: NavItem[] = [
  { navId: "home", href: "/admin", label: "الرئيسية", module: "dashboard" },
  { navId: "inventory", href: "/admin/inventory", label: "المخزن", module: "inventory" },
  { navId: "price-list", href: "/admin/inventory/price-list", label: "عرض أسعار", module: "inventory" },
  { navId: "marketplace-supplier", href: "/admin/marketplace", label: "السوق والإعلانات", module: "marketplace", supplierOnly: true },
  { navId: "workshop", href: "/admin/workshop", label: "الورشة", module: "workshop", serviceOnly: true },
  { navId: "obd", href: "/admin/obd", label: "OBD", module: "obd", serviceOnly: true },
  { navId: "cashier", href: "/admin/cashier", label: "الكاشير", module: "cashier", salesOnly: true },
  { navId: "purchases", href: "/admin/purchases", label: "فواتير الشراء", module: "purchases", salesOnly: true },
  { navId: "invoices", href: "/admin/invoices", label: "الفواتير", module: "invoices" },
  { navId: "customers", href: "/admin/customers", label: "العملاء", module: "customers" },
  { navId: "suppliers", href: "/admin/suppliers", label: "الموردون", module: "suppliers" },
  { navId: "reports", href: "/admin/reports", label: "التقارير", module: "reports" },
  { navId: "treasuries", href: "/admin/treasuries", label: "الخزائن", module: "treasuries" },
  { navId: "marketplace-super", href: "/admin/marketplace", label: "السوق (إدارة)", module: "marketplace", superAdminOnly: true },
  { navId: "wallets", href: "/admin/wallets", label: "المحافظ", module: "wallets", ownerOrAdmin: true },
  { navId: "password-reset-codes", href: "/admin/super/password-reset", label: "أكواد المالكين", module: "wallets", superAdminOnly: true },
  { navId: "super-feedback-inbox", href: "/admin/super/feedback-inbox", label: "صندوق ملاحظات المطور", module: "dashboard", superAdminOnly: true },
  { navId: "team", href: "/admin/team", label: "المستخدمون", ownerOrAdmin: true },
  { navId: "settings", href: "/admin/settings", label: "إعدادات الشركة", ownerOrAdmin: true },
  { navId: "help", href: "/admin/help", label: "الدليل وما الجديد", module: "dashboard" },
  { navId: "feedback", href: "/admin/feedback", label: "ملاحظات للمطور", module: "dashboard" },
  { navId: "account-password", href: "/admin/account/password", label: "تغيير كلمة المرور", ownerOrAdmin: true },
];

export function Sidebar({
  role = "super_admin",
  businessType,
  companyName: initialCompanyName,
  companyLogoUrl: initialLogoUrl,
  onNavigate,
  onClose,
}: {
  role?: string;
  businessType?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  const [perms, setPerms] = useState<Record<string, { read: boolean }> | null>(null);
  const [canNotify, setCanNotify] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(initialCompanyName ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(() =>
    initialLogoUrl?.trim() ? initialLogoUrl.trim() : null
  );
  const [hiddenNavIds, setHiddenNavIds] = useState<Set<string>>(new Set());
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const customizePanelRef = useRef<HTMLDivElement>(null);
  const notifications = useNotifications();

  useEffect(() => {
    setCanNotify(typeof window !== "undefined" && "Notification" in window);
  }, []);

  useEffect(() => {
    setCompanyName(initialCompanyName ?? null);
  }, [initialCompanyName]);

  useEffect(() => {
    setLogoUrl(initialLogoUrl?.trim() ? initialLogoUrl.trim() : null);
  }, [initialLogoUrl]);

  /** يحدّث الشعار بعد الحفظ ويتفادى بيانات RSC القديمة؛ للسوبر أدمن يعيد company-system */
  useEffect(() => {
    fetch("/api/admin/me/company-branding", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => {
        if (d.logo_url && String(d.logo_url).trim()) setLogoUrl(String(d.logo_url).trim());
        if (d.name && String(d.name).trim()) setCompanyName(String(d.name).trim());
      })
      .catch(() => {});
  }, [role]);

  useEffect(() => {
    const fetchName = () => {
      if (role !== "super_admin") {
        fetch("/api/admin/me/company-name")
          .then((r) => r.json())
          .then((d) => { if (d.name) setCompanyName(d.name); })
          .catch(() => {});
      }
    };
    fetchName();
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ name?: string; logo_url?: string | null }>)?.detail;
      if (d?.name) setCompanyName(d.name);
      if (d && "logo_url" in d) setLogoUrl(d.logo_url ?? null);
      if (!d?.name) fetchName();
    };
    window.addEventListener("alameen-company-updated", handler);
    return () => window.removeEventListener("alameen-company-updated", handler);
  }, [role]);

  useEffect(() => {
    if (role === "employee") {
      fetch("/api/admin/me/permissions")
        .then((r) => r.json())
        .then((d) => setPerms(d.permissions || {}))
        .catch(() => setPerms({}));
    } else {
      setPerms(null);
    }
  }, [role]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_HIDDEN_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as unknown;
        if (Array.isArray(arr)) {
          setHiddenNavIds(new Set(arr.filter((x): x is string => typeof x === "string")));
        }
      }
    } catch {
      setHiddenNavIds(new Set());
    }
  }, []);

  const allowedItems = useMemo(() => {
    return navItems.filter((item) => {
      if (item.superAdminOnly && role !== "super_admin") return false;
      if (item.ownerOrAdmin && role === "employee") return false;
      if (item.supplierOnly) {
        if (role === "super_admin") return false;
        if (businessType !== "supplier") return false;
      }
      if (role === "super_admin") return true;
      if (businessType === "sales_only" && item.serviceOnly) return false;
      if (businessType === "service_only" && item.salesOnly) return false;
      if (businessType === "supplier" && item.serviceOnly) return false;
      if (role === "employee" && item.module && perms) {
        return perms[item.module]?.read === true;
      }
      return true;
    });
  }, [role, businessType, perms]);

  /** الرئيسية تبقى ظاهرة دائماً حتى لا يُحبس المستخدم بدون تنقّل */
  const items = useMemo(
    () =>
      allowedItems.filter((item) => item.navId === "home" || !hiddenNavIds.has(item.navId)),
    [allowedItems, hiddenNavIds]
  );

  const customizableNavItems = useMemo(
    () => allowedItems.filter((item) => item.navId !== "home"),
    [allowedItems]
  );

  function persistHidden(next: Set<string>) {
    try {
      localStorage.setItem(SIDEBAR_HIDDEN_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }

  function toggleNavVisibility(navId: string, visible: boolean) {
    setHiddenNavIds((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(navId);
      else next.add(navId);
      persistHidden(next);
      return next;
    });
  }

  function showAllNavItems() {
    setHiddenNavIds(new Set());
    persistHidden(new Set());
  }

  const pathname = usePathname();

  useEffect(() => {
    setCustomizeOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!customizeOpen) return;
    function onPointerDown(e: PointerEvent) {
      const el = customizePanelRef.current;
      if (el && !el.contains(e.target as Node)) {
        setCustomizeOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [customizeOpen]);

  const handleNav = () => {
    onNavigate?.();
    onClose?.();
  };

  return (
    <aside className="flex h-full min-h-0 w-full max-h-full flex-col overflow-hidden bg-white dark:bg-gray-900 lg:min-h-screen">
      <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between gap-2 shrink-0 z-10 bg-white dark:bg-gray-900">
        <div className="min-w-0 flex-1 relative isolate overflow-hidden rounded-lg min-h-[4.5rem]">
          {logoUrl && (
            <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt=""
                className="h-full w-full object-cover object-center opacity-[0.22] dark:opacity-[0.28]"
                onError={() => setLogoUrl(null)}
              />
            </div>
          )}
          <div className="relative z-[1] min-w-0">
            {logoUrl ? (
              <div className="min-w-0">
                <h2 className="font-bold text-gray-900 dark:text-gray-100 truncate text-base leading-tight drop-shadow-[0_1px_0_rgba(255,255,255,0.85)] dark:drop-shadow-[0_1px_0_rgba(0,0,0,0.4)]">
                  {companyName || (role === "super_admin" ? "EFCT" : "الشركة")}
                </h2>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                  {role === "super_admin"
                    ? "لوحة Super Admin"
                    : role === "employee"
                      ? "لوحة الموظف"
                      : businessType === "supplier"
                        ? "لوحة المورّد"
                        : "لوحة المالك"}
                </p>
              </div>
            ) : (
              <>
                <h2 className="font-bold text-gray-900 dark:text-gray-100">
                  {companyName && role !== "super_admin" ? companyName : "EFCT"}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {role === "super_admin"
                    ? "لوحة Super Admin"
                    : role === "employee"
                      ? "لوحة الموظف"
                      : businessType === "supplier"
                        ? "لوحة المورّد"
                        : "لوحة المالك"}
                </p>
              </>
            )}
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="إغلاق القائمة"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* روابط التنقّل فقط — تمرير منفصل حتى لا تتداخل مع أسفل الشريط */}
      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-1">
        {items.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
          const navKey = `${item.navId}-${item.href}-${item.superAdminOnly ? "sa" : ""}-${item.supplierOnly ? "sup" : ""}`;
          return (
            <Link
              key={navKey}
              href={item.href}
              onClick={handleNav}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* ثابت أسفل الشريط: تخصيص → إشعارات → خروج (لا يختلط مع الروابط) */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_12px_rgba(0,0,0,0.25)] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        {customizableNavItems.length > 0 && (
          <div ref={customizePanelRef} className="px-4 pt-2 pb-1">
            <button
              type="button"
              onClick={() => setCustomizeOpen((o) => !o)}
              className="w-full text-right text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 py-1.5 flex items-center gap-1"
              aria-expanded={customizeOpen}
            >
              <span
                className={`text-[10px] opacity-70 transition-transform inline-block ${customizeOpen ? "rotate-90" : ""}`}
                aria-hidden
              >
                ▸
              </span>
              تخصيص القائمة
            </button>
            {customizeOpen && (
              <div className="mb-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2 space-y-1.5 shadow-lg">
                <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug px-0.5 mb-1">
                  أخفِ ما لا تحتاجه من البنود المتاحة لصلاحياتك فقط. يُحفظ على هذا الجهاز. اضغط خارج القائمة للإغلاق.
                </p>
                {customizableNavItems.map((item) => {
                  const visible = !hiddenNavIds.has(item.navId);
                  return (
                    <label
                      key={item.navId}
                      className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300 py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={(e) => toggleNavVisibility(item.navId, e.target.checked)}
                        className="rounded border-gray-300 dark:border-gray-600 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="truncate">{item.label}</span>
                    </label>
                  );
                })}
                {hiddenNavIds.size > 0 && (
                  <button
                    type="button"
                    onClick={showAllNavItems}
                    className="w-full mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                  >
                    إظهار كل البنود
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="p-4 pt-2 space-y-2">
          {notifications && canNotify && (
            <button
              type="button"
              onClick={() => notifications.requestPermission()}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm rounded-lg transition ${
                notifications.permission === "granted"
                  ? "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30"
                  : "text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20"
              }`}
              title={notifications.permission === "granted" ? "الإشعارات مفعّلة" : "تفعيل الإشعارات"}
            >
              <span>{notifications.permission === "granted" ? "🔔" : "🔕"}</span>
              <span>{notifications.permission === "granted" ? "الإشعارات مفعّلة" : "تفعيل الإشعارات"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition border border-transparent hover:border-red-200 dark:hover:border-red-900/40"
          >
            تسجيل الخروج
          </button>
        </div>
      </div>
    </aside>
  );
}
