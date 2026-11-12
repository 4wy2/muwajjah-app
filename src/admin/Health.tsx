import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  ExternalLink,
  Mail,
} from "lucide-react";
import { rpc } from "../api/client";
import { PageHeading, Loading, ErrorState } from "../components/ui";
import { alerts, healthChecks, type Check, type Health as H } from "./health";

export function useSiteHealth(enabled = true) {
  return useQuery({
    queryKey: ["site-health"],
    queryFn: () => rpc<H>("guide_owner_site_health"),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
// Before migration 014 the function does not exist yet.
export const healthMissing = (e: unknown) =>
  /guide_owner_site_health|PGRST202|42883|Could not find the function/i.test(
    String((e as { message?: string; code?: string })?.message || "") +
      String((e as { code?: string })?.code || ""),
  );

const ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: AlertOctagon, info: Info };
const LEVEL_LABEL = { ok: "تمام", warn: "انتبهي", bad: "يحتاج تصرف", info: "للعلم" };

function Action({ action }: { action: NonNullable<Check["action"]> }) {
  return action.to.startsWith("/") ? (
    <Link className="btn secondary compact" to={action.to}>
      {action.label}
    </Link>
  ) : (
    <a className="btn secondary compact" href={action.to} target="_blank" rel="noopener noreferrer">
      {action.label} <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}

function CheckRow({ c }: { c: Check }) {
  const Icon = ICON[c.level];
  return (
    <li className={"hc hc-" + c.level}>
      <Icon className="hc-icon" size={20} aria-hidden="true" />
      <div className="hc-body">
        <div className="hc-top">
          <h3>{c.title}</h3>
          <span className="hc-badge">{LEVEL_LABEL[c.level]}</span>
        </div>
        <p className="hc-value">{c.value}</p>
        {c.ratio !== undefined && c.group === "usage" && (
          <div
            className="hc-meter"
            role="meter"
            aria-label={c.title}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(c.ratio, 1) * 100)}
          >
            <span style={{ width: Math.max(2, Math.min(c.ratio, 1) * 100) + "%" }} />
          </div>
        )}
        <p className="hc-fix">{c.fix}</p>
        {c.action && <Action action={c.action} />}
      </div>
    </li>
  );
}

function Views({ h }: { h: H }) {
  const days = useMemo(() => {
    const map = new Map(h.views.map((v) => [v.day, Number(v.hits)]));
    const end = Date.parse(h.today);
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(end - (29 - i) * 86_400_000).toISOString().slice(0, 10);
      return { d, hits: map.get(d) || 0 };
    });
  }, [h]);
  const max = Math.max(1, ...days.map((x) => x.hits));
  const total = days.reduce((s, x) => s + x.hits, 0);
  return (
    <section className="panel hc-views" aria-label="زيارات آخر 30 يوم">
      <div className="hc-views-head">
        <h2>زيارات صفحات الجامعات</h2>
        <span className="muted">آخر 30 يوم: {total.toLocaleString("en")}</span>
      </div>
      <div className="hc-bars" role="img" aria-label={"أعلى يوم " + max + " زيارة"}>
        {days.map((x) => (
          <span key={x.d} title={x.d + ": " + x.hits} style={{ height: Math.max(2, (x.hits / max) * 100) + "%" }} />
        ))}
      </div>
      <div className="hc-stats">
        <div>
          <strong>{h.new_today}</strong>
          <span>تسجيل اليوم</span>
        </div>
        <div>
          <strong>{h.new_week}</strong>
          <span>هالأسبوع</span>
        </div>
        <div>
          <strong>{h.new_month}</strong>
          <span>هالشهر</span>
        </div>
        <div>
          <strong>{h.users_total}</strong>
          <span>كل الحسابات</span>
        </div>
      </div>
    </section>
  );
}

const GROUPS: [Check["group"], string][] = [
  ["usage", "الاستهلاك مقابل الخطة المجانية"],
  ["launch", "إعدادات الإطلاق"],
  ["data", "جودة البيانات"],
];

export default function SiteHealth() {
  const q = useSiteHealth();
  if (q.isPending) return <Loading />;
  if (q.error)
    return healthMissing(q.error) ? (
      <>
        <PageHeading title="صحة الموقع" />
        <p className="notice">هذا القسم يحتاج تحديث قاعدة البيانات 014. بعد تطبيقه تظهر الأرقام هنا.</p>
      </>
    ) : (
      <ErrorState error={q.error} retry={() => q.refetch()} />
    );
  const h = q.data!;
  const checks = healthChecks(h);
  const urgent = alerts(checks);
  return (
    <div className="site-health">
      <PageHeading
        title="صحة الموقع"
        description="الاستهلاك والإعدادات والبيانات في مكان واحد. كل تنبيه معه وش تسوين."
      />
      <div className={"hc-summary " + (urgent.some((c) => c.level === "bad") ? "bad" : urgent.length ? "warn" : "ok")}>
        {urgent.length ? (
          <>
            <AlertTriangle size={20} aria-hidden="true" />
            <span>
              {urgent.length === 1 ? "تنبيه واحد يحتاج انتباهك" : urgent.length + " تنبيهات تحتاج انتباهك"}
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 size={20} aria-hidden="true" />
            <span>كل شي تمام. ما فيه شي يحتاج تصرف الحين.</span>
          </>
        )}
        <button className="text-btn" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? "جارٍ التحديث…" : "تحديث"}
        </button>
      </div>
      {urgent.length > 0 && (
        <section aria-label="يحتاج انتباهك">
          <h2 className="hc-group">يحتاج انتباهك</h2>
          <ul className="hc-list">
            {urgent.map((c) => (
              <CheckRow c={c} key={c.id} />
            ))}
          </ul>
        </section>
      )}
      <Views h={h} />
      {GROUPS.map(([g, label]) => {
        // Items already listed under "يحتاج انتباهك" are not repeated.
        const rest = checks.filter((c) => c.group === g && !urgent.includes(c));
        if (!rest.length) return null;
        return (
          <section key={g} aria-label={label}>
            <h2 className="hc-group">{label}</h2>
            <ul className="hc-list">
              {rest.map((c) => (
                <CheckRow c={c} key={c.id} />
              ))}
            </ul>
          </section>
        );
      })}
      <p className="notice hc-tip">
        <Mail size={16} aria-hidden="true" />
        <span>
          Supabase نفسه يرسل تحذير لإيميل الفوترة لما تقربين من أي حد. تأكدي إن إيميل الفوترة في حسابك إيميل تفتحينه كل يوم،
          ولو جاك تحذير اشتركي في Pro بنفس اليوم: المهلة بعد التجاوز تجي مرة وحدة بس.
        </span>
      </p>
    </div>
  );
}
