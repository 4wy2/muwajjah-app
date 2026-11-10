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
import { useOffer, type OfferSettings } from "../api/commerce";
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
  const offer = useOffer();
  if (!member.is_owner) return <Empty title="إدارة الوصول متاحة للمالك فقط" />;
  return (
    <>
      <PageHeading
        title="بلس والوصول"
        description="إعداد الميزات وإدارة اشتراكات الطلاب."
      />
      {offer.data && (
        <OfferPanel
          key={JSON.stringify(offer.data)}
          offer={offer.data}
          busy={busy}
          onSave={(o) =>
            setAction({
              name: "guide_owner_set_offer",
              args: {
                enabled: o.commercial_enabled,
                season_label: o.season_label,
                price_text: o.price_text,
                purchase_url: o.purchase_url.trim(),
                season_ends_at: o.season_ends_at || null,
                note: o.note,
              },
              description: o.commercial_enabled
                ? "تشغيل الاشتراكات: ستظهر للزوار الأقفال وصفحة الاشتراك وشريط الإعلان لكل ميزة مدفوعة. متأكد؟"
                : offer.data!.commercial_enabled
                  ? "إيقاف الاشتراكات: ستختفي كل إشارات الاشتراك عن الزوار، ويبقى المشتركون الحاليون على اشتراكهم. متأكد؟"
                  : "حفظ إعدادات العرض؟ الاشتراكات ستبقى مطفأة.",
            })
          }
        />
      )}
      <div className="panel">
        <h2>صلاحية الميزات</h2>
        {flags.isPending ? (
          <Loading />
        ) : flags.error ? (
          <ErrorState error={flags.error} retry={() => flags.refetch()} />
        ) : (
          flags.data
            ?.filter((f) =>
              ["comparison", "historical_cutoffs", "program_search"].includes(
                f.feature_key,
              ),
            )
            .map((f) => (
              <div className="list-row" key={f.feature_key}>
                <label htmlFor={f.feature_key}>
                  {f.feature_key === "comparison"
                    ? "مقارنة الجامعات"
                    : f.feature_key === "program_search"
                      ? "البحث بالتخصص"
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
                          : e.target.value === "members"
                            ? "ستكون الميزة مجانية لكل من يسجل دخوله، ويُطلب من الزائر تسجيل الدخول. متأكد؟"
                            : "تغيير صلاحية الميزة لجميع الزوار والطلاب؟",
                    })
                  }
                >
                  <option value="hidden">مخفية</option>
                  <option value="free">مجانية للجميع</option>
                  <option value="members">مجانية للمسجلين</option>
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
                      {offer.data?.season_ends_at && (
                        <button
                          className="text-btn"
                          onClick={() =>
                            setAction({
                              name: "guide_owner_manage_plus",
                              args: {
                                target_user: s.user_id,
                                operation: "season",
                                days_count: 30,
                                reason,
                              },
                              description: `تفعيل بلس للطالب ${s.display_name || s.email} حتى نهاية الموسم (${date(offer.data!.season_ends_at!)})؟`,
                            })
                          }
                        >
                          حتى نهاية الموسم
                        </button>
                      )}
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
                "offer",
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

function OfferPanel({
  offer,
  busy,
  onSave,
}: {
  offer: OfferSettings;
  busy: boolean;
  onSave: (o: OfferSettings) => void;
}) {
  const [o, setO] = useState<OfferSettings>({
    ...offer,
    season_ends_at: offer.season_ends_at || "",
  });
  const set = (k: keyof OfferSettings, v: string | boolean) =>
    setO((x) => ({ ...x, [k]: v }));
  return (
    <section className="panel">
      <h2>الاشتراكات</h2>
      <p className="muted">
        الحالة الآن:{" "}
        <strong>{offer.commercial_enabled ? "مشغّلة" : "مطفأة"}</strong>.{" "}
        {offer.commercial_enabled
          ? "الزوار يشوفون الأقفال وصفحة الاشتراك وشريط الإعلان."
          : "ما يظهر للزوار أي إشارة للاشتراك، والمشتركون الحاليون يستخدمون المزايا عادي."}
      </p>
      <div className="admin-filters">
        <Field label="اسم الموسم">
          <input
            value={o.season_label}
            maxLength={80}
            placeholder="مثل: موسم قبول 1448"
            onChange={(e) => set("season_label", e.target.value)}
          />
        </Field>
        <Field label="السعر كما يظهر للطالب">
          <input
            value={o.price_text}
            maxLength={80}
            placeholder="مثل: 29 ريال"
            onChange={(e) => set("price_text", e.target.value)}
          />
        </Field>
        <Field label="نهاية الموسم">
          <input
            type="date"
            value={o.season_ends_at || ""}
            onChange={(e) => set("season_ends_at", e.target.value)}
          />
        </Field>
        <Field label="رابط منتج الاشتراك في متجرك (اختياري)">
          <input
            dir="ltr"
            value={o.purchase_url}
            placeholder="https://"
            onChange={(e) => set("purchase_url", e.target.value)}
          />
        </Field>
        <Field label="ملاحظة للطالب (مثل طريقة التحويل)">
          <input
            value={o.note}
            maxLength={500}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
      </div>
      <div className="row-actions">
        <button
          className="btn secondary compact"
          disabled={busy}
          onClick={() => onSave({ ...o, commercial_enabled: offer.commercial_enabled })}
        >
          حفظ الإعدادات
        </button>
        <button
          className={"btn compact " + (offer.commercial_enabled ? "danger" : "primary")}
          disabled={busy}
          onClick={() => onSave({ ...o, commercial_enabled: !offer.commercial_enabled })}
        >
          {offer.commercial_enabled ? "إيقاف الاشتراكات" : "تشغيل الاشتراكات"}
        </button>
      </div>
    </section>
  );
}
