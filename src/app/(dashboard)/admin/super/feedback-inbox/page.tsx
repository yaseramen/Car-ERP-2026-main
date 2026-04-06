import { auth } from "@/auth";
import { redirect } from "next/navigation";
import FeedbackInboxClient from "./feedback-inbox-client";

export default async function SuperFeedbackInboxPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "super_admin") {
    redirect("/login");
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">صندوق ملاحظات المستخدمين</h1>
      <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
        كل ما يُرسل من «ملاحظات للمطور» يظهر هنا — ليس في صفحة الإرسال نفسها.
      </p>
      <FeedbackInboxClient />
    </div>
  );
}
