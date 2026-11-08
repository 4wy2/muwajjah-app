import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Trash2 } from "lucide-react";
import { allRows, rpc, queryClient } from "../api/client";
import { Confirm, useToast } from "../components/ui";
import { downloadJson, friendly, number } from "../lib/utils";

// Owner-chosen operating thresholds (not plan limits): review at 300 MB,
// act at 400 MB. Check the live Supabase plan for real quotas and pricing.
const REVIEW_MB = 300;
const ACT_MB = 400;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function AnalyticsArchive() {
  const toast = useToast();
  const size = useQuery({
    queryKey: ["db-size"],
    queryFn: () => rpc<number>("guide_analytics_size"),
    staleTime: 300_000,
  });
  // The server only deletes days at least 90 days old.
  const before = iso(new Date(Date.now() - 90 * 86400000));
  const [archive, setArchive] = useState<{ before: string; interest: number; searches: number; from?: string } | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const collection = useQuery({
    queryKey: ["analytics-switch"],
    queryFn: () =>
      allRows<{ access_mode: string }>("guide_feature_flags", (q) =>
        q.eq("feature_key", "analytics_collection"),
      ).then((r) => (r[0] ? r[0].access_mode === "free" : null)),
  });
  const mb = size.data ? size.data / 1024 / 1024 : null;
  const level = mb === null ? "" : mb >= ACT_MB ? "act" : mb >= REVIEW_MB ? "review" : "ok";
  return (
    <section className="panel capacity">
      <h2>السعة وأرشفة التحليلات</h2>
      <div className="capacity-row">
        <div>
          <span className="muted small">حجم قاعدة البيانات كاملة الآن</span>
          <strong className={"cap-" + level} dir="ltr">
            {size.isPending ? "…" : size.error ? "تعذر القراءة" : number(Math.round(mb! * 10) / 10) + " MB"}
          </strong>
        </div>
        <p className="small muted">
          عتبتاك: المراجعة عند {REVIEW_MB} MB، والإجراء عند {ACT_MB} MB. هذا الرقم يشمل كل الجداول، ولا
          يعكس عدد المستخدمين النشطين (MAU) أو نقل البيانات؛ راجعها من لوحة Supabase. حذف السجلات قد لا
          يخفّض الحجم المعروض فورًا.
        </p>
      </div>
      {level === "act" && (
        <p className="notice error">تجاوزت عتبة الإجراء. أرشف التحليلات القديمة أو قرر الترقية.</p>
      )}
      {level === "review" && <p className="notice">تجاوزت عتبة المراجعة. راجع النمو والنسخ الاحتياطي.</p>}
      <div className="list-row">
        <span>
          تسجيل التحليلات من الخادم
          <small className="block muted">
            {collection.data === null
              ? "يتطلب تطبيق database/003_analytics_fix.sql."
              : "إيقافه يمنع كتابات جديدة ولا يؤثر على تصفح الجامعات."}
          </small>
        </span>
        {collection.data !== null && collection.data !== undefined && (
          <label className="choice">
            <input
              type="checkbox"
              checked={collection.data}
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                try {
                  await rpc("guide_owner_set_analytics", { enabled: e.target.checked });
                  await queryClient.invalidateQueries({ queryKey: ["analytics-switch"] });
                } catch (err) {
                  toast(friendly(err), true);
                } finally {
                  setBusy(false);
                }
              }}
            />
            {collection.data ? "يعمل" : "متوقف"}
          </label>
        )}
      </div>
      <ol className="archive-steps small">
        <li>
          نزّل أرشيف التحليلات الأقدم من {before} (أكثر من 90 يومًا).
          <button
            className="btn secondary compact"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const [interest, missing] = await Promise.all([
                  allRows<{ event_day: string }>("guide_daily_interest", (q) =>
                    q.lt("event_day", before).order("event_day").order("event_kind").order("entity_id"),
                  ),
                  allRows<{ event_day: string }>("guide_daily_missing_search", (q) =>
                    q.lt("event_day", before).order("event_day").order("search_term"),
                  ),
                ]);
                if (!interest.length && !missing.length) {
                  toast("لا توجد تحليلات أقدم من 90 يومًا.");
                  setArchive(null);
                  return;
                }
                const from = [interest[0]?.event_day, missing[0]?.event_day].filter(Boolean).sort()[0];
                downloadJson(`muwajjah-analytics-before-${before}.json`, {
                  exported_at: new Date().toISOString(),
                  before_day: before,
                  counts: { interest: interest.length, missing_searches: missing.length },
                  interest,
                  missing,
                });
                setArchive({ before, interest: interest.length, searches: missing.length, from });
                setChecked(false);
              } catch (e) {
                toast(friendly(e), true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={15} /> تنزيل الأرشيف
          </button>
        </li>
        {archive && (
          <>
            <li>
              الملف يحتوي {number(archive.interest)} سجل مشاهدات و{number(archive.searches)} سجل بحث، من{" "}
              {archive.from} حتى ما قبل {archive.before}. افتحه وتأكد أنه سليم ومحفوظ عندك.
              <label className="choice">
                <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
                فتحت الملف وتحققت منه وحفظته.
              </label>
            </li>
            <li>
              احذف السجلات نفسها من القاعدة. يرفض الخادم الحذف إذا تغيّرت الأعداد بعد التنزيل.
              <button className="btn danger compact" disabled={!checked || busy} onClick={() => setConfirm(true)}>
                <Trash2 size={15} /> حذف المؤرشف من القاعدة
              </button>
            </li>
          </>
        )}
      </ol>
      <p className="muted small">
        هذا لا يمس بيانات الجامعات أو الطلاب. التحليلات مجمعة يوميًا ولا تربط التصفح بشخص.
      </p>
      <Confirm
        open={confirm}
        title="حذف التحليلات المؤرشفة"
        body={`سيُحذف ${archive?.interest ?? 0} سجل مشاهدات و${archive?.searches ?? 0} سجل بحث أقدم من ${archive?.before}. لا يمكن التراجع إلا من ملف الأرشيف.`}
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          if (!archive) return;
          setBusy(true);
          try {
            const r = await rpc<{ interest_rows: number; search_rows: number }>("guide_delete_archived_analytics", {
              before_day: archive.before,
              expected_interest: archive.interest,
              expected_searches: archive.searches,
            });
            toast(`حُذف ${r.interest_rows} سجل مشاهدات و${r.search_rows} سجل بحث.`);
            setArchive(null);
            setConfirm(false);
            await queryClient.invalidateQueries({ queryKey: ["analytics"] });
            await queryClient.invalidateQueries({ queryKey: ["db-size"] });
          } catch (e) {
            toast(friendly(e), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
