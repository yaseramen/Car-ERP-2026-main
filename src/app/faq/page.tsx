import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "الأسئلة الشائعة | EFCT لإدارة مراكز الصيانة وقطع الغيار",
  description:
    "إجابات على الأسئلة الشائعة حول EFCT: التسجيل، التكلفة، المميزات، دعم مراكز الصيانة ومحلات قطع الغيار، الفواتير، المخزون، والورشة.",
  keywords: [
    "أسئلة شائعة برنامج مراكز الصيانة",
    "استفسارات برنامج قطع الغيار",
    "شرح برنامج إدارة الورشة",
  ],
};

const FAQ_ITEMS = [
  {
    q: "ما هو EFCT؟",
    a: "EFCT منصة متكاملة لإدارة مراكز خدمة السيارات ومحلات بيع قطع الغيار. يتضمن إدارة المخزون، الفواتير، الورشة، الكاشير، العملاء، الموردين، والتقارير.",
  },
  {
    q: "هل البرنامج مناسب لمحل قطع غيار فقط؟",
    a: "نعم. يمكنك اختيار «محل قطع غيار فقط» عند التسجيل. في هذه الحالة ستظهر لديك وحدات المبيعات، المخزون، الفواتير، والعملاء دون وحدات الورشة.",
  },
  {
    q: "هل البرنامج مناسب لمركز صيانة فقط؟",
    a: "نعم. يمكنك اختيار «مركز خدمة فقط». ستظهر وحدات الورشة، الكاشير، الفواتير، والعملاء دون وحدات فواتير الشراء والموردين إن لم تكن بحاجة لها.",
  },
  {
    q: "كيف أضيف موظفين وأحدد صلاحياتهم؟",
    a: "من قسم المستخدمون (للأصحاب المالكين) يمكنك إضافة موظفين وتحديد صلاحياتهم لكل شاشة: قراءة، إضافة، تعديل، حذف. مثلاً يمكنك منح موظف صلاحية الوصول للورشة فقط.",
  },
  {
    q: "هل يمكن تصدير الفواتير لواتساب؟",
    a: "نعم. من صفحة الفاتورة يمكنك إرسال نص الفاتورة الكامل (بكل البنود) لواتساب، أو إنشاء ملف PDF ومشاركته مع العميل.",
  },
  {
    q: "هل البرنامج يدعم تنبيهات نقص المخزون؟",
    a: "نعم. عند تحديد حد أدنى للصنف في المخزن، تظهر تنبيهات في لوحة التحكم. يمكنك أيضاً تفعيل إشعارات المتصفح لتنبيهك عند نقص الأصناف.",
  },
  {
    q: "ما هو OBD في البرنامج؟",
    a: "OBD هو وحدة مساعدة لبحث أكواد الأعطال (DTC) وشرحها بالعربية. يمكنك إدخال كود العطل أو رفع تقرير تشخيص لتحليل الأعطال ومساعدة الفنيين.",
  },
  {
    q: "هل يمكن تثبيت البرنامج على الهاتف؟",
    a: "نعم. البرنامج يدعم PWA (تطبيق ويب تقدمي). يمكنك تثبيته على الهاتف أو الكمبيوتر من المتصفح للمتصفح كتطبيق سريع الوصول.",
  },
];

export default function FaqPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <header className="border-b border-gray-200 py-4 px-6">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <Link href="/" className="text-emerald-600 hover:text-emerald-700 font-medium">
            ← الرئيسية
          </Link>
          <Link
            href="/register"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
          >
            تسجيل شركة جديدة
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto py-12 px-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          الأسئلة الشائعة
        </h1>
        <p className="text-gray-600 mb-12">
          إجابات على أكثر الأسئلة شيوعاً حول EFCT لإدارة مراكز الصيانة ومحلات قطع الغيار.
        </p>

        <div className="space-y-6">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="bg-gray-50 rounded-xl p-6 border border-gray-100">
              <h2 className="font-bold text-gray-900 mb-3">{item.q}</h2>
              <p className="text-gray-600 leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 p-6 bg-emerald-50 rounded-xl text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">لم تجد إجابتك؟</h2>
          <p className="text-gray-600 mb-4">سجّل شركتك وجرّب البرنامج بنفسك.</p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl"
          >
            تسجيل شركة جديدة
          </Link>
        </div>
      </main>

      <footer className="py-8 px-6 border-t border-gray-200 text-center text-sm text-gray-500">
        <Link href="/" className="text-emerald-600 hover:text-emerald-700">
          الرئيسية
        </Link>
        {" · "}
        <Link href="/how-it-works" className="text-emerald-600 hover:text-emerald-700">
          كيف يعمل البرنامج
        </Link>
        {" · "}
        <Link href="/terms" className="text-emerald-600 hover:text-emerald-700">
          سياسة الاستخدام
        </Link>
      </footer>
    </div>
  );
}
