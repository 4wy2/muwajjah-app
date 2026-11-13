import { CONTACT_EMAIL, ENTITY_NAME, LEGAL_ID, RESPONSE_DAYS } from "../lib/config";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

// Privacy policy following the SDAIA guide for privacy policies (Aug 2024):
// entity, contact, last update, data collected, how and why, use, disclosure,
// legal bases, storage and retention, rights, complaints. Kept short on
// purpose. Every line must stay true to what the site does: Google sign-in
// only, own-rows-only access, Supabase (Tokyo region) storage, Netlify
// hosting, Zid payments, Google Analytics.
const UPDATED = "13 نوفمبر 2026";

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
      <p className="muted">آخر تحديث: {UPDATED}</p>
      <p>
        {ENTITY_NAME} دليل مستقل للجامعات الحكومية في السعودية، يساعد الطلاب على معرفة القبول والتخصصات والسكن. خصوصيتك
        تهمنا، ونجمع أقل ما نحتاجه لخدمتك.
      </p>

      {(CONTACT_EMAIL || LEGAL_ID) && (
        <Section title="بيانات التواصل">
          <ul>
            {CONTACT_EMAIL && (
              <li>
                البريد الإلكتروني: <Mail />
              </li>
            )}
            {LEGAL_ID && <li>{LEGAL_ID}</li>}
          </ul>
        </Section>
      )}

      <Section title="البيانات التي نجمعها">
        <ul>
          <li>تصفح الموقع لا يحتاج حسابًا ولا أي بيانات شخصية.</li>
          <li>
            <strong>عند تسجيل الدخول (اختياري):</strong> اسمك وبريدك الإلكتروني من حساب Google.
          </li>
          <li>
            <strong>ما تحفظه بنفسك:</strong> الجامعات المفضلة، ودرجاتك ونتائج الموزونة التي تختار حفظها.
          </li>
          <li>
            <strong>عند ترقية الحساب:</strong> بريدك الإلكتروني وحالة الترقية. لا نستلم بيانات بطاقتك.
          </li>
          <li>
            <strong>إحصاءات الاستخدام:</strong> الصفحات التي تزورها ونوع جهازك، عبر ملفات تعريف الارتباط.
          </li>
        </ul>
      </Section>

      <Section title="كيف نجمعها ولماذا">
        <ul>
          <li>منك مباشرة عند تسجيل الدخول أو الحفظ، لتقديم خدمات حسابك.</li>
          <li>من Google عند تسجيل الدخول، ومن متجر الدفع عند الشراء، لتفعيل الترقية على حسابك.</li>
          <li>عبر Google Analytics، لمعرفة استخدام الموقع وتحسينه.</li>
        </ul>
      </Section>

      <Section title="من نشارك بياناتك معه">
        <p>لا نبيع بياناتك ولا نشاركها لأغراض التسويق. نستعين فقط بمزودي خدمات لتشغيل الموقع:</p>
        <ul>
          <li>Supabase: حفظ البيانات وتسجيل الدخول.</li>
          <li>Google: تسجيل الدخول وإحصاءات الزيارات.</li>
          <li>Netlify: استضافة الموقع.</li>
          <li>متجر زد: الدفع عند الترقية.</li>
        </ul>
        <p>ولا نفصح عنها لغيرهم إلا إذا طلبتها جهة مختصة وفق الأنظمة.</p>
      </Section>

      <Section title="المسوغات النظامية">
        <ul>
          <li>موافقتك عند تسجيل الدخول وحفظ بياناتك، ويمكنك العدول عنها في أي وقت.</li>
          <li>تنفيذ الالتزام التعاقدي عند ترقية حسابك.</li>
          <li>مصلحتنا المشروعة في تحسين الموقع، دون أن تتعارض مع حقوقك.</li>
        </ul>
      </Section>

      <Section title="التخزين والاحتفاظ">
        <p>
          نحفظ بياناتك بشكل آمن لدى مزود خدمات سحابية خارج المملكة، ونحمي الاتصال بالتشفير، ونطبّق صلاحيات تمنع أي حساب
          من الوصول لبيانات غيره. نحتفظ ببيانات حسابك ما دام قائمًا، وعند طلب حذفه نتلفها خلال {RESPONSE_DAYS} يومًا
          بطريقة لا يمكن استعادتها.
        </p>
      </Section>

      <Section title="حقوقك">
        <p>بموجب نظام حماية البيانات الشخصية، يحق لك:</p>
        <ul>
          <li>العلم بكيفية جمع بياناتك واستخدامها، وهو ما توضحه هذه السياسة.</li>
          <li>الوصول إلى بياناتك وطلب نسخة منها.</li>
          <li>طلب تصحيح بياناتك أو تحديثها.</li>
          <li>طلب إتلاف بياناتك، وحذف ما حفظته بنفسك من حسابك مباشرة.</li>
          <li>الرجوع عن موافقتك في أي وقت.</li>
        </ul>
        <p>
          لا توجد رسوم لممارسة هذه الحقوق، ونرد على طلبك خلال {RESPONSE_DAYS} يومًا
          {CONTACT_EMAIL ? (
            <>
              {" "}
              بمراسلتنا على <Mail />.
            </>
          ) : (
            "."
          )}
        </p>
      </Section>

      <Section title="الشكاوى">
        {CONTACT_EMAIL && (
          <p>
            إذا كانت لديك ملاحظة على طريقة تعاملنا مع بياناتك، راسلنا على <Mail />.
          </p>
        )}
        <p>
          {CONTACT_EMAIL ? "وإذا" : "إذا"} لم تكن راضيًا عن ردنا خلال {RESPONSE_DAYS} يومًا، يمكنك تقديم شكوى إلى الهيئة السعودية للبيانات والذكاء
          الاصطناعي (
          <a href="https://sdaia.gov.sa" target="_blank" rel="noopener noreferrer" dir="ltr">
            sdaia.gov.sa
          </a>
          ).
        </p>
      </Section>

      <p className="muted">قد نحدّث هذه السياسة عند الحاجة، ونوضح تاريخ آخر تحديث أعلى الصفحة.</p>
      <p>
        <Link to="/">العودة لدليل الجامعات</Link>
      </p>
    </article>
  );
}
