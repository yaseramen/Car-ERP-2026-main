"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { DashboardHeader } from "./dashboard-header";
import { AssistantWidget } from "./assistant-widget";
import { ReleaseNotesBanner } from "./release-notes-banner";
import { OfflineStatusBar } from "@/components/offline/offline-status-bar";
import { MarketplaceExpiryBanner } from "@/components/dashboard/marketplace-expiry-banner";

export function AdminLayoutClient({
  children,
  role,
  businessType,
  companyName,
  companyLogoUrl,
}: {
  children: React.ReactNode;
  role: string;
  businessType: string | null;
  companyName: string | null;
  companyLogoUrl: string | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col" dir="rtl">
      <ReleaseNotesBanner />
      {role !== "super_admin" && <MarketplaceExpiryBanner />}
      <OfflineStatusBar />
      <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex flex-1 overflow-hidden relative">
        {/* Overlay على الهاتف والتابلت عند فتح القائمة */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* الشريط الجانبي: على الهاتف/تابلت يطوى ويظهر كـ overlay، على الشاشات الكبيرة ثابت */}
        <aside
          className={`
            fixed lg:relative inset-y-0 right-0 z-50 lg:z-auto
            w-72 lg:w-64 min-h-0 h-[100dvh] max-h-[100dvh] lg:h-full lg:max-h-full
            bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700
            flex min-h-0 flex-col overflow-hidden
            transform transition-transform duration-200 ease-out
            lg:transform-none
            ${sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
          `}
        >
          <Sidebar
            role={role}
            businessType={businessType}
            companyName={companyName}
            companyLogoUrl={companyLogoUrl}
            onNavigate={() => setSidebarOpen(false)}
            onClose={() => setSidebarOpen(false)}
          />
        </aside>

        <main className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 min-w-0">
          {children}
        </main>
      </div>
      <AssistantWidget />
    </div>
  );
}
