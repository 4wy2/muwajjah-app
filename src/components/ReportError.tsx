import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { Flag } from "lucide-react";
import { db } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { Modal, Field, useToast } from "./ui";
import { friendly } from "../lib/utils";

const PARTS = [
  ["", "عام"],
  ["admission", "شروط القبول والنسب الموزونة"],
  ["programs", "التخصصات"],
  ["housing", "السكن"],
  ["cutoffs", "نسب القبول السابقة"],
  ["links", "الروابط"],
] as const;

// "Spotted something wrong?" under a university page. Visitors who are not
// signed in see it too (the dialog asks them to sign in); for signed-in users
// it shows once the reports table exists (migration 019).
export function ReportError({ universityId, name }: { universityId: string; name: string }) {
  const { user } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = useQuery({
    queryKey: ["error-reports-ready"],
    enabled: !!user,
    staleTime: Infinity,
    queryFn: async () => {
      const { error } = await db.from("guide_error_reports").select("id", { head: true, count: "exact" }).limit(0);
      return !error;
    },
  });
  if (user && !ready.data) return null;
  return (
    <div className="report-error">
      <button
        type="button"
        className="text-btn"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Flag size={14} aria-hidden="true" /> شفت معلومة غلط أو ناقصة؟ بلّغنا
      </button>
      <Modal open={open} title={"بلاغ عن " + name} onClose={() => !busy && setOpen(false)}>
        {!user ? (
          <p>
            <Link to={"/auth/login?next=" + encodeURIComponent(location.pathname)}>سجّل دخولك</Link> عشان
            ترسل البلاغ، ونقدر نتأكد إنه من طالب حقيقي.
          </p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              const { error } = await db.from("guide_error_reports").insert({
                university_id: universityId,
                section: String(f.get("section") || ""),
                message: String(f.get("message") || "").trim(),
              });
              setBusy(false);
              if (error) return setError(friendly(error));
              setOpen(false);
              toast("وصلنا بلاغك، شكرًا لك. بنراجعه ونصلحه");
            }}
          >
            <Field label="وين المشكلة؟">
              <select name="section" defaultValue="">
                {PARTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="وش الغلط؟ ولو تعرف الصح، اكتبه">
              <textarea
                name="message"
                rows={4}
                minLength={5}
                maxLength={1000}
                required
                autoComplete="off"
                placeholder="مثال: نسبة القدرات في المسار العلمي صارت 40% في دليل هذي السنة…"
              />
            </Field>
            <p className="muted small">البلاغ يوصل لفريق مُوجّه بس، وما يظهر لأحد ثاني.</p>
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "جارٍ الإرسال…" : "أرسل البلاغ"}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
