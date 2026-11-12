import { Link, Navigate } from "react-router-dom";
import {
  Search,
  GitCompareArrows,
  History,
  Check,
  Minus,
  Sparkles,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { track } from "../lib/analytics";
import { useAuth } from "../auth/AuthProvider";
import { useOffer } from "../api/commerce";
import { usePlus, usePlusFeatureKeys, useCommercialVisible } from "../api/student";
import { Loading, ErrorState } from "../components/ui";
import { date } from "../lib/utils";

// What each upgrade feature does for the student, in their words. Only the
// features the owner has actually put behind the upgrade are listed.
const BENEFITS: Record<string, { icon: LucideIcon; title: string; text: string }> = {
  program_search: {
    icon: Search,
    title: "البحث بالتخصص في كل الجامعات",
    text: "اكتب التخصص اللي تبيه، وتطلع لك كل الجامعات اللي تدرّسه في مكان واحد.",
  },
  comparison: {
    icon: GitCompareArrows,
    title: "مقارنة الجامعات جنب بعض",
    text: "حط حتى 3 جامعات في جدول واحد: السكن، والقبول، والتخصصات.",
  },
  historical_cutoffs: {
    icon: History,
    title: "نسب القبول السابقة",
    text: "أقل النسب اللي انقبل فيها الطلاب في السنوات اللي فاتت، مع مصدر كل رقم.",
  },
};
const FREE = [
  "صفحة كاملة لكل جامعة: القبول والسكن والبيئة والسلبيات",
  "حاسبة النسبة الموزونة وحفظ نتائجك",
  "المفضلة",
];

// The upgrade page: what the student gets, then how to upgrade. Open to
// visitors too; upgrading itself needs an account (payment is matched by e-mail).
export function UpgradeView() {
  const { user } = useAuth();
  const plus = usePlus();
  const offer = useOffer();
  const keys = usePlusFeatureKeys();
  const o = offer.data;
  if (offer.isPending || (user && plus.isPending)) return <Loading />;
  if (plus.error) return <ErrorState error={plus.error} retry={() => plus.refetch()} />;
  const upgraded = !!plus.data;
  const benefits = keys.map((k) => BENEFITS[k]).filter(Boolean);
  return (
    <div className="upgrade">
      <header className="upgrade-hero">
        <span className="upgrade-mark" aria-hidden="true">
          <Sparkles size={26} />
        </span>
        <h1>{upgraded ? "حسابك مُرقّى" : "رقِّ حسابك"}</h1>
        <p>
          {upgraded
            ? "كل الأدوات تحت مفتوحة لك" +
              (plus.data?.expires_at ? " حتى " + date(plus.data.expires_at) : "") +
              "."
            : "أدوات تساعدك وقت القرار. ومعلومات الجامعات الأساسية تبقى مجانية لك دائمًا."}
        </p>
      </header>

      {benefits.length > 0 && (
        <ul className="benefits">
          {benefits.map((b) => (
            <li key={b.title} className={upgraded ? "on" : ""}>
              <span className="benefit-icon" aria-hidden="true">
                <b.icon size={22} />
              </span>
              <div>
                <h2>{b.title}</h2>
                <p>{b.text}</p>
              </div>
              {upgraded && <Check className="benefit-check" size={20} aria-label="مفتوحة" />}
            </li>
          ))}
        </ul>
      )}

      {!upgraded && (
        <>
          <section className="compare-plans" aria-label="الفرق بين الحسابين">
            <div className="plan-row plan-head">
              <span />
              <span>مجاني</span>
              <span>بعد الترقية</span>
            </div>
            {FREE.map((f) => (
              <div className="plan-row" key={f}>
                <span>{f}</span>
                <Check size={18} aria-label="متاح" />
                <Check size={18} aria-label="متاح" />
              </div>
            ))}
            {benefits.map((b) => (
              <div className="plan-row" key={b.title}>
                <span>{b.title}</span>
                <Minus size={18} aria-label="غير متاح" className="muted" />
                <Check size={18} aria-label="متاح" />
              </div>
            ))}
          </section>

          <section className="upgrade-cta">
            {o?.price_text && <p className="upgrade-price">{o.price_text}</p>}
            <p className="muted">
              دفعة وحدة
              {o?.season_ends_at ? "، والترقية تبقى لين " + date(o.season_ends_at) : ""}
              {o?.season_label ? " (" + o.season_label + ")" : ""}.
            </p>
            {!user ? (
              <>
                <Link className="btn primary" to={"/auth/login?next=" + encodeURIComponent("/upgrade")}>
                  سجّل دخولك عشان ترقّي حسابك
                </Link>
                <p className="muted small">الترقية تنربط بحسابك، فلازم تسجّل دخول أول.</p>
              </>
            ) : o?.purchase_url ? (
              <>
                <a
                  className="btn primary"
                  href={o.purchase_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("subscribe_click", { from: "upgrade_page" })}
                >
                  رقِّ حسابي
                </a>
                <p className="notice">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>
                    ادفع بنفس إيميل حسابك
                    {user.email ? (
                      <>
                        {" "}
                        (<bdi dir="ltr">{user.email}</bdi>)
                      </>
                    ) : null}
                    ، وتنفتح لك المزايا تلقائيًا بعد الدفع.
                  </span>
                </p>
              </>
            ) : (
              <p className="notice">
                {o?.note || "للترقية تواصل مع إدارة مُوجّه، وتنفتح المزايا على حسابك بعد التحويل."}
              </p>
            )}
            {o?.purchase_url && o?.note && <p className="muted small">{o.note}</p>}
          </section>
        </>
      )}
    </div>
  );
}

// Public route: nothing to show while upgrades are switched off.
export default function Upgrade() {
  const commercial = useCommercialVisible();
  const offer = useOffer();
  const { user } = useAuth();
  const plus = usePlus();
  if (offer.isPending || (user && plus.isPending)) return <Loading />;
  if (!commercial) return <Navigate to="/" replace />;
  return <UpgradeView />;
}
