import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMember, useAssignments } from "../auth/AuthProvider";
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

interface Person {
  user_id: string;
  email: string;
  display_name: string;
  is_enabled: boolean;
  can_edit: boolean;
  university_ids: string[];
}

// A partner's own team: people they add, limited to the partner's universities.
// The database enforces every limit; this page only shows them.
export default function PartnerTeam() {
  const member = useMember().data!;
  const mine = useAssignments();
  const unis = useAdminRows("universities");
  const team = useQuery({
    queryKey: ["partner-team"],
    queryFn: () => rpc<Person[]>("guide_partner_team"),
  });
  const [editing, setEditing] = useState<Person | null | undefined>();
  const [removing, setRemoving] = useState<Person | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  const myIds = new Set((mine.data || []).map((a) => a.university_id));
  const myUnis = (unis.data || []).filter((u) => !u.deleted_at && myIds.has(String(u.id)));
  const nameOf = (id: string) => String(myUnis.find((u) => u.id === id)?.name || "");

  return (
    <>
      <PageHeading
        title="فريقي"
        description="أضف اللي يشتغلون معك، وحدد لكل واحد الجامعات اللي يشتغل عليها من جامعاتك."
      >
        <button
          className="btn primary"
          onClick={() => {
            setEditing(null);
            setError("");
          }}
        >
          إضافة شخص
        </button>
      </PageHeading>
      <section className="panel">
        {team.isPending ? (
          <Loading />
        ) : team.error ? (
          <ErrorState error={team.error} retry={() => team.refetch()} />
        ) : !team.data?.length ? (
          <Empty title="ما أضفت أحد لفريقك بعد" />
        ) : (
          <div className="table-wrap stack">
            <table>
              <thead>
                <tr>
                  <th>الشخص</th>
                  <th>الجامعات</th>
                  <th>الصلاحية</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {team.data.map((p) => (
                  <tr key={p.user_id}>
                    <td className="cell-main">
                      <strong>{p.display_name || p.email}</strong>
                      <small className="block" dir="ltr">
                        {p.email}
                      </small>
                    </td>
                    <td data-label="الجامعات">
                      {p.university_ids.map(nameOf).filter(Boolean).join("، ") || "—"}
                    </td>
                    <td data-label="الصلاحية">{p.can_edit ? "تعديل" : "عرض فقط"}</td>
                    <td className="cell-status">{p.is_enabled ? "مفعّل" : "موقوف"}</td>
                    <td className="cell-actions">
                      <button
                        className="text-btn"
                        onClick={() => {
                          setEditing(p);
                          setError("");
                        }}
                      >
                        تعديل
                      </button>
                      {p.is_enabled && (
                        <button className="text-btn error-text" onClick={() => setRemoving(p)}>
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
        title={editing ? "تعديل صلاحيات الشخص" : "إضافة شخص لفريقك"}
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
                await rpc("guide_partner_set_member", {
                  target_email: String(f.get("email")).trim(),
                  display_name: String(f.get("name")).trim(),
                  allow_edit: f.has("edit"),
                  active: f.has("active"),
                  assigned_ids: f.getAll("university"),
                });
                await queryClient.invalidateQueries({ queryKey: ["partner-team"] });
                setEditing(undefined);
                toast("تم الحفظ");
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
            <Field label="إيميل قوقل (لازم يكون دخل الموقع بقوقل مرة وحدة على الأقل)">
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
              <label className="choice">
                <input type="checkbox" name="active" defaultChecked={editing ? editing.is_enabled : true} />
                الحساب مفعّل
              </label>
              <label className="choice">
                <input
                  type="checkbox"
                  name="edit"
                  disabled={!member.can_edit}
                  defaultChecked={!!editing?.can_edit}
                />
                يقدر يعدّل المحتوى
              </label>
            </div>
            {!member.can_edit && (
              <p className="muted small">صلاحيتك عرض فقط، فاللي تضيفهم يكونون عرض فقط.</p>
            )}
            <h3>الجامعات</h3>
            {mine.error || unis.error ? (
              <ErrorState error={mine.error || unis.error} retry={() => (mine.refetch(), unis.refetch())} />
            ) : !myUnis.length ? (
              <p className="muted small">ما عندك جامعات مسندة، اطلب من المالك يسند لك جامعات أول.</p>
            ) : (
              <div className="assignment-list">
                {myUnis.map((u) => (
                  <label className="choice" key={String(u.id)}>
                    <input
                      name="university"
                      type="checkbox"
                      value={String(u.id)}
                      defaultChecked={editing?.university_ids.includes(String(u.id))}
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
            <button className="btn primary" disabled={busy || mine.isPending || unis.isPending}>
              {busy ? "جارٍ الحفظ…" : "حفظ"}
            </button>
          </form>
        )}
      </Modal>
      <Confirm
        open={!!removing}
        busy={busy}
        title="إيقاف وصول الشخص"
        body={`إيقاف ${removing?.display_name || removing?.email} وإزالة جامعاته؟`}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          setBusy(true);
          try {
            await rpc("guide_partner_remove_member", { target_id: removing!.user_id });
            await team.refetch();
            setRemoving(null);
            toast("أُوقف وصوله");
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
