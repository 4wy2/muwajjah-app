import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, SearchX } from "lucide-react";
import { allRows } from "../api/client";
import { useMember } from "../auth/AuthProvider";
import { useAdminRows } from "../api/admin";
import {
  PageHeading,
  Loading,
  ErrorState,
  Empty,
  useToast,
} from "../components/ui";
import { downloadJson, friendly, number } from "../lib/utils";
import AnalyticsArchive from "./AnalyticsArchive";
interface Hit {
  event_day: string;
  event_kind: string;
  entity_id: string;
  hits: number;
}
interface Missing {
  event_day: string;
  search_term: string;
  hits: number;
}
export default function Analytics() {
  const member = useMember().data!;
  const [days, setDays] = useState(30);
  const since = new Date(Date.now() - (days - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  const q = useQuery({
    queryKey: ["analytics", since],
    enabled: member.is_owner,
    queryFn: async () => {
      const [interest, missing] = await Promise.all([
        allRows<Hit>("guide_daily_interest", (q) =>
          q
            .gte("event_day", since)
            .order("event_day")
            .order("event_kind")
            .order("entity_id"),
        ),
        allRows<Missing>("guide_daily_missing_search", (q) =>
          q.gte("event_day", since).order("event_day").order("search_term"),
        ),
      ]);
      return { interest, missing };
    },
  });
  const universities = useAdminRows("universities");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!member.is_owner) return <Empty title="التحليلات متاحة للمالك فقط" />;
  const byDay = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      hits:
        q.data?.interest
          .filter((r) => r.event_day === date)
          .reduce((s, r) => s + Number(r.hits), 0) || 0,
    };
  });
  const max = Math.max(1, ...byDay.map((d) => d.hits));
  return (
    <>
      <PageHeading
        title="التحليلات"
        description="اهتمام الطلاب والبحث الذي لم يجد نتائج."
      >
        <div className="actions">
          <select
            aria-label="فترة الإحصاءات"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            <option value={7}>آخر 7 أيام</option>
            <option value={30}>آخر 30 يومًا</option>
            <option value={90}>آخر 90 يومًا</option>
          </select>
          <button
            className="btn secondary compact"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const [interest, missing] = await Promise.all([
                  allRows("guide_daily_interest", (q) =>
                    q.order("event_day").order("event_kind").order("entity_id"),
                  ),
                  allRows("guide_daily_missing_search", (q) =>
                    q.order("event_day").order("search_term"),
                  ),
                ]);
                downloadJson("muwajjah-analytics-archive.json", {
                  exported_at: new Date().toISOString(),
                  interest,
                  missing,
                });
              } catch (e) {
                toast(friendly(e), true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={16} />
            {busy ? "جارٍ التصدير…" : "تصدير كل التحليلات"}
          </button>
        </div>
      </PageHeading>
      <AnalyticsArchive />
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <Eye />
              <span>مشاهدات الجامعات والتخصصات</span>
              <strong>{number(byDay.reduce((s, d) => s + d.hits, 0))}</strong>
            </div>
            <div className="stat-card">
              <SearchX />
              <span>عمليات بحث بلا نتائج</span>
              <strong>
                {number(q.data.missing.reduce((s, r) => s + Number(r.hits), 0))}
              </strong>
            </div>
          </div>
          <section className="panel">
            <h2>المشاهدات اليومية</h2>
            <div
              className="bar-chart"
              role="img"
              aria-label="رسم المشاهدات اليومية؛ القيم مفصّلة في الجدول أدناه"
            >
              {byDay.map((d) => (
                <div
                  className="bar-slot"
                  key={d.date}
                  title={d.date + ": " + d.hits}
                >
                  <span
                    style={{ height: Math.max(1, (d.hits / max) * 100) + "%" }}
                  />
                </div>
              ))}
            </div>
            <details>
              <summary>عرض الأرقام اليومية</summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>اليوم</th>
                      <th>المشاهدات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byDay.map((d) => (
                      <tr key={d.date}>
                        <td>{d.date}</td>
                        <td>{d.hits}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
          <div className="detail-grid">
            <section className="panel">
              <h2>الجامعات الأكثر مشاهدة</h2>
              {(universities.data || [])
                .map((u) => ({
                  name: String(u.name),
                  hits: q.data.interest
                    .filter(
                      (r) =>
                        r.event_kind === "university" && r.entity_id === u.id,
                    )
                    .reduce((s, r) => s + Number(r.hits), 0),
                }))
                .filter((u) => u.hits > 0)
                .sort((a, b) => b.hits - a.hits)
                .slice(0, 10)
                .map((u) => (
                  <div className="list-row" key={u.name}>
                    <span>{u.name}</span>
                    <b>{number(u.hits)}</b>
                  </div>
                ))}
            </section>
            <section className="panel">
              <h2>البحث دون نتائج</h2>
              {!q.data.missing.length ? (
                <p className="muted">لا توجد عمليات مسجلة للفترة.</p>
              ) : (
                [...q.data.missing]
                  .sort((a, b) => b.hits - a.hits)
                  .slice(0, 30)
                  .map((r) => (
                    <div className="list-row" key={r.event_day + r.search_term}>
                      <span>
                        {r.search_term}
                        <small className="block muted">{r.event_day}</small>
                      </span>
                      <b>{number(r.hits)}</b>
                    </div>
                  ))
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
