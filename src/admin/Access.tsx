import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMember } from "../auth/AuthProvider";
import { allRows, rpc, queryClient } from "../api/client";
import {
  PageHeading,
  Loading,
  ErrorState,
  Empty,
  Confirm,
  Field,
  useToast,
  useDebounce,
} from "../components/ui";
import { date, friendly } from "../lib/utils";
interface Student {
  user_id: string;
  email: string;
  display_name: string;
  registered_at: string;
  plus_until: string | null;
}
export default function Access() {
  const member = useMember().data!;
  const toast = useToast();
  const [search, setSearch] = useState("");
  const term = useDebounce(search);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<{
    name: string;
    args: Record<string, unknown>;
    description: string;
  } | null>(null);
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");
  const flags = useQuery({
    queryKey: ["admin-flags"],
    enabled: member.is_owner,
    queryFn: () =>
      allRows<{
        feature_key: string;
        access_mode: string;
        show_offer: boolean;
      }>("guide_feature_flags", (q) => q.order("feature_key")),
  });
  const google = useQuery({
    queryKey: ["google-enabled"],
    enabled: member.is_owner,
    queryFn: () => rpc<boolean>("guide_google_enabled"),
  });
  const students = useQuery({
    queryKey: ["students", term],
    enabled: member.is_owner,
    queryFn: () =>
      rpc<Student[]>("guide_owner_students", { search_query: term }),
  });
  if (!member.is_owner) return <Empty title="إدارة الوصول متاحة للمالك فقط" />;
  return (
    <>
      <PageHeading
        title="بلس والوصول"
        description="إعداد الميزات وإدارة اشتراكات الطلاب."
      />
      <div className="panel">
        <h2>صلاحية الميزات</h2>
        {flags.isPending ? (
          <Loading />
        ) : flags.error ? (
          <ErrorState error={flags.error} retry={() => flags.refetch()} />
        ) : (
          flags.data
            ?.filter((f) =>
              ["comparison", "historical_cutoffs"].includes(f.feature_key),
            )
            .map((f) => (
              <div className="list-row" key={f.feature_key}>
                <label htmlFor={f.feature_key}>
                  {f.feature_key === "comparison"
                    ? "مقارنة الجامعات"
                    : "النسب السابقة"}
                </label>
                <select
                  id={f.feature_key}
                  value={f.access_mode}
                  disabled={busy}
                  onChange={(e) =>
                    setAction({
                      name: "guide_owner_set_feature",
                      args: {
                        target_feature: f.feature_key,
                        target_mode: e.target.value,
                        // Changing access never switches marketing on by itself.
                        offer_visible: e.target.value === "plus" && f.show_offer,
                      },
                      description:
                        e.target.value === "plus"
                          ? "ستُتاح الميزة لمن تمنحه بلس فقط. بقية الزوار لن يروها ولن يروا أي إشارة للاشتراك ما لم تفعّل «إظهار عرض الاشتراك»."
                          : "تغيير صلاحية الميزة لجميع الزوار والطلاب؟",
                    })
                  }
                >
                  <option value="hidden">مخفية</option>
                  <option value="free">مجانية</option>
                  <option value="plus">بلس</option>
                </select>
                {f.access_mode === "plus" && (
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={f.show_offer}
                      disabled={busy}
                      onChange={(e) =>
                        setAction({
                          name: "guide_owner_set_feature",
                          args: {
                            target_feature: f.feature_key,
                            target_mode: "plus",
                            offer_visible: e.target.checked,
                          },
                          description: e.target.checked
                            ? "سيرى الزوار قفلًا ودعوة للاشتراك في هذه الميزة. متأكد؟"
                            : "إخفاء عرض الاشتراك عن الزوار؟",
                        })
                      }
                    />
                    إظهار عرض الاشتراك للزوار
                  </label>
                )}
              </div>
            ))
        )}
        {google.error ? (
          <ErrorState error={google.error} retry={() => google.refetch()} />
        ) : (
          <label className="choice">
            <input
              type="checkbox"
              checked={google.data === true}
              disabled={busy || google.isPending}
              onChange={(e) =>
                setAction({
                  name: "guide_owner_google_login",
                  args: { enabled: e.target.checked },
                  description:
                    "تغيير ظهور تسجيل الدخول عبر Google؟ يجب إعداد موفر Google في Supabase أيضًا.",
                })
              }
            />
            إظهار تسجيل الدخول عبر Google
          </label>
        )}
      </div>
      <section className="panel">
        <h2>اشتراكات الطلاب</h2>
        <div className="admin-filters">
          <input
            type="search"
            aria-label="ابحث عن طالب"
            placeholder="اسم الطالب أو بريده"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Field label="مدة الاشتراك بالأيام">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {[7, 30, 90, 365].map((n) => (
                <option key={n} value={n}>
                  {n} يومًا
                </option>
              ))}
            </select>
          </Field>
          <Field label="سبب التغيير">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </Field>
        </div>
        {students.isPending ? (
          <Loading />
        ) : students.error ? (
          <ErrorState error={students.error} retry={() => students.refetch()} />
        ) : !students.data?.length ? (
          <Empty title="لا يوجد طلاب مطابقون" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الطالب</th>
                  <th>حالة بلس</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {students.data.map((s) => (
                  <tr key={s.user_id}>
                    <td>
                      {s.display_name}
                      <small className="block" dir="ltr">
                        {s.email}
                      </small>
                    </td>
                    <td>
                      {s.plus_until ? "حتى " + date(s.plus_until) : "مجاني"}
                    </td>
                    <td>
                      <button
                        className="text-btn"
                        disabled={![7, 30, 90, 365].includes(days)}
                        onClick={() =>
                          setAction({
                            name: "guide_owner_manage_plus",
                            args: {
                              target_user: s.user_id,
                              operation: "grant",
                              days_count: days,
                              reason,
                            },
                            description: `تفعيل أو تمديد بلس للطالب ${s.display_name || s.email} لمدة ${days} يومًا؟`,
                          })
                        }
                      >
                        تفعيل / تمديد
                      </button>
                      {s.plus_until && (
                        <button
                          className="text-btn error-text"
                          onClick={() =>
                            setAction({
                              name: "guide_owner_manage_plus",
                              args: {
                                target_user: s.user_id,
                                operation: "revoke",
                                days_count: days,
                                reason,
                              },
                              description:
                                "إلغاء اشتراك بلس للطالب " + s.email + "؟",
                            })
                          }
                        >
                          إلغاء بلس
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Confirm
        open={!!action}
        title="تأكيد تغيير الوصول"
        body={action?.description || ""}
        busy={busy}
        onClose={() => setAction(null)}
        onConfirm={async () => {
          if (!action) return;
          setBusy(true);
          try {
            await rpc(action.name, action.args);
            await Promise.all(
              [
                "admin-flags",
                "google-enabled",
                "students",
                "feature",
                "plus",
              ].map((k) => queryClient.invalidateQueries({ queryKey: [k] })),
            );
            setAction(null);
            toast("تم تحديث إعدادات الوصول");
          } catch (err) {
            toast(friendly(err), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
