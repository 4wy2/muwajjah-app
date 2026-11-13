import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CONTACT_EMAIL } from "../lib/config";
import { useOffer } from "../api/commerce";
import { date } from "../lib/utils";

// Terms of use describing how the site actually works. The upgrade section
// shows only while upgrades are on, and states what is already decided (one
// payment, no auto-renewal, until the season end the owner set). Refunds are
// not stated until the owner decides them.
export default function Terms() {
  const offer = useOffer().data;
  useEffect(() => {
    document.title = "شروط الاستخدام | مُوجّه";
    return () => {
      document.title = "مُوجّه | دليلك للجامعة";
    };
  }, []);
  return (
    <article className="profile prose-page">
      <h1>شروط الاستخدام</h1>

      <section className="profile-block">
        <h2>طبيعة الخدمة</h2>
        <ul>
          <li>مُوجّه دليل مستقل يجمع معلومات الجامعات الحكومية في السعودية لتسهيل الوصول لها.</li>
          <li>مُوجّه ليس جهة رسمية، ولا يتبع أي جامعة أو منصة «قبول».</li>
          <li>
            قد تتغير شروط القبول ومواعيده من الجامعة نفسها. قبل أي قرار أو تقديم،
            تحقق من موقع الجامعة أو منصة القبول الرسمية، ونرفق رابط المصدر عند توفره.
          </li>
          <li>نتائج الحاسبة والنسب السابقة، إن ظهرت، لا تعني ضمان القبول.</li>
        </ul>
      </section>

      <section className="profile-block">
        <h2>الحساب</h2>
        <ul>
          <li>تصفح المعلومات الأساسية متاح بدون حساب.</li>
          <li>الدخول بحساب Google، وأنت مسؤول عن حسابك وما يُحفظ فيه.</li>
          <li>يُمنع استخدام الموقع بطريقة تضر بالخدمة، مثل محاولة الوصول لبيانات غيرك أو إرسال طلبات آلية مكثفة.</li>
        </ul>
      </section>

      <section className="profile-block">
        <h2>المحتوى</h2>
        <p>
          نراجع المعلومات ونحدّثها، ونصحح الأخطاء أول ما نعرف عنها.
          {CONTACT_EMAIL && (
            <>
              {" "}إذا لاحظت معلومة غير دقيقة راسلنا على{" "}
              <a href={"mailto:" + CONTACT_EMAIL} dir="ltr">
                {CONTACT_EMAIL}
              </a>
              .
            </>
          )}
        </p>
      </section>

      {offer?.commercial_enabled && (
        <section className="profile-block">
          <h2>ترقية الحساب</h2>
          <ul>
            <li>
              الترقية دفعة وحدة{offer.price_text ? " بقيمة " + offer.price_text : ""}، وتبقى
              {offer.season_ends_at ? " لين " + date(offer.season_ends_at) : " للموسم كامل"}، بدون تجديد تلقائي.
            </li>
            <li>تنفتح المزايا على الحساب اللي بريده نفس البريد المستخدم في الدفع.</li>
            <li>المعلومات الأساسية عن الجامعات تبقى مجانية للجميع.</li>
          </ul>
        </section>
      )}

      <p>
        <Link to="/privacy">الخصوصية</Link> · <Link to="/">العودة لدليل الجامعات</Link>
      </p>
    </article>
  );
}
