import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { TeamContent } from "./team-content";

export default async function TeamPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner"].includes(session.user.role)) {
    redirect("/login");
  }

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">إدارة المستخدمين</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          إضافة موظفين وتحديد صلاحياتهم لكل شاشة (قراءة، إضافة، تعديل، حذف)
        </p>
      </div>

      <TeamContent
        canDeleteEmployee={session.user.role === "tenant_owner" || session.user.role === "super_admin"}
      />
    </div>
  );
}
