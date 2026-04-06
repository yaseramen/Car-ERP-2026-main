import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role ?? "")) {
    redirect("/admin");
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      <Link href="/admin" className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline mb-4 inline-block">
        ← الرئيسية
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">تغيير كلمة المرور</h1>
      <p className="text-gray-500 dark:text-gray-400 mt-2 text-sm mb-6">
        أدخل كلمة المرور الحالية ثم الجديدة. يسري على حسابك الحالي ({session.user.email}).
      </p>
      <ChangePasswordForm />
    </div>
  );
}
