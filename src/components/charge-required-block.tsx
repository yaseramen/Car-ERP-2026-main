"use client";

import { signOut } from "next-auth/react";
import { WALLET_CHARGE_MESSAGE, WALLET_CHARGE_PHONE_ENTRIES } from "@/lib/wallet-charge-contact";

export function ChargeRequiredBlock() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl">⚠️</div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          رصيد المحفظة صفر
        </h1>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
          البرنامج متوقف حتى يتم الشحن. لا يمكن عرض البيانات أو تنفيذ أي عمليات.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          {WALLET_CHARGE_MESSAGE}
        </p>
        <p className="text-lg font-medium text-emerald-600 dark:text-emerald-400 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          {WALLET_CHARGE_PHONE_ENTRIES.map((e, i) => (
            <span key={e.display}>
              {i > 0 ? <span className="text-gray-400 dark:text-gray-500 mx-1">·</span> : null}
              <a href={e.tel} className="hover:underline">
                {e.display}
              </a>
            </span>
          ))}
        </p>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-6 px-6 py-3 bg-gray-700 hover:bg-gray-800 text-white font-medium rounded-lg transition-colors"
        >
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
