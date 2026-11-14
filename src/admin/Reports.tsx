import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { db, rpc } from "../api/client";
import { useAdminRows } from "../api/admin";
import { PageHeading, Loading, ErrorState, Empty, useToast } from "../components/ui";
import { date, friendly } from "../lib/utils";

interface Report {
  id: number;
  university_id: string;
  section: string;
  message: string;
  status: "open" | "done";
  created_at: string;
}

const PART: Record<string, string> = {
  "": "عام",
  admission: "القبول والنسب الموزونة",
  programs: "التخصصات",
  housing: "السكن",
  cutoffs: "النسب السابقة",
  links: "الروابط",
};

// Students' error reports. The owner sees all; a team member sees their universities.
export default function Reports() {
  const [show, setShow] = useState<"open" | "done">("open");
  const [busy, setBusy] = useState<number | null>(null);
  const toast = useToast();
  const unis = useAdminRows("universities");
  const q = useQuery({
    queryKey: ["error-reports", show],
    queryFn: async () => {
      const { data, error } = await db
        .from("guide_error_reports")
        .select("id,university_id,section,message,status,created_at")
        .eq("status", show)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Report[];
    },
  });
  const uniName = (id: string) => String(unis.data?.find((u) => u.id === id)?.name || "");
  return (
    <>
      <PageHeading
        title="بلاغات الطلاب"
        description="معلومات غلط أو ناقصة بلّغ عنها الطلاب. صحّحها في صفحة الجامعة وبعدين علّم البلاغ «تم»."
      >
        <div className="report-tabs" role="group" aria-label="نوع البلاغات">
          {(["open", "done"] as const).map((k) => (
            <button
              key={k}
              className={"btn compact " + (show === k ? "primary" : "secondary")}
              aria-pressed={show === k}
              onClick={() => setShow(k)}
            >
              {k === "open" ? "مفتوحة" : "تمت"}
            </button>
          ))}
        </div>
      </PageHeading>
      <section className="panel">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data.length ? (
          <Empty title={show === "open" ? "ما فيه بلاغات مفتوحة" : "ما فيه بلاغات منتهية"} />
        ) : (
          <ul className="report-list">
            {q.data.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>
                    <Link to={"/admin/universities/" + r.university_id}>{uniName(r.university_id) || "جامعة"}</Link>
                  </strong>
                  <small className="muted">
                    {" "}
                    · {PART[r.section] ?? r.section} · {date(r.created_at)}
                  </small>
                  <p>{r.message}</p>
                </div>
                <button
                  className="btn secondary compact"
                  disabled={busy === r.id}
                  onClick={async () => {
                    setBusy(r.id);
                    try {
                      await rpc("guide_set_error_report", { report_id: r.id, done: r.status === "open" });
                      await q.refetch();
                      toast(r.status === "open" ? "علّمته «تم»" : "رجّعته مفتوح");
                    } catch (e) {
                      toast(friendly(e), true);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {r.status === "open" ? "تم" : "إعادة فتح"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
