import { GA_ID, CONTACT_EMAIL } from "../lib/config";
import { useEffect } from "react";
import { Link } from "react-router-dom";

// Privacy policy in the usual form. Every statement matches what the site
// really does (Google sign-in only, own-rows-only access, local-only
// preferences, aggregate counts); keep it true when features change.
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
      <p className="muted">آخر تحديث: 13 نوفمبر 2026</p>
      <p>
        نحترم خصوصيتك في مُوجّه، ونجمع أقل قدر من البيانات نحتاجه لخدمتك. توضّح هذه الصفحة ما نجمعه،
        وكيف نستخدمه، وكيف نحميه.
      </p>

      <section className="profile-block">
        <h2>البيانات التي نجمعها</h2>
        <ul>
          <li>تصفح معلومات الجامعات متاح للجميع بدون حساب، ولا نطلب منك أي بيانات شخصية لذلك.</li>
          <li>عند تسجيل الدخول بحساب Google نحصل على اسمك وبريدك الإلكتروني فقط، ولا نطّلع على كلمة مرورك.</li>
          <li>ما تختار حفظه في حسابك، مثل الجامعات المفضلة ونتائج الموزونة.</li>
          <li>إحصاءات عامة ومجمّعة عن الزيارات لا تكشف هويتك.</li>
        </ul>
      </section>

      <section className="profile-block">
        <h2>كيف نستخدم بياناتك</h2>
        <ul>
          <li>لتقديم خدمات الموقع لك، مثل حفظ مفضلتك ونتائجك وإتاحتها من أي جهاز.</li>
          <li>لتفعيل مزايا حسابك عند ترقيته.</li>
          <li>لتحسين الموقع وتطوير محتواه.</li>
        </ul>
      </section>

      <section className="profile-block">
        <h2>مشاركة البيانات</h2>
        <p>
          لا نبيع بياناتك ولا نشاركها مع أي جهة لأغراض تسويقية. نعتمد على مزودي خدمات موثوقين لتشغيل الموقع
          (الاستضافة وتسجيل الدخول وحفظ البيانات)، ويقتصر دورهم على تقديم هذه الخدمات. ولا نفصح عن بياناتك إلا
          إذا طلبتها جهة رسمية مختصة وفق الأنظمة.
        </p>
      </section>

      <section className="profile-block">
        <h2>حماية البيانات</h2>
        <p>
          نحفظ بياناتك لدى مزودين موثوقين، ونطبّق صلاحيات تمنع أي حساب من الوصول لبيانات غيره. ما تحفظه في
          حسابك لا يطّلع عليه أحد غيرك.
        </p>
      </section>

      <section className="profile-block">
        <h2>ملفات تعريف الارتباط والتخزين على جهازك</h2>
        <p>
          يحفظ متصفحك بعض الإعدادات على جهازك فقط، مثل المظهر وآخر الجامعات التي فتحتها.
          {GA_ID &&
            " ونستخدم Google Analytics لإحصاءات الزيارات، وقد يستخدم ملفات تعريف الارتباط، ويمكنك إيقافه من إعدادات متصفحك."}
        </p>
      </section>

      <section className="profile-block">
        <h2>حقوقك</h2>
        <ul>
          <li>يمكنك تصفح الموقع دون إنشاء حساب.</li>
          <li>يمكنك حذف أي عنصر حفظته في حسابك في أي وقت.</li>
          <li>يمكنك طلب حذف حسابك وبياناتك كاملة{CONTACT_EMAIL ? " بمراسلتنا." : "."}</li>
        </ul>
      </section>

      <section className="profile-block">
        <h2>التعديلات على هذه السياسة</h2>
        <p>قد نحدّث هذه السياسة عند الحاجة، ونوضح تاريخ آخر تحديث أعلى الصفحة.</p>
      </section>

      {CONTACT_EMAIL && (
        <section className="profile-block">
          <h2>تواصل معنا</h2>
          <p>
            لأي استفسار عن الخصوصية أو لطلب حذف حسابك، راسلنا على{" "}
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
