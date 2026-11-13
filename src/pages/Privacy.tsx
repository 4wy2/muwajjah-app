import { GA_ID, CONTACT_EMAIL } from "../lib/config";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

// Privacy policy laid out like a standard policy page: effective date,
// contents, numbered sections. Every statement matches what the site really
// does (Google sign-in only, own-rows-only access, local-only preferences,
// aggregate counts, payment handled by the store); keep it true when
// features change.
const UPDATED = "13 نوفمبر 2026";

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "scope",
    title: "نطاق السياسة",
    body: (
      <p>
        تنطبق هذه السياسة على موقع مُوجّه وكل خدماته. باستخدامك للموقع فأنت توافق على ما ورد فيها.
      </p>
    ),
  },
  {
    id: "collect",
    title: "البيانات التي نجمعها",
    body: (
      <>
        <p>نجمع أقل قدر من البيانات نحتاجه لتقديم الخدمة:</p>
        <ul>
          <li>
            <strong>بيانات الحساب:</strong> اسمك وبريدك الإلكتروني من Google عند تسجيل الدخول. لا نطّلع على كلمة
            مرورك.
          </li>
          <li>
            <strong>ما تحفظه بنفسك:</strong> الجامعات والتخصصات المفضلة ونتائج الموزونة.
          </li>
          <li>
            <strong>إحصاءات الاستخدام:</strong> أعداد مجمّعة عن الزيارات لا تكشف هويتك.
          </li>
        </ul>
        <p>تصفح معلومات الجامعات متاح للجميع بدون حساب، ولا يتطلب أي بيانات شخصية.</p>
      </>
    ),
  },
  {
    id: "use",
    title: "كيف نستخدم بياناتك",
    body: (
      <ul>
        <li>تقديم خدمات الموقع، مثل حفظ مفضلتك ونتائجك وإتاحتها من أي جهاز.</li>
        <li>تفعيل مزايا حسابك عند ترقيته.</li>
        <li>تحسين الموقع وتطوير محتواه.</li>
      </ul>
    ),
  },
  {
    id: "payments",
    title: "المدفوعات",
    body: (
      <p>
        تتم عمليات الشراء عبر متجر إلكتروني ومزود دفع معتمد. لا نستلم بيانات بطاقتك ولا نحفظها، ونستخدم بريدك
        الإلكتروني فقط لربط الترقية بحسابك.
      </p>
    ),
  },
  {
    id: "share",
    title: "مشاركة البيانات",
    body: (
      <p>
        لا نبيع بياناتك ولا نشاركها مع أي جهة لأغراض تسويقية. نعتمد على مزودي خدمات موثوقين لتشغيل الموقع، مثل
        الاستضافة وتسجيل الدخول وحفظ البيانات، ويقتصر دورهم على تقديم هذه الخدمات. ولا نفصح عن بياناتك إلا إذا
        طلبتها جهة رسمية مختصة وفق الأنظمة.
      </p>
    ),
  },
  {
    id: "protect",
    title: "حماية البيانات",
    body: (
      <p>
        نحفظ بياناتك لدى مزودين موثوقين، ونطبّق صلاحيات تمنع أي حساب من الوصول لبيانات غيره. ما تحفظه في حسابك لا
        يطّلع عليه أحد غيرك.
      </p>
    ),
  },
  {
    id: "retention",
    title: "الاحتفاظ بالبيانات",
    body: (
      <p>
        نحتفظ ببيانات حسابك ما دام حسابك قائمًا. وما تحذفه من مفضلتك أو نتائجك يُحذف من حسابك مباشرة.
      </p>
    ),
  },
  {
    id: "cookies",
    title: "ملفات تعريف الارتباط والتخزين المحلي",
    body: (
      <p>
        يحفظ متصفحك بعض الإعدادات على جهازك فقط، مثل المظهر وآخر الجامعات التي فتحتها، ولا تُرسل إلينا.
        {GA_ID &&
          " ونستخدم Google Analytics لإحصاءات الزيارات، وقد يستخدم ملفات تعريف الارتباط، ويمكنك إيقافه من إعدادات متصفحك."}
      </p>
    ),
  },
  {
    id: "rights",
    title: "حقوقك",
    body: (
      <ul>
        <li>تصفح الموقع دون إنشاء حساب.</li>
        <li>حذف أي عنصر حفظته في حسابك في أي وقت.</li>
        <li>طلب حذف حسابك وبياناتك كاملة.</li>
      </ul>
    ),
  },
  {
    id: "changes",
    title: "التعديلات على هذه السياسة",
    body: <p>قد نحدّث هذه السياسة عند الحاجة، ونوضح تاريخ آخر تحديث أعلى الصفحة.</p>,
  },
];

export default function Privacy() {
  useEffect(() => {
    document.title = "سياسة الخصوصية | مُوجّه";
    return () => {
      document.title = "مُوجّه | دليلك للجامعة";
    };
  }, []);
  const sections = CONTACT_EMAIL
    ? [
        ...SECTIONS,
        {
          id: "contact",
          title: "تواصل معنا",
          body: (
            <p>
              لأي استفسار عن الخصوصية أو لطلب حذف حسابك، راسلنا على{" "}
              <a href={"mailto:" + CONTACT_EMAIL} dir="ltr">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          ),
        },
      ]
    : SECTIONS;
  return (
    <article className="profile prose-page policy">
      <header className="policy-head">
        <h1>سياسة الخصوصية</h1>
        <p className="muted">آخر تحديث: {UPDATED}</p>
        <p className="policy-intro">
          نحترم خصوصيتك في مُوجّه. توضّح هذه السياسة البيانات التي نجمعها، وكيف نستخدمها ونحميها، وحقوقك تجاهها.
        </p>
      </header>

      <div className="policy-layout">
        <nav className="policy-toc" aria-label="محتويات السياسة">
          <h2>المحتويات</h2>
          <ol>
            {sections.map((s) => (
              <li key={s.id}>
                <a href={"#" + s.id}>{s.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="policy-body">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="policy-section">
              <h2>
                <span className="policy-num">{i + 1}.</span> {s.title}
              </h2>
              {s.body}
            </section>
          ))}
          <p className="policy-back">
            <Link to="/">العودة لدليل الجامعات</Link>
          </p>
        </div>
      </div>
    </article>
  );
}
