import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMember } from "../auth/AuthProvider";
import { rpc, queryClient } from "../api/client";
import { useAdminRows } from "../api/admin";
import {
  PageHeading,
  Field,
  Loading,
  ErrorState,
  Empty,
  Modal,
  Confirm,
  useToast,
} from "../components/ui";
import { friendly } from "../lib/utils";
interface TeamMember {
  user_id: string;
  display_name: string;
  email: string;
  is_enabled: boolean;
  can_edit: boolean;
  can_publish: boolean;
  can_delete: boolean;
  university_ids: string[];
}
export default function Team() {
  const member = useMember().data!;
  const q = useQuery({
    queryKey: ["team"],
    enabled: member.is_owner,
    // Prefer the directory (includes names); fall back on older databases.
    queryFn: () =>
      rpc<TeamMember[]>("guide_team_directory").catch((e) => {
        if (e?.code === "PGRST202") return rpc<TeamMember[]>("guide_list_team");
        throw e;
      }),
  });
  const pending = useQuery({
    queryKey: ["team-pending"],
    enabled: member.is_owner,
    queryFn: () =>
      rpc<
        {
          user_id: string;
          email: string;
          display_name: string;
          registered_at: string;
          email_confirmed: boolean;
        }[]
      >("guide_pending_signups"),
  });
  const unis = useAdminRows("universities");
  const [editing, setEditing] = useState<TeamMember | null | undefined>();
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  if (!member.is_owner) return <Empty title="إدارة الفريق متاحة للمالك فقط" />;
  return (
    <>
      <PageHeading
        title="الفريق والصلاحيات"
        description="حدّد الجامعات والإجراءات المتاحة لكل مساهم."
      >
        <button
          className="btn primary"
          onClick={() => {
            setEditing(null);
            setError("");
          }}
        >
          إضافة مساهم
        </button>
      </PageHeading>
      {pending.data && pending.data.length > 0 && (
        <section className="panel">
          <h2>طلبات انضمام بانتظار اعتمادك ({pending.data.length})</h2>
          <ul className="pending-list">
            {pending.data.map((p) => (
              <li key={p.user_id}>
                <div>
                  <strong>{p.display_name}</strong>
                  <small className="block muted" dir="ltr">
                    {p.email}
                  </small>
                  <small className="muted">
                    {p.email_confirmed ? "البريد مؤكد" : "لم يؤكد بريده بعد"}
                  </small>
                </div>
                <button
                  className="btn secondary compact"
                  onClick={() => {
                    setError("");
                    setEditing({
                      user_id: "",
                      display_name: p.display_name,
                      email: p.email,
                      is_enabled: true,
                      can_edit: true,
                      can_publish: false,
                      can_delete: false,
                      university_ids: [],
                    });
                  }}
                >
                  مراجعة واعتماد
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">
            الاعتماد يفتح نموذج الصلاحيات؛ لا يحصل المساهم على أي وصول قبل حفظه.
            تجاهل الطلب يبقيه بلا صلاحية.
          </p>
        </section>
      )}
      <section className="panel">
        {q.isPending ? (
          <Loading />
        ) : q.error ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <Empty title="لم يُضف مساهمون بعد" />
        ) : (
          <div className="table-wrap stack">
            <table>
              <thead>
                <tr>
                  <th>المساهم</th>
                  <th>الجامعات</th>
                  <th>الصلاحيات</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((m) => (
                  <tr key={m.user_id}>
                    <td className="cell-main">
                      <strong>{m.display_name || m.email}</strong>
                      <small className="block" dir="ltr">
                        {m.email}
                      </small>
                    </td>
                    <td data-label="الجامعات">{m.university_ids?.length || 0}</td>
                    <td data-label="الصلاحيات">
                      {[
                        m.can_edit && "تعديل",
                        m.can_publish && "نشر",
                        m.can_delete && "حذف",
                      ]
                        .filter(Boolean)
                        .join("، ") || "عرض فقط"}
                    </td>
                    <td className="cell-status">{m.is_enabled ? "مفعّل" : "موقوف"}</td>
                    <td className="cell-actions">
                      <button
                        className="text-btn"
                        onClick={() => {
                          setEditing(m);
                          setError("");
                        }}
                      >
                        تعديل
                      </button>
                      {m.is_enabled && (
                        <button
                          className="text-btn error-text"
                          onClick={() => setRemoving(m)}
                        >
                          إيقاف
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
      <Modal
        open={editing !== undefined}
        title="صلاحيات المساهم"
        onClose={() => {
          if (!busy) setEditing(undefined);
        }}
      >
        {editing !== undefined && (
          <form
            key={editing?.user_id || "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await rpc("guide_set_member_details", {
                  target_email: String(f.get("email")).trim(),
                  display_name: String(f.get("name")).trim(),
                  allow_edit: f.has("edit"),
                  allow_publish: f.has("publish"),
                  allow_delete: f.has("delete"),
                  active: f.has("active"),
                  assigned_ids: f.getAll("university"),
                });
                await queryClient.invalidateQueries({ queryKey: ["team"] });
                await queryClient.invalidateQueries({
                  queryKey: ["team-pending"],
                });
                setEditing(undefined);
                toast("تم حفظ صلاحيات المساهم");
              } catch (err) {
                setError(friendly(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="الاسم">
              <input
                name="name"
                defaultValue={editing?.display_name}
                minLength={2}
                maxLength={100}
                required
              />
            </Field>
            <Field label="إيميل قوقل للعضو (لازم يكون دخل الموقع بقوقل مرة وحدة على الأقل)">
              <input
                name="email"
                type="email"
                dir="ltr"
                required
                defaultValue={editing?.email}
                readOnly={!!editing?.email}
              />
            </Field>
            <div className="choices">
              {[
                ["active", "الحساب مفعّل", "is_enabled"],
                ["edit", "تعديل المحتوى", "can_edit"],
                ["publish", "نشر المحتوى", "can_publish"],
                ["delete", "الحذف والاستعادة", "can_delete"],
              ].map(([key, label, prop]) => (
                <label className="choice" key={key}>
                  <input
                    type="checkbox"
                    name={key}
                    defaultChecked={
                      editing
                        ? !!editing[prop as keyof TeamMember]
                        : key === "active"
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <h3>الجامعات المسندة</h3>
            {unis.error ? (
              <ErrorState error={unis.error} retry={() => unis.refetch()} />
            ) : (
              <div className="assignment-list">
                {unis.data
                  ?.filter((u) => !u.deleted_at)
                  .map((u) => (
                    <label className="choice" key={u.id}>
                      <input
                        name="university"
                        type="checkbox"
                        value={u.id}
                        defaultChecked={editing?.university_ids.includes(u.id)}
                      />
                      {String(u.name)}
                    </label>
                  ))}
              </div>
            )}
            {error && (
              <p role="alert" className="notice error">
                {error}
              </p>
            )}
            <button
              className="btn primary"
              disabled={busy || unis.isPending || !!unis.error}
            >
              {busy ? "جارٍ الحفظ…" : "حفظ الصلاحيات"}
            </button>
          </form>
        )}
      </Modal>
      <Confirm
        open={!!removing}
        busy={busy}
        title="إيقاف وصول المساهم"
        body={`إيقاف ${removing?.display_name || removing?.email} وإزالة الجامعات المسندة إليه؟`}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await rpc("guide_remove_member", { target_id: removing!.user_id });
            await q.refetch();
            setRemoving(null);
            toast("أُوقف وصول المساهم");
          } catch (e) {
            toast(friendly(e), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
