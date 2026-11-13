import { GA_ID, CONTACT_EMAIL } from "../lib/config";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, UserRound, Smartphone, BarChart3, ShieldCheck, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Short, reassuring privacy page. Every line describes what the site really
// does (Google sign-in only, own-rows-only access, local-only preferences,
// aggregate counts); keep it true when features change.
const POINTS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: Eye,
    title: "تصفح بدون حساب",
    text: "كل معلومات الجامعات متاحة بدون تسجيل، وبدون أي بيانات شخصية.",
  },
  {
    icon: UserRound,
    title: "لو سجّلت دخولك",
    text: "الدخول بحساب Google فقط، ولا نستلم كلمة مرورك. نستخدم اسمك وبريدك لحفظ مفضلتك ونتائجك، ولا يطّلع عليها أحد غيرك.",
  },
  {
    icon: Smartphone,
    title: "على جهازك",
    text: "بعض الإعدادات، مثل المظهر وآخر الجامعات اللي فتحتها، تنحفظ في متصفحك فقط.",
  },
  {
    icon: BarChart3,
    title: "إحصاءات عامة",
    text: "نعرف أعداد الزيارات بشكل مجمّع لنطوّر الموقع، بدون اسمك أو بريدك أو درجاتك.",
  },
  {
    icon: ShieldCheck,
    title: "بياناتك محمية",
    text: "محفوظة لدى مزودين موثوقين، وصلاحيات القاعدة تمنع أي حساب من الوصول لبيانات غيره. ولا نبيع بياناتك ولا نشاركها لأغراض تسويقية.",
  },
  {
    icon: Trash2,
    title: "أنت المتحكم",
    text: "تقدر تحذف أي جامعة أو نتيجة حفظتها متى ما تبي من حسابك.",
  },
];

export default function Privacy() {
  useEffect(() => {
    document.title = "الخصوصية | مُوجّه";
    return () => {
      document.title = "مُوجّه | دليلك للجامعة";
    };
  }, []);
  return (
    <article className="profile prose-page privacy-page">
      <h1>خصوصيتك</h1>
      <p className="privacy-lead">نجمع أقل ما نحتاجه لخدمتك، وبياناتك تبقى لك.</p>

      <ul className="privacy-points">
        {POINTS.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <span className="privacy-icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </li>
        ))}
      </ul>

      {GA_ID && (
        <p className="muted privacy-note">
          نستخدم Google Analytics لإحصاءات الزيارات، وقد يستخدم ملفات تعريف الارتباط. تقدر توقفه من إعدادات
          متصفحك.
        </p>
      )}

      {CONTACT_EMAIL && (
        <p className="privacy-contact">
          لأي استفسار أو لحذف حسابك كامل، راسلنا على{" "}
          <a href={"mailto:" + CONTACT_EMAIL} dir="ltr">
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      )}
      <p>
        <Link to="/">العودة لدليل الجامعات</Link>
      </p>
    </article>
  );
}
