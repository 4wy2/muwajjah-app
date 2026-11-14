import { CONTACT_EMAIL, ENTITY_NAME, RESPONSE_DAYS } from "../lib/config";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

// Short, reassuring privacy policy that still covers the SDAIA guide's core
// points (what and why, sharing, storage location and protection, retention,
// rights, contact and complaints) without naming providers. Every line must
// stay true: Google sign-in only, own-rows-only access, storage with a cloud
// provider outside the Kingdom, payment by the store, aggregate analytics.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="profile-block">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

const Mail = () => (
  <a href={"mailto:" + CONTACT_EMAIL} dir="ltr">
    {CONTACT_EMAIL}
  </a>
);

export default function Privacy() {
  useEffect(() => {
    document.title = "سياسة الخصوصية | مُوجّه";
    return () => {
      document.title = "مُوجّه | دليلك للجامعة";
    };
  }, []);
  return (
    <article className="profile prose-page">
      <h1>سياسة الخصوصية</h1>
      <p>
        خصوصيتك تهمنا في {ENTITY_NAME}. نجمع أقل ما نحتاجه لخدمتك، وبياناتك تبقى لك.
      </p>

      <Section title="ما نجمعه ولماذا">
        <ul>
          <li>تصفح الموقع متاح للجميع بدون حساب، ولا يحتاج أي بيانات شخصية.</li>
          <li>عند تسجيل الدخول نستخدم اسمك وبريدك فقط، لنحفظ لك مفضلتك ونتائجك وتصل لها من أي جهاز.</li>
          <li>عند ترقية حسابك نستخدم بريدك لتفعيل المزايا، ولا نستلم بيانات بطاقتك.</li>
          <li>نعرف أعداد الزيارات بشكل عام عبر ملفات تعريف الارتباط، لنطوّر الموقع.</li>
        </ul>
      </Section>

      <Section title="بياناتك في أمان">
        <ul>
          <li>لا نبيع بياناتك ولا نشاركها لأغراض تسويقية.</li>
          <li>
            نحفظها لدى مزودي خدمات موثوقين يقتصر دورهم على تشغيل الموقع، ونحميها بالتشفير وصلاحيات تمنع
            أي أحد من الوصول لبيانات غيره.
          </li>
          <li>ما تحفظه في حسابك خاص فيك، ولا يطّلع عليه أحد غيرك.</li>
        </ul>
      </Section>

      <Section title="حقوقك">
        <ul>
          <li>تقدر تحذف أي شي حفظته من حسابك متى ما تبي.</li>
          <li>تقدر تطلب نسخة من بياناتك أو تصحيحها أو حذف حسابك كامل، بدون أي رسوم.</li>
          <li>نتلف بياناتك ونرد على طلبك خلال {RESPONSE_DAYS} يومًا.</li>
        </ul>
      </Section>

      {CONTACT_EMAIL && (
        <Section title="تواصل معنا">
          <p>
            لأي طلب أو استفسار عن بياناتك راسلنا على <Mail />.
          </p>
        </Section>
      )}

      <p className="muted">قد نحدّث هذه السياسة عند الحاجة.</p>
      <p>
        <Link to="/">العودة لدليل الجامعات</Link>
      </p>
    </article>
  );
}
