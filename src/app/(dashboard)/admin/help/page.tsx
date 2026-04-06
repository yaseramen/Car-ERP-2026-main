import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import helpRaw from "@/content/help-guide.json";

type GuideLink = { label: string; href: string };
type GuideSection = {
  id: string;
  title: string;
  paragraphs: string[];
  links?: GuideLink[];
};
type ChangelogEntry = { date: string; title: string; items: string[] };
type HelpGuideData = {
  version: string;
  lastUpdated: string;
  intro: string;
  guideSections: GuideSection[];
  changelog: ChangelogEntry[];
};

const help = helpRaw as HelpGuideData;

export default async function HelpPage() {
  const session = await auth();
  if (!session?.user || !["super_admin", "tenant_owner", "employee"].includes(session.user.role ?? "")) {
    redirect("/login");
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">الدليل وما الجديد</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          إصدار الدليل: <span className="font-mono text-gray-700 dark:text-gray-300">{help.version}</span>
          {" — "}
          آخر تحديث للمحتوى:{" "}
          <time dateTime={help.lastUpdated} className="font-medium text-gray-700 dark:text-gray-300">
            {help.lastUpdated}
          </time>
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">{help.intro}</p>
        <p className="text-sm text-gray-600 dark:text-gray-300 mt-2 leading-relaxed">
          إن فعّلت <strong>إشعارات المتصفح</strong> من الشريط الجانبي، قد تصلك تنبيهات عند ظهور ميزات جديدة (حسب ما يضيفه فريق التطوير في النظام) — بالإضافة إلى تنبيهات المخزن والفواتير كما سبق.
        </p>
        <div className="mt-5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 p-4">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">هل واجهت مشكلة أو لديك اقتراح؟</p>
          <p className="text-sm text-emerald-800/90 dark:text-emerald-300/90 mt-1 leading-relaxed">
            من القائمة الجانبية افتح <strong>ملاحظات للمطور</strong> أو استخدم الرابط أدناه — يصل طلبك إلى فريق التطوير مع اسم حسابك وشركتك.
          </p>
          <Link
            href="/admin/feedback"
            className="inline-block mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            فتح صفحة الملاحظات والإبلاغات ←
          </Link>
        </div>
      </div>

      <section className="mb-10" aria-labelledby="guide-heading">
        <h2 id="guide-heading" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          كيفية الاستخدام
        </h2>
        <div className="space-y-4">
          {help.guideSections.map((sec) => (
            <article
              key={sec.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-5 shadow-sm"
            >
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{sec.title}</h3>
              {sec.paragraphs.map((p, i) => (
                <p key={i} className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2 last:mb-0">
                  {p}
                </p>
              ))}
              {sec.links && sec.links.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {sec.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        {l.label} →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="changelog-heading">
        <h2 id="changelog-heading" className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
          ما الجديد (سجل التحديثات)
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          يُحدَّث هذا القسم عند إضافة ميزات أو تعديلات ملحوظة — راجع النشر الأخير للتطبيق.
        </p>
        <ol className="relative border-r-2 border-emerald-200 dark:border-emerald-800 pr-6 space-y-6">
          {help.changelog.map((entry, idx) => (
            <li key={`${entry.date}-${idx}`} className="relative">
              <span className="absolute -right-[9px] top-1.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-gray-950" />
              <time
                dateTime={entry.date}
                className="text-xs font-mono text-gray-500 dark:text-gray-400 block mb-1"
              >
                {entry.date}
              </time>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{entry.title}</h3>
              <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 space-y-1">
                {entry.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-10 text-xs text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-gray-700 pt-6">
        للمطورين: يُحرَّر محتوى هذه الصفحة من الملف{" "}
        <code className="font-mono text-gray-600 dark:text-gray-400">src/content/help-guide.json</code> عند كل إصدار.
      </p>
    </div>
  );
}
