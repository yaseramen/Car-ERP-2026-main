import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { FeedbackContent } from "./feedback-content";

export default async function FeedbackPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">الملاحظات والإبلاغات</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6">
        أرسل ملاحظاتك، اقتراحاتك للتطوير، أو أبلغ عن خطأ معين. المطور سيراجعها ويتعامل معها.
      </p>
      <FeedbackContent />
    </div>
  );
}
