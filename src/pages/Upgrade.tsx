import { useEffect, useRef } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import {
  Search,
  GitCompareArrows,
  History,
  Check,
  Sparkles,
  ShieldCheck,
  Bookmark,
  SlidersHorizontal,
  Share2,
  X,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";
import { track } from "../lib/analytics";
import { useAuth } from "../auth/AuthProvider";
import { useOffer } from "../api/commerce";
import {
  usePlus,
  usePlusFeatureKeys,
  useCommercialVisible,
  useFeatureStates,
} from "../api/student";
import { useUpgradeSheet } from "../lib/store";
import { Loading, ErrorState } from "../components/ui";
import { date } from "../lib/utils";

// Benefits in the student's words, with where to use each once unlocked.
// Only features the owner actually placed behind the upgrade are shown.
export const BENEFITS: Record<
  string,
  { icon: LucideIcon; title: string; text: string; to: string; cta: string }
> = {
  program_search: {
    icon: Search,
    title: "ابحث بالتخصص في كل الجامعات",
    text: "اكتب التخصص اللي تبيه، وتطلع لك كل الجامعات اللي تدرّسه في مكان واحد.",
    to: "/?by=major",
    cta: "جرّب البحث بالتخصص",
  },
  comparison: {
    icon: GitCompareArrows,
    title: "قارن الجامعات جنب بعض",
    text: "حتى 3 جامعات في جدول واحد: السكن، والقبول، والتخصصات.",
    to: "/compare",
    cta: "افتح المقارنة",
  },
  historical_cutoffs: {
    icon: History,
    title: "شوف نسب القبول السابقة",
    text: "أقل النسب اللي انقبل فيها الطلاب في السنوات اللي فاتت، مع مصدر كل رقم.",
    to: "/",
    cta: "افتح أي جامعة",
  },
  saving: {
    icon: Bookmark,
    title: "احفظ مفضلتك ونتائجك",
    text: "احفظ الجامعات والتخصصات اللي تعجبك ونتائج الموزونة، وارجع لها من أي جهاز.",
    to: "/student/favorites",
    cta: "افتح مفضلتك",
  },
  filters: {
    icon: SlidersHorizontal,
    title: "فلتر الجامعات بالمنطقة والسكن",
    text: "اختر منطقتك أو السكن اللي يناسبك، وتطلع لك الجامعات المناسبة بضغطة.",
    to: "/",
    cta: "جرّب الفلاتر",
  },
  compare_share: {
    icon: Share2,
    title: "شارك مقارنتك برابط",
    text: "أرسل المقارنة لأهلك أو صديقك، وتنفتح عندهم نفس الجامعات جنب بعض.",
    to: "/compare",
    cta: "افتح المقارنة",
  },
};

// Short verbs for the headline, and names for the "what stays free" answer.
// Both follow whatever the owner set, so the page never promises a feature
// that is hidden or lists as free one that needs the upgrade.
const VERBS: Record<string, string> = {
  program_search: "ابحث بالتخصص",
  comparison: "قارن",
  historical_cutoffs: "شوف نسب القبول",
  saving: "احفظ اختياراتك",
  filters: "فلتر بالمنطقة والسكن",
  compare_share: "شارك مقارنتك",
};
const FREE_NAMES: Record<string, string> = {
  program_search: "البحث بالتخصص",
  comparison: "مقارنة الجامعات",
  historical_cutoffs: "نسب القبول السابقة",
  saving: "حفظ المفضلة ونتائج الموزونة",
  filters: "فلترة الجامعات",
  compare_share: "مشاركة المقارنة",
};
const BASE_FREE = ["صفحات الجامعات كاملة", "السكن", "الشروط", "حاسبة الموزونة"];
export const joinAr = (items: string[]) =>
  items.length < 2 ? items.join("") : items.slice(0, -1).join("، ") + "، و" + items[items.length - 1];
export function headline(keys: string[]) {
  const verbs = keys.map((k) => VERBS[k]).filter(Boolean);
  return verbs.length ? "قرّر بثقة: " + joinAr(verbs) : "أدوات تساعدك وقت القرار";
}
export function freeAnswer(states: Record<string, string | null> | undefined) {
  const extra = Object.keys(FREE_NAMES).filter(
    (k) => states?.[k] === "free" || states?.[k] === "login",
  );
  const needsLogin = extra.some((k) => states?.[k] === "login");
  return (
    joinAr([...BASE_FREE, ...extra.map((k) => FREE_NAMES[k])]) +
    ". كلها مجانية" +
    (needsLogin ? "، وبعضها يحتاج تسجيل دخول فقط." : ".")
  );
}

// How the purchase works, answered before the student asks.
const FAQ: [string, string][] = [
  ["كيف تنفتح المزايا؟", "تدفع من صفحة الدفع، وتنفتح المزايا على حسابك تلقائيًا. لازم تدفع بنفس إيميل حسابك."],
  ["هل يتجدد الدفع؟", "لا. دفعة وحدة للموسم، وما فيه تجديد تلقائي."],
];

function useOfferInfo() {
  const offer = useOffer();
  const o = offer.data;
  const term = o?.season_ends_at ? "لين " + date(o.season_ends_at) : "للموسم كامل";
  return { offer, o, term };
}

// The single purchase action: sign in first (payment is matched by e-mail).
function BuyButton({ from }: { from: string }) {
  const { user } = useAuth();
  const { o } = useOfferInfo();
  const loc = useLocation();
  if (!user)
    return (
      <Link className="btn primary buy-btn" to={"/auth/login?next=" + encodeURIComponent(loc.pathname + loc.search)}>
        سجّل دخولك للترقية
      </Link>
    );
  if (!o?.purchase_url)
    return (
      <p className="notice">
        {o?.note || "للترقية تواصل مع إدارة مُوجّه، وتنفتح المزايا على حسابك بعد التحويل."}
      </p>
    );
  return (
    <a
      className="btn primary buy-btn"
      href={o.purchase_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("subscribe_click", { from })}
    >
      رقِّ حسابي{o.price_text ? " · " + o.price_text : ""}
    </a>
  );
}
function EmailNote() {
  const { user } = useAuth();
  const { o } = useOfferInfo();
  if (!user || !o?.purchase_url) return null;
  return (
    <p className="pay-note">
      <ShieldCheck size={15} aria-hidden="true" />
      <span>
        ادفع بنفس إيميل حسابك
        {user.email ? (
          <>
            {" "}
            (<bdi dir="ltr">{user.email}</bdi>)
          </>
        ) : null}
        .
      </span>
    </p>
  );
}

// Opened from a locked feature: the feature the student wanted leads, the
// rest follow, then the price and one action, with a clear way out.
export function UpgradeSheet() {
  const { open, feature, hide } = useUpgradeSheet();
  const keys = usePlusFeatureKeys();
  const { term } = useOfferInfo();
  const ref = useRef<HTMLDialogElement>(null);
  const loc = useLocation();
  useEffect(() => {
    const el = ref.current;
    if (open && !el?.open) el?.showModal();
    if (!open && el?.open) el.close();
  }, [open]);
  useEffect(() => hide(), [loc.pathname]);
  const lead = feature && BENEFITS[feature] ? BENEFITS[feature] : null;
  const others = keys.filter((k) => k !== feature).map((k) => BENEFITS[k]).filter(Boolean);
  return (
    <dialog
      ref={ref}
      className="upgrade-sheet"
      aria-label="ترقية الحساب"
      onClose={hide}
      onClick={(e) => e.target === ref.current && hide()}
    >
      <button className="icon-btn sheet-close" aria-label="إغلاق" onClick={hide}>
        <X size={20} />
      </button>
      {lead ? (
        <div className="sheet-lead">
          <span className="sheet-icon" aria-hidden="true">
            <lead.icon size={26} />
          </span>
          <h2>{lead.title}</h2>
          <p>{lead.text}</p>
        </div>
      ) : (
        <div className="sheet-lead">
          <span className="sheet-icon" aria-hidden="true">
            <Sparkles size={26} />
          </span>
          <h2>أدوات تساعدك وقت القرار</h2>
          <p>رقِّ حسابك وتنفتح لك هذي الأدوات {term}.</p>
        </div>
      )}
      {others.length > 0 && (
        <>
          {lead && <p className="sheet-also">ومعها:</p>}
          <ul className="sheet-list">
            {others.map((b) => (
              <li key={b.title}>
                <Check size={17} aria-hidden="true" /> {b.title}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="sheet-actions">
        <BuyButton from={"sheet_" + (feature || "general")} />
        <EmailNote />
        <p className="sheet-term">دفعة وحدة، تبقى {term}. بدون تجديد تلقائي.</p>
        <div className="sheet-links">
          <button className="text-btn" onClick={hide}>
            ليس الآن
          </button>
          <Link to="/upgrade" className="text-btn">
            كل التفاصيل
          </Link>
        </div>
      </div>
    </dialog>
  );
}

// The full page: what you get, one plan, the questions people ask.
export function UpgradeView() {
  const { user } = useAuth();
  const plus = usePlus();
  const keys = usePlusFeatureKeys();
  const { offer, o, term } = useOfferInfo();
  const states = useFeatureStates();
  if (offer.isPending || (user && plus.isPending)) return <Loading />;
  if (plus.error) return <ErrorState error={plus.error} retry={() => plus.refetch()} />;
  const benefits = keys.map((k) => BENEFITS[k]).filter(Boolean);
  if (plus.data)
    return (
      <div className="upgrade">
        <header className="up-head">
          <span className="up-badge">
            <Sparkles size={15} aria-hidden="true" /> حسابك مُرقّى
          </span>
          <h1>كل الأدوات مفتوحة لك</h1>
          <p className="muted">حتى {date(plus.data.expires_at)}.</p>
        </header>
        <ul className="up-features">
          {benefits.map((b) => (
            <li key={b.title}>
              <span className="up-icon" aria-hidden="true">
                <b.icon size={21} />
              </span>
              <div>
                <h2>{b.title}</h2>
                <p>{b.text}</p>
                <Link to={b.to} className="up-go">
                  {b.cta} <ArrowLeft size={15} aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="upgrade">
      <header className="up-head">
        <span className="up-badge">
          <Sparkles size={15} aria-hidden="true" /> ترقية الحساب
        </span>
        <h1>{headline(keys)}</h1>
        <p className="muted">أدوات إضافية لوقت القرار. ومعلومات الجامعات الأساسية تبقى مجانية لك دائمًا.</p>
      </header>
      <section className="plan-card" aria-label="الترقية">
        <div className="plan-top">
          <div>
            <h2>الحساب المُرقّى</h2>
            <p className="muted">{o?.season_label || "للموسم"}</p>
          </div>
          {o?.price_text && <p className="plan-price">{o.price_text}</p>}
        </div>
        <ul className="up-features compact">
          {benefits.map((b) => (
            <li key={b.title}>
              <span className="up-icon" aria-hidden="true">
                <b.icon size={20} />
              </span>
              <div>
                <h3>{b.title}</h3>
                <p>{b.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className="plan-buy">
          <BuyButton from="upgrade_page" />
          <EmailNote />
          <p className="sheet-term">دفعة وحدة، تبقى {term}. بدون تجديد تلقائي.</p>
        </div>
      </section>
      <section className="up-faq" aria-label="أسئلة شائعة">
        {[...FAQ, ["وش يبقى مجاني؟", freeAnswer(states)] as [string, string]].map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
        {o?.note && <p className="muted small">{o.note}</p>}
      </section>
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
