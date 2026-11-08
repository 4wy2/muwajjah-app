import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  MapPin,
  ExternalLink,
  Calculator,
  LockKeyhole,
  GraduationCap,
  Building2,
  BookOpen,
} from "lucide-react";
import {
  useUniversity,
  useUniversityContent,
  useCutoffs,
  useFeature,
  interest,
} from "../api/catalog";
import { useAuth } from "../auth/AuthProvider";
import { useScores, saveScore } from "../api/student";
import { UniversityLogo, FavoriteButton } from "../components/UniversityCard";
import {
  Empty,
  ErrorState,
  Loading,
  Field,
  ErrorBoundary,
  useToast,
} from "../components/ui";
import {
  calculate,
  date,
  housing,
  safeUrl,
  friendly,
  normalize,
} from "../lib/utils";
import type { Program, Track, Section } from "../lib/types";
export function CalculatorForm({
  tracks,
  universityId,
}: {
  tracks: Track[];
  universityId: string;
}) {
  const { user } = useAuth();
  const history = useScores();
  const toast = useToast();
  const [trackId, setTrackId] = useState("");
  const [values, setValues] = useState(["", "", ""]);
  const [edited, setEdited] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const track = tracks.find((t) => t.id === trackId) || tracks[0];
  useEffect(() => {
    setValues(["", "", ""]);
    setEdited(false);
    setResult(null);
  }, [user?.id]);
  useEffect(() => {
    const last = history.data?.[0];
    if (last && !edited)
      setValues([
        String(last.school),
        String(last.aptitude),
        String(last.achievement),
      ]);
  }, [history.data, edited]);
  if (!tracks.length)
    return <Empty title="لم تُضف مسارات موزونة لهذه الجامعة بعد" />;
  return (
    <div className="calculator panel">
      <div className="section-title">
        <Calculator />
        <h2>حاسبة الموزونة</h2>
      </div>
      <p className="muted">
        أدخل درجاتك وفق مسار القبول. النتيجة لا تضمن القبول.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const score = calculate(track, values);
            setResult(score);
            if (user) {
              setSaving(true);
              try {
                await saveScore({
                  user_id: user.id,
                  university_id: universityId,
                  track_id: track.id,
                  school: Number(values[0]),
                  aptitude: Number(values[1]),
                  achievement: Number(values[2]),
                  result: score,
                });
                toast("حُفظت الموزونة في حسابك");
              } catch (err) {
                toast("تم الحساب، وتعذر حفظ السجل. " + friendly(err), true);
              } finally {
                setSaving(false);
              }
            }
          } catch (err) {
            setError(friendly(err));
            setResult(null);
          }
        }}
      >
        <Field label="مسار القبول">
          <select
            value={track.id}
            onChange={(e) => {
              setTrackId(e.target.value);
              setResult(null);
              setError("");
            }}
          >
            {tracks.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name} · {t.academic_year}
              </option>
            ))}
          </select>
        </Field>
        <div className="score-fields">
          {["الثانوية", "القدرات", "التحصيلي"].map((label, i) => {
            const w = [
              track.school_weight,
              track.aptitude_weight,
              track.achievement_weight,
            ][i];
            return (
              <Field key={label} label={label + " (" + w + "%)"}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  required={Number(w) > 0}
                  disabled={Number(w) === 0}
                  value={values[i]}
                  placeholder="0 – 100"
                  onChange={(e) => {
                    setEdited(true);
                    setValues((v) =>
                      v.map((x, j) => (i === j ? e.target.value : x)),
                    );
                    setResult(null);
                  }}
                />
              </Field>
            );
          })}
        </div>
        <button className="btn primary" disabled={saving}>
          {saving ? "جارٍ الحفظ…" : "احسب موزونتي"}
        </button>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        {result !== null && (
          <output className="score-output">
            <span>نسبتك الموزونة</span>
            <strong>
              {result.toFixed(2)}
              <small>%</small>
            </strong>
          </output>
        )}
        {!user && (
          <p className="muted small">
            <Link to="/auth/login">سجّل دخولك</Link> لحفظ الدرجات والرجوع لها.
          </p>
        )}
      </form>
    </div>
  );
}
function Cutoffs({ id }: { id: string }) {
  const { user } = useAuth();
  const mode = useFeature("historical_cutoffs", user?.id);
  const allowed = mode.data === "free" || mode.data === "plus";
  const q = useCutoffs(id, allowed, user?.id);
  if (mode.isPending) return <Loading />;
  if (mode.error)
    return <ErrorState error={mode.error} retry={() => mode.refetch()} />;
  if (mode.data === "hidden")
    return <Empty title="النسب السابقة غير متاحة حاليًا" />;
  if (!allowed)
    return (
      <div className="plus-callout">
        <LockKeyhole size={30} />
        <span className="badge plus">مُوجّه بلس</span>
        <h2>صورة أوضح عن فرصك</h2>
        <p>تعرّف على نسب القبول السابقة ضمن مزايا بلس.</p>
        <Link
          to={user ? "/student/subscription" : "/auth/login"}
          className="btn primary"
        >
          {user ? "عرض الاشتراك" : "سجّل دخولك"}
        </Link>
      </div>
    );
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return q.data?.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>التخصص</th>
            <th>العام</th>
            <th>الفئة</th>
            <th>النسبة</th>
            <th>المصدر</th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((c) => (
            <tr key={c.id}>
              <td>{c.program_name}</td>
              <td>{c.academic_year}</td>
              <td>{c.gender}</td>
              <td>
                <strong className="accent">{c.ratio}%</strong>
              </td>
              <td>
                <Source url={c.source_url} verified={c.verified_on} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty title="لم تُنشر نسب سابقة بعد" />
  );
}
export function Source({
  url,
  verified,
}: {
  url: string;
  verified?: string | null;
}) {
  return (
    <div className="source">
      {safeUrl(url) && (
        <a href={safeUrl(url)} target="_blank" rel="noreferrer">
          المصدر الرسمي <ExternalLink size={13} />
        </a>
      )}
      {verified && <small>تاريخ التحقق: {date(verified)}</small>}
    </div>
  );
}
export default function University() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const u = useUniversity(id);
  const programs = useUniversityContent<Program>("programs", id);
  const tracks = useUniversityContent<Track>("tracks", id);
  const sections = useUniversityContent<Section>("sections", id);
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const cutoffFeature = useFeature("historical_cutoffs", user?.id);
  const canViewCutoffSections =
    !cutoffFeature.error &&
    (cutoffFeature.data === "free" || cutoffFeature.data === "plus");
  useEffect(() => {
    if (u.data) {
      document.title = u.data.name + " | مُوجّه";
      void interest("university", id);
    }
    return () => {
      document.title = "مُوجّه | دليلك للجامعة";
    };
  }, [id, u.data]);
  if (u.isPending) return <Loading />;
  if (u.error) return <ErrorState error={u.error} retry={() => u.refetch()} />;
  if (!u.data)
    return (
      <Empty title="الجامعة غير موجودة أو غير منشورة">
        <Link to="/">العودة للدليل</Link>
      </Empty>
    );
  const uni = u.data;
  const filtered =
    programs.data?.filter((p) =>
      normalize(p.name + " " + p.college).includes(normalize(search)),
    ) || [];
  const colleges = [
    ...new Set(filtered.map((p) => p.college || "تخصصات أخرى")),
  ];
  return (
    <>
      <div className="breadcrumbs">
        <Link to="/">دليل الجامعات</Link>
        <span>/</span>
        <span>{uni.name}</span>
      </div>
      <section className="university-header">
        <div className="university-identity">
          <UniversityLogo university={uni} />
          <div>
            <span className="badge">{uni.type}</span>
            <h1>{uni.name}</h1>
            <p>
              <MapPin size={17} />
              {[uni.city, uni.region].filter(Boolean).join("، ")}
            </p>
          </div>
        </div>
        <div className="actions">
          <FavoriteButton kind="university" id={id} label={uni.name} />
          {safeUrl(uni.website_url) && (
            <a
              className="btn secondary"
              href={safeUrl(uni.website_url)}
              target="_blank"
              rel="noreferrer"
            >
              الموقع الرسمي <ExternalLink size={16} />
            </a>
          )}
        </div>
      </section>
      <nav className="tabs" aria-label="أقسام الجامعة">
        {[
          ["overview", "عن الجامعة"],
          ["programs", "التخصصات"],
          ["admission", "مسارات القبول"],
          ["calculator", "حاسبة الموزونة"],
          ["cutoffs", "النسب السابقة"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={tab === key ? "page" : undefined}
            className={tab === key ? "active" : ""}
            onClick={() => setParams({ tab: key })}
          >
            {label}
          </button>
        ))}
      </nav>
      <ErrorBoundary key={tab}>
        {tab === "overview" ? (
          <div className="detail-grid">
            <section className="panel">
              <div className="section-title">
                <BookOpen />
                <h2>الجامعة في لمحة</h2>
              </div>
              <p className="prewrap">
                {uni.description || "لم تُضف نبذة الجامعة بعد."}
              </p>
              <Source url={uni.source_url} verified={uni.verified_on} />
              {sections.isPending ? (
                <Loading />
              ) : sections.error ? (
                <ErrorState
                  error={sections.error}
                  retry={() => sections.refetch()}
                />
              ) : (
                sections.data
                  ?.filter(
                    (s) =>
                      s.feature_key !== "historical_cutoffs" ||
                      canViewCutoffSections,
                  )
                  .map((s) => (
                    <section className="detail-section" key={s.id}>
                      <h3>{s.title}</h3>
                      <p className="prewrap">{s.content}</p>
                      <Source url={s.source_url} verified={s.verified_on} />
                    </section>
                  ))
              )}
            </section>
            <aside>
              <section className="panel housing-panel">
                <Building2 />
                <h2>السكن الجامعي</h2>
                <strong>{housing(uni.housing_status)}</strong>
                <p>{uni.housing_note}</p>
                <Source
                  url={uni.housing_source_url}
                  verified={uni.housing_verified_on}
                />
              </section>
              <section className="panel mini-cta">
                <Calculator />
                <h3>وين توصل موزونتك؟</h3>
                <p>احسب نسبتك وفق المسارات المنشورة للجامعة.</p>
                <button
                  className="btn primary"
                  onClick={() => setParams({ tab: "calculator" })}
                >
                  احسب الآن
                </button>
              </section>
            </aside>
          </div>
        ) : tab === "programs" ? (
          <section className="panel">
            <div className="section-title">
              <GraduationCap />
              <h2>التخصصات والكليات</h2>
            </div>
            <input
              aria-label="ابحث عن تخصص"
              type="search"
              placeholder="اسم التخصص أو الكلية"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {programs.isPending ? (
              <Loading />
            ) : programs.error ? (
              <ErrorState
                error={programs.error}
                retry={() => programs.refetch()}
              />
            ) : !filtered.length ? (
              <Empty title="لا توجد تخصصات مطابقة" />
            ) : (
              colleges.map((c) => (
                <section className="program-group" key={c}>
                  <h3>{c}</h3>
                  <div className="program-grid">
                    {filtered
                      .filter((p) => (p.college || "تخصصات أخرى") === c)
                      .map((p) => (
                        <article key={p.id} className="program-item">
                          <div>
                            <h4>{p.name}</h4>
                            <p>
                              {[p.degree, p.gender, p.campus]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                            {p.admission_route && (
                              <small>{p.admission_route}</small>
                            )}
                          </div>
                          <FavoriteButton
                            kind="program"
                            id={p.id}
                            label={p.name}
                          />
                        </article>
                      ))}
                  </div>
                </section>
              ))
            )}
          </section>
        ) : tab === "admission" ? (
          <section className="panel">
            <h2>مسارات القبول</h2>
            {tracks.isPending ? (
              <Loading />
            ) : tracks.error ? (
              <ErrorState error={tracks.error} retry={() => tracks.refetch()} />
            ) : !tracks.data?.length ? (
              <Empty title="لم تُضف مسارات القبول بعد" />
            ) : (
              tracks.data.map((t) => (
                <article className="track" key={t.id}>
                  <div className="row-between">
                    <h3>{t.name}</h3>
                    <span className="badge">{t.academic_year}</span>
                  </div>
                  <p>{t.gender}</p>
                  <div className="weights">
                    <span>
                      الثانوية <b>{t.school_weight}%</b>
                    </span>
                    <span>
                      القدرات <b>{t.aptitude_weight}%</b>
                    </span>
                    <span>
                      التحصيلي <b>{t.achievement_weight}%</b>
                    </span>
                  </div>
                  <p className="prewrap">{t.requirements}</p>
                  <Source url={t.source_url} verified={t.verified_on} />
                </article>
              ))
            )}
          </section>
        ) : tab === "calculator" ? (
          tracks.isPending ? (
            <Loading />
          ) : tracks.error ? (
            <ErrorState error={tracks.error} retry={() => tracks.refetch()} />
          ) : (
            <CalculatorForm tracks={tracks.data || []} universityId={id} />
          )
        ) : tab === "cutoffs" ? (
          <section className="panel">
            <h2>نسب القبول السابقة</h2>
            <Cutoffs id={id} />
          </section>
        ) : (
          <Empty title="القسم غير موجود" />
        )}
      </ErrorBoundary>
    </>
  );
}
