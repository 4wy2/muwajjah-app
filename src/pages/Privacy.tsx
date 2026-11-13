import { CONTACT_EMAIL } from "../lib/config";
import { useEffect } from "react";
import { Link } from "react-router-dom";

// Short privacy statement. Each line matches what the site really does
// (Google sign-in only, own-rows-only access, aggregate counts, payment by
// the store); keep it true when features change.
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
      <p>خصوصيتك تهمنا، ونجمع أقل ما نحتاجه لخدمتك.</p>
      <ul>
        <li>تقدر تتصفح كل معلومات الجامعات بدون حساب.</li>
        <li>لو سجّلت دخولك بحساب Google، نستخدم اسمك وبريدك لحفظ مفضلتك ونتائجك فقط، ولا نطّلع على كلمة مرورك.</li>
        <li>ما تحفظه في حسابك خاص فيك، وتقدر تحذفه متى ما تبي.</li>
        <li>عند الدفع، بيانات بطاقتك تبقى عند مزود الدفع ولا تصلنا.</li>
        <li>لا نبيع بياناتك ولا نشاركها لأغراض تسويقية.</li>
      </ul>
      {CONTACT_EMAIL && (
        <p style={{ marginTop: 14 }}>
          لأي استفسار أو لحذف حسابك، راسلنا على{" "}
          <a href={"mailto:" + CONTACT_EMAIL} dir="ltr">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      )}
      <p style={{ marginTop: 18 }}>
        <Link to="/">العودة لدليل الجامعات</Link>
      </p>
    </article>
  );
}
