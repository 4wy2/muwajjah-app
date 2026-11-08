import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CONTACT_EMAIL } from "../lib/config";

// Plain-language statement of what the site actually stores. It describes the
// implemented behaviour only and makes no legal-compliance claim.
export default function Privacy() {
  useEffect(() => {
    document.title = "الخصوصية | مُوجّه";
    return () => {
      document.title = "مُوجّه | دليلك للجامعة";
    };
  }, []);
  return (
    <article className="profile prose-page">
      <h1>الخصوصية: ماذا يحفظ مُوجّه؟</h1>
      <p className="muted">
        بيان مبسّط يصف ما يفعله الموقع فعلًا. لا يُغني عن مراجعة قانونية.
      </p>

      <section className="profile-block">
        <h2>عند التصفح بدون حساب</h2>
        <ul>
          <li>تصفح الجامعات والحاسبة لا يحتاج حسابًا، ولا نطلب أي بيانات شخصية.</li>
          <li>
            نسجّل أعدادًا يومية مجمّعة فقط: كم مرة شوهدت كل جامعة، وعبارات البحث
            التي لم تُظهر نتائج. لا تحتوي هذه الأعداد اسمك أو بريدك، ولا تربط
            تصفحك بشخص.
          </li>
          <li>
            يحفظ متصفحك محليًا (على جهازك فقط) اختيارك للمظهر وقائمة المقارنة.
            الدرجات التي تكتبها في الحاسبة بدون حساب لا تُرسل ولا تُحفظ.
          </li>
        </ul>
      </section>

      <section className="profile-block">
        <h2>عند إنشاء حساب (اختياري)</h2>
        <ul>
          <li>نحفظ اسمك وبريدك. كلمة المرور يديرها مزود تسجيل الدخول ولا نستطيع رؤيتها.</li>
          <li>نحفظ المفضلة ونتائج الموزونة التي تختار حفظها، مع الدرجات التي أدخلتها لها.</li>
          <li>
            لا يرى مفضلتك ونتائجك إلا أنت؛ القاعدة نفسها تمنع أي حساب آخر من
            قراءتها. يرى مالك الموقع قائمة الحسابات المسجلة (الاسم والبريد وحالة
            الاشتراك) لإدارة الخدمة.
          </li>
          <li>تستطيع حذف أي عنصر من مفضلتك أو أي نتيجة محفوظة من حسابك.</li>
        </ul>
      </section>

      <section className="profile-block">
        <h2>الخدمات التي يعتمد عليها الموقع</h2>
        <p>
          تُخزّن البيانات وتسجيل الدخول لدى Supabase، ويُستضاف الموقع لدى مزود
          استضافة ملفات. قد تحتفظ هذه الخدمات بسجلات تقنية وفق سياساتها.
        </p>
      </section>

      {CONTACT_EMAIL && (
        <section className="profile-block">
          <h2>حذف الحساب أو الاستفسار</h2>
          <p>
            راسلنا على{" "}
            <a href={"mailto:" + CONTACT_EMAIL} dir="ltr">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </section>
      )}
      <p>
        <Link to="/">العودة لدليل الجامعات</Link>
      </p>
    </article>
  );
}
