/**
 * رسائل خطأ أوضح للمستخدم
 */
export function getErrorMessage(error: unknown, fallback = "حدث خطأ غير متوقع. حاول مرة أخرى."): string {
  if (error instanceof Error) {
    const msg = error.message?.toLowerCase() ?? "";
    if (msg.includes("network") || msg.includes("fetch") || msg.includes("failed to fetch"))
      return "تعذر الاتصال بالخادم. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.";
    if (msg.includes("timeout")) return "انتهت مهلة الاتصال. حاول مرة أخرى.";
    if (msg.includes("401") || msg.includes("unauthorized"))
      return "انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.";
    if (msg.includes("403") || msg.includes("forbidden"))
      return "ليس لديك صلاحية لتنفيذ هذه العملية.";
    if (msg.includes("404")) return "العنصر المطلوب غير موجود.";
    if (msg.includes("500") || msg.includes("internal"))
      return "حدث خطأ في الخادم. سنعمل على إصلاحه قريباً.";
    if (error.message) return error.message;
  }
  if (typeof error === "object" && error !== null && "error" in error && typeof (error as { error: unknown }).error === "string")
    return (error as { error: string }).error;
  return fallback;
}
