import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "كيف يعمل EFCT | إدارة مراكز الصيانة وقطع الغيار",
  description:
    "شرح مفصل لكيفية عمل EFCT لإدارة مراكز خدمة السيارات ومحلات قطع الغيار. خطوات التسجيل، إدارة المخزون، الورشة، الفواتير، والتقارير.",
  keywords: [
    "كيف يعمل برنامج مراكز الصيانة",
    "استخدام برنامج قطع الغيار",
    "شرح برنامج إدارة الورشة",
    "تعليم برنامج محلات قطع غيار",
  ],
};

const STEPS = [
  {
    title: "التسجيل وإنشاء حساب الشركة",
    desc: "سجّل شركتك عبر صفحة تسجيل شركة جديدة. أدخل اسم المركز أو المحل، رقم الهاتف، والعنوان. بعد التسجيل ستتمكن من الدخول مباشرة إلى لوحة التحكم.",
  },
  {
    title: "إعداد المخزون",
    desc: "أضف أصناف قطع الغيار من قسم المخزن. حدد الاسم، الكمية، السعر، الحد الأدنى للمخزون، والتصنيف. يمكنك استخدام الباركود لقراءة الأصناف بسرعة عند البيع.",
  },
  {
    title: "إعداد العملاء والموردين",
    desc: "أضف بيانات العملاء في قسم العملاء، والموردين في قسم الموردون. هذا يساعد في ربط الفواتير وسجل التعاملات بسهولة.",
  },
  {
    title: "الورشة (للمراكز المتكاملة)",
    desc: "استلم سيارات العملاء من قسم الورشة. أنشئ أمر إصلاح، حدد مرحلة الفحص أو الصيانة، أضف قطع الغيار والخدمات، ثم انشئ الفاتورة عند الانتهاء.",
  },
  {
    title: "الكاشير والفواتير",
    desc: "من الكاشير يمكنك إنشاء فواتير بيع سريعة. أو من قسم الفواتير عرض فواتير الشراء والصيانة. تدعم الفواتير الخصم، الضريبة، وطرق دفع متعددة.",
  },
  {
    title: "التقارير والمتابعة",
    desc: "راجع لوحة التحكم للتلخيص اليومي. من قسم التقارير تصدير تقارير المبيعات، الأرباح، حركة المخزون، والورشة. استخدم الخزائن لفصل مبيعات المحل عن إيرادات الورشة.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white" dir="rtl">
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
          كيف يعمل برنامج EFCT لإدارة مراكز الصيانة وقطع الغيار؟
        </h1>
        <p className="text-gray-600 mb-12">
          EFCT مصمم ليكون سهل الاستخدام. اتبع الخطوات التالية للبدء في إدارة مركزك أو محلّك.
        </p>

        <div className="space-y-10">
          {STEPS.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
                {i + 1}
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h2>
                <p className="text-gray-600 leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 p-6 bg-emerald-50 rounded-xl text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">جاهز للبدء؟</h2>
          <p className="text-gray-600 mb-4">سجّل شركتك الآن وابدأ إدارة مركزك أو محلّك اليوم.</p>
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
        <Link href="/faq" className="text-emerald-600 hover:text-emerald-700">
          الأسئلة الشائعة
        </Link>
        {" · "}
        <Link href="/terms" className="text-emerald-600 hover:text-emerald-700">
          سياسة الاستخدام
        </Link>
      </footer>
    </div>
  );
}
