import { usePreferences } from "../lib/store";
import { useUpgradeSheet } from "../lib/store";
import { track } from "../lib/analytics";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  MapPin,
  ExternalLink,
  Calculator,
  LockKeyhole,
  Share2,
  Info,
  MapPinned,
  Award,
  TrendingUp,
  BriefcaseBusiness,
  ClipboardCheck,
  GraduationCap,
  History,
  BedDouble,
  Sparkles,
  TriangleAlert,
  Layers,
  Phone,
  AtSign,
  Users,
  Ban,
  type LucideIcon,
} from "lucide-react";
import {
  useUniversity,
  useUniversityContent,
  useCutoffs,
  useFeature,
  interest,
} from "../api/catalog";
import { useAuth, useMember } from "../auth/AuthProvider";
import { useScores, saveScore, useSaving } from "../api/student";
import { UniversityLogo, FavoriteButton } from "../components/UniversityCard";
import { ReportError } from "../components/ReportError";
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
  number,
  isWeighted,
  hostOf,
  place,
} from "../lib/utils";
import { groupSections, slotOrder, type SlotKey } from "../lib/sections";
import type { Program, Track, Section, University as Uni } from "../lib/types";
import { RichText, sameText } from "../components/RichText";

// Placeholders meaning "not stated" are stored honestly but never shown as data.
const shown = (v?: string | null) => {
  const s = (v || "").trim();
  return s && !/^غير (محدد|محددة|مذكور)/.test(s) ? s : "";
};
// Shows a source link only when one exists. "موقع الجامعة" is used only when the
// link points at the university's own website; nothing else is called official.
export function Source({
  url,
  verified,
  website,
}: {
  url: string;
  verified?: string | null;
  website?: string;
}) {
  const href = safeUrl(url);
  if (!href && !verified) return null;
  const own = !!href && !!website && hostOf(href) === hostOf(website);
  return (
    <div className="source">
      {href && (
        <a href={href} target="_blank" rel="noreferrer">
          {own ? "موقع الجامعة" : "المصدر"} <ExternalLink size={12} />
        </a>
      )}
      {verified && <small>رُوجع في {date(verified)}</small>}
    </div>
  );
}

// Each part of the profile gets its own mark so a student scrolling a long
// page can tell sections apart at a glance.
const BLOCK_ICON: Record<string, LucideIcon> = {
  about: Info,
  branches: MapPinned,
  ranking: Award,
  competition: TrendingUp,
  employment: BriefcaseBusiness,
  admission: ClipboardCheck,
  programs: GraduationCap,
  cutoffs: History,
  housing: BedDouble,
  environment: Sparkles,
  drawbacks: TriangleAlert,
  extra: Layers,
  contact: Phone,
  social: AtSign,
};
function Block({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const Icon = BLOCK_ICON[id] || Layers;
  return (
    <section
      className={"profile-block" + (id === "drawbacks" ? " tone-warn" : "")}
      id={id}
      aria-labelledby={id + "-h"}
    >
      <h2 id={id + "-h"}>
        <span className="block-icon" aria-hidden="true">
          <Icon size={19} />
        </span>
        {title}
      </h2>
      <div className="block-body">{children}</div>
    </section>
  );
}

function SectionList({
  items,
  website,
  showTitles,
  blockTitle,
}: {
  items: Section[];
  website: string;
  showTitles: boolean;
  // A section titled like its block ("شروط القبول" under "شروط القبول
  // ومساراته") does not repeat the heading.
  blockTitle?: string;
}) {
  return (
    <>
      {items.map((s) => (
        <div className="flex-section" key={s.id}>
          {showTitles && !(blockTitle && blockTitle.includes(s.title.trim())) && (
            <h3>{s.title}</h3>
          )}
          <RichText text={s.content} />
          <Source url={s.source_url} verified={s.verified_on} website={website} />
        </div>
      ))}
    </>
  );
}

export function CalculatorForm({
  tracks,
  universityId,
  website,
}: {
  tracks: Track[];
  universityId: string;
  website?: string;
}) {
  const { user } = useAuth();
  const history = useScores();
  const toast = useToast();
  const weighted = tracks.filter(isWeighted);
  const [trackId, setTrackId] = useState("");
  const [values, setValues] = useState(["", "", ""]);
  const [edited, setEdited] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingFeature = useSaving("score_saving").state;
  const canSave = !!user && (savingFeature === "free" || savingFeature === "plus");
  const track = weighted.find((t) => t.id === trackId) || weighted[0];
  useEffect(() => {
    setValues(["", "", ""]);
    setEdited(false);
    setResult(null);
  }, [user?.id]);
  // Prefill only from a saved result for the same track; never invent grades.
  useEffect(() => {
    if (!track || edited) return;
    const last = history.data?.find((h) => h.track_id === track.id);
    setValues(
      last
        ? [String(last.school), String(last.aptitude), String(last.achievement)]
        : ["", "", ""],
    );
  }, [history.data, edited, track?.id]);
  if (!track) return null;
  return (
    <div className="calculator">
      <h3>
        <Calculator size={18} /> احسب موزونتك
      </h3>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const score = calculate(track, values);
            setResult(score);
            if (user && canSave) {
              setSaving(true);
              try {
                await saveScore({
                  user_id: user.id,
                  university_id: universityId,
                  track_id: track.id,
                  school: Number(values[0] || 0),
                  aptitude: Number(values[1] || 0),
                  achievement: Number(values[2] || 0),
                  result: score,
                });
                toast("حُفظت النتيجة في حسابك");
              } catch (err) {
                toast("تم الحساب، وتعذر حفظ النتيجة. " + friendly(err), true);
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
        {weighted.length > 1 && (
          <Field label="المسار">
            <select
              value={track.id}
              onChange={(e) => {
                setTrackId(e.target.value);
                setEdited(false);
                setResult(null);
                setError("");
              }}
            >
              {weighted.map((t) => (
                <option value={t.id} key={t.id}>
                  {[t.name, shown(t.gender), shown(t.academic_year)].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="score-fields">
          {["الثانوية", "القدرات", "التحصيلي"].map((label, i) => {
            const w = Number(
              [track.school_weight, track.aptitude_weight, track.achievement_weight][i],
            );
            if (w === 0) return null;
            return (
              <Field key={label} label={label + " (" + w + "%)"}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputMode="decimal"
                  dir="ltr"
                  required
                  value={values[i]}
                  placeholder="0 – 100"
                  onChange={(e) => {
                    setEdited(true);
                    setValues((v) => v.map((x, j) => (i === j ? e.target.value : x)));
                    setResult(null);
                  }}
                />
              </Field>
            );
          })}
        </div>
        <div className="calc-actions">
          <button className="btn primary compact" disabled={saving}>
            {saving ? "جارٍ الحفظ…" : "احسب"}
          </button>
          {result !== null && (
            <output className="score-output">
              نسبتك الموزونة <strong dir="ltr">{result.toFixed(2)}%</strong>
            </output>
          )}
        </div>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <p className="muted small">
          النتيجة محسوبة وفق الأوزان المنشورة، ولا تعني ضمان القبول.
          {!user && savingFeature === "login" && (
            <>
              {" "}
              <Link to={"/auth/login?next=" + encodeURIComponent(location.pathname)}>سجّل دخولك</Link> لحفظ نتائجك.
            </>
          )}
          {savingFeature === "locked" && result !== null && (
            <>
              {" "}
              <button
                type="button"
                className="text-btn inline"
                onClick={() => useUpgradeSheet.getState().show("score_saving")}
              >
                احفظ نتائجك في حسابك
              </button>
            </>
          )}
        </p>
        {/* Where these weights come from, or a note when that is not filled in yet. */}
        {unverified(track) ? (
          <UnverifiedNote website={website} />
        ) : (
          <Source url={track.source_url} verified={track.verified_on} website={website} />
        )}
      </form>
    </div>
  );
}

function TrackItem({
  t,
  website,
  hideSource,
}: {
  t: Track;
  website: string;
  hideSource?: boolean;
}) {
  const weighted = isWeighted(t);
  return (
    <article className="track">
      <div className="track-head">
        <h3>{t.name}</h3>
        {[shown(t.gender), shown(t.academic_year)].filter(Boolean).map((x) => (
          <span className="chip" key={x}>
            {x}
          </span>
        ))}
      </div>
      {weighted && <WeightBar t={t} />}
      {weighted && unverified(t) && <UnverifiedNote website={website} />}
      <RichText text={t.requirements} />
      {!hideSource && (
        <Source url={t.source_url} verified={t.verified_on} website={website} />
      )}
    </article>
  );
}

// A track published before its source and check date were filled in.
const unverified = (t: Track) => !String(t.source_url || "").trim() || !t.verified_on;
function UnverifiedNote({ website }: { website?: string }) {
  return (
    <p className="notice caution small" role="note">
      هذي الأوزان منقولة من أدلة القبول وما راجعناها على دليل هذي السنة للحين. تأكد منها
      {website ? (
        <>
          {" "}
          في{" "}
          <a href={website} target="_blank" rel="noopener noreferrer">
            موقع الجامعة
          </a>
        </>
      ) : (
        " من موقع الجامعة"
      )}{" "}
      قبل ما تعتمد عليها.
    </p>
  );
}

// The weights as one bar: how much of the weighted score each test carries.
function WeightBar({ t }: { t: Track }) {
  const parts = (
    [
      ["الثانوية", Number(t.school_weight), "w1"],
      ["القدرات", Number(t.aptitude_weight), "w2"],
      ["التحصيلي", Number(t.achievement_weight), "w3"],
    ] as [string, number, string][]
  ).filter(([, w]) => w > 0);
  const label = parts.map(([l, w]) => l + " " + w + "%").join("، ");
  return (
    <div className="weights">
      <div className="weight-bar" role="img" aria-label={"الأوزان: " + label}>
        {parts.map(([l, w, c]) => (
          <span key={l} className={c} style={{ flexGrow: w }} />
        ))}
      </div>
      <ul className="weight-legend">
        {parts.map(([l, w, c]) => (
          <li key={l}>
            <i className={c} aria-hidden="true" />
            {l} <b dir="ltr">{w}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Programs({ programs }: { programs: Program[] }) {
  const [search, setSearch] = useState("");
  const filtered = programs.filter((p) =>
    normalize(p.name + " " + p.college).includes(normalize(search)),
  );
  const groups = useMemo(() => {
    const m = new Map<string, Program[]>();
    for (const p of filtered) {
      const k = p.college?.trim() || "";
      m.set(k, [...(m.get(k) || []), p]);
    }
    // Named colleges first; ungrouped programs last.
    return [...m.entries()].sort(([a], [b]) => (!a ? 1 : !b ? -1 : 0));
  }, [filtered]);
  const many = programs.length > 15;
  const meta = (p: Program) =>
    [p.degree, p.gender, p.campus]
      .map((x) => (x || "").trim())
      .filter((x) => x && x !== "غير محدد");
  return (
    <>
      {many && (
        <input
          className="inline-search"
          aria-label="ابحث عن تخصص"
          type="search"
          placeholder="ابحث باسم التخصص أو الكلية"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}
      {!filtered.length ? (
        <p className="muted">لا توجد تخصصات مطابقة.</p>
      ) : (
        groups.map(([college, list]) => (
          <details
            className="program-group"
            key={college || "_"}
            open={!many || !!search}
          >
            <summary>
              <span>{college || (groups.length > 1 ? "تخصصات أخرى" : "التخصصات")}</span>
              <small>{list.length}</small>
            </summary>
            <ul className="program-list">
              {list.map((p) => (
                <li key={p.id}>
                  <div>
                    <span className="program-name">{p.name}</span>
                    {meta(p).length > 0 && (
                      <small className="program-meta">{meta(p).join(" · ")}</small>
                    )}
                    {p.admission_route?.trim() && (
                      <small className="program-route">{p.admission_route}</small>
                    )}
                  </div>
                  <FavoriteButton kind="program" id={p.id} label={p.name} />
                </li>
              ))}
            </ul>
          </details>
        ))
      )}
    </>
  );
}

function Cutoffs({ id, sections, website }: { id: string; sections: Section[]; website: string }) {
  const { user } = useAuth();
  const mode = useFeature("historical_cutoffs", user?.id);
  const allowed = mode.data === "free" || mode.data === "plus";
  const q = useCutoffs(id, allowed, user?.id);
  // Hidden feature: the block does not exist at all (no "unavailable" notice).
  if (mode.isPending || mode.error || mode.data === "hidden" || !mode.data) return null;
  if (mode.data === "locked")
    return (
      <Block id="cutoffs" title="نسب القبول السابقة">
        <div className="plus-callout">
          <LockKeyhole size={22} />
          <p>نسب القبول السابقة تنفتح لك بعد ترقية حسابك.</p>
          <button className="btn secondary compact" onClick={() => useUpgradeSheet.getState().show("historical_cutoffs")}>
            اعرف المميزات
          </button>
        </div>
      </Block>
    );
  if (q.isPending) return null;
  if (q.error)
    return (
      <Block id="cutoffs" title="نسب القبول السابقة">
        <ErrorState error={q.error} retry={() => q.refetch()} />
      </Block>
    );
  const rows = q.data || [];
  if (!rows.length && !sections.length) return null;
  const hasGender = rows.some((c) => c.gender?.trim());
  const hasSource = rows.some((c) => safeUrl(c.source_url));
  return (
    <Block id="cutoffs" title="نسب القبول السابقة">
      {rows.length > 0 && (
        <div className="table-wrap">
          <table className="compact-table">
            <thead>
              <tr>
                <th>التخصص</th>
                <th>العام</th>
                {hasGender && <th>الفئة</th>}
                <th>النسبة</th>
                {hasSource && <th>المصدر</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td>{c.program_name}</td>
                  <td>{c.academic_year}</td>
                  {hasGender && <td>{c.gender}</td>}
                  <td>
                    <strong className="accent" dir="ltr">
                      {Number(c.ratio)}%
                    </strong>
                  </td>
                  {hasSource && (
                    <td>
                      <Source url={c.source_url} verified={c.verified_on} website={website} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SectionList items={sections} website={website} showTitles />
    </Block>
  );
}

function Housing({ uni, sections }: { uni: Uni; sections: Section[] }) {
  const label = housing(uni.housing_status);
  // The summary note is skipped when a housing section already says the same.
  const note = uni.housing_note?.trim() || "";
  const repeated = !!note && sections.some((s) => sameText(note, s.content || ""));
  if (!label && (!note || repeated)) return null;
  const status = uni.housing_status || "unknown";
  const Icon = status === "unavailable" ? Ban : status === "both" ? Users : BedDouble;
  return (
    <>
      {label && (
        <p className={"housing-status hs-" + status}>
          <span aria-hidden="true">
            <Icon size={20} />
          </span>
          {label}
        </p>
      )}
      {!repeated && <RichText text={note} />}
      <Source url={uni.housing_source_url} verified={uni.housing_verified_on} website={uni.website_url} />
    </>
  );
}

// Students mostly share links over WhatsApp: use the phone's share sheet when
// available, otherwise copy the link.
function ShareButton({ name }: { name: string }) {
  const toast = useToast();
  return (
    <button
      className="icon-btn"
      aria-label={"مشاركة صفحة " + name}
      title="مشاركة"
      onClick={async () => {
        const url = location.href.split("#")[0];
        try {
          if (navigator.share) {
            await navigator.share({ title: name + " | مُوجّه", url });
            return;
          }
          await navigator.clipboard.writeText(url);
          toast("نُسخ رابط الصفحة");
        } catch (e) {
          if ((e as Error)?.name !== "AbortError") toast("تعذر النسخ. انسخ الرابط من شريط المتصفح.", true);
        }
      }}
    >
      <Share2 size={17} />
    </button>
  );
}
function setDescription(text: string) {
  const el = document.querySelector('meta[name="description"]');
  if (el) el.setAttribute("content", text);
}
const DEFAULT_DESCRIPTION =
  "دليل الجامعات الحكومية في السعودية: شروط القبول، التخصصات، والسكن الجامعي لكل جامعة في صفحة واحدة.";

export default function University() {
  const { id = "" } = useParams();
  const [search] = useSearchParams();
  const member = useMember();
  // Team-only preview; for visitors the parameter is ignored.
  const preview = search.get("preview") === "1" && !!member.data?.is_enabled;
  const u = useUniversity(id, preview);
  const programs = useUniversityContent<Program>("programs", id, preview);
  const tracks = useUniversityContent<Track>("tracks", id, preview);
  const sections = useUniversityContent<Section>("sections", id, preview);
  const { user } = useAuth();
  const cutoffFeature = useFeature("historical_cutoffs", user?.id);
  const canViewCutoffSections =
    !cutoffFeature.error &&
    (cutoffFeature.data === "free" || cutoffFeature.data === "plus");
  useEffect(() => {
    if (u.data) {
      document.title = u.data.name + " | مُوجّه";
      setDescription(
        (u.data.description?.trim() || u.data.name + ": التخصصات وشروط القبول والسكن.").slice(0, 160),
      );
      if (!preview) {
        usePreferences.getState().addRecent(id);
        void interest("university", id);
        track("university_view", { university: u.data.name });
      }
    }
    return () => {
      document.title = "مُوجّه | دليلك للجامعة";
      setDescription(DEFAULT_DESCRIPTION);
    };
  }, [id, u.data]);
  // Links such as ?tab=admission (from the comparison page) open at that section.
  const [params] = useSearchParams();
  const target = params.get("tab");
  const ready = !!u.data && !programs.isPending && !tracks.isPending && !sections.isPending;
  useEffect(() => {
    if (!ready || !target) return;
    document.getElementById(target)?.scrollIntoView({ block: "start" });
  }, [ready, target]);
  if (u.isPending) return <Loading />;
  if (u.error) return <ErrorState error={u.error} retry={() => u.refetch()} />;
  if (!u.data)
    return (
      <Empty title="الجامعة غير موجودة أو غير منشورة">
        <Link to="/">العودة للدليل</Link>
      </Empty>
    );
  const uni = u.data;
  const web = uni.website_url;
  const groups = groupSections(
    (sections.data || []).filter(
      (s) => s.feature_key !== "historical_cutoffs" || canViewCutoffSections,
    ),
  );
  const take = (k: SlotKey) => groups.get(k) || [];
  const title = (k: SlotKey) => slotOrder.find((s) => s.key === k)!.title;
  // Show a flexible section's own title only when it differs from the block title.
  const flex = (k: SlotKey) => {
    const items = take(k);
    if (!items.length) return null;
    // A single section in a named slot is introduced by the slot title alone;
    // "extra" sections (fees, campus life…) always keep their own titles.
    const showTitles = items.length > 1 || k === "extra";
    return (
      <Block id={k} title={title(k)} key={k}>
        <SectionList items={items} website={web} showTitles={showTitles} blockTitle={title(k)} />
      </Block>
    );
  };
  const trackList = tracks.data || [];
  // One source line for the whole list when every track cites the same page.
  const sharedSource =
    trackList.length > 1 &&
    trackList.every(
      (t) =>
        t.source_url === trackList[0].source_url &&
        t.verified_on === trackList[0].verified_on,
    );
  const contentError = programs.error || tracks.error || sections.error;
  const blocks: ReactNode[] = [];
  for (const { key } of slotOrder) {
    if (key === "about") {
      if (uni.description?.trim() || take("about").length)
        blocks.push(
          <Block id="about" title={title("about")} key="about">
            <RichText text={uni.description} />
            <Source url={uni.source_url} verified={uni.verified_on} website={web} />
            <SectionList items={take("about")} website={web} showTitles />
          </Block>,
        );
    } else if (key === "admission") {
      if (trackList.length || take("admission").length)
        blocks.push(
          <Block id="admission" title={title("admission")} key="admission">
            <SectionList items={take("admission")} website={web} blockTitle={title("admission")} showTitles={take("admission").length > 1 || trackList.length > 0} />
            {trackList.map((t) => (
              <TrackItem t={t} key={t.id} website={web} hideSource={sharedSource} />
            ))}
            {sharedSource && (
              <div className="admission-source">
                <Source url={trackList[0].source_url} verified={trackList[0].verified_on} website={web} />
              </div>
            )}
            <ErrorBoundary>
              <CalculatorForm tracks={trackList} universityId={id} website={web} />
            </ErrorBoundary>
          </Block>,
        );
    } else if (key === "programs") {
      if (programs.data?.length)
        blocks.push(
          <Block id="programs" title={title("programs")} key="programs">
            <Programs programs={programs.data} />
          </Block>,
        );
    } else if (key === "cutoffs") {
      blocks.push(<Cutoffs id={id} key="cutoffs" sections={take("cutoffs")} website={web} />);
    } else if (key === "housing") {
      if (housing(uni.housing_status) || uni.housing_note?.trim() || take("housing").length)
        blocks.push(
          <Block id="housing" title={title("housing")} key="housing">
            <Housing uni={uni} sections={take("housing")} />
            <SectionList items={take("housing")} website={web} showTitles={take("housing").length > 1} />
          </Block>,
        );
    } else if (key === "contact") {
      if (safeUrl(web) || take("contact").length)
        blocks.push(
          <Block id="contact" title={title("contact")} key="contact">
            <SectionList items={take("contact")} website={web} showTitles={take("contact").length > 1} />
            {safeUrl(web) && (
              <p>
                <a href={safeUrl(web)} target="_blank" rel="noreferrer" dir="ltr">
                  {hostOf(web)} <ExternalLink size={13} />
                </a>
              </p>
            )}
          </Block>,
        );
    } else {
      const b = flex(key);
      if (b) blocks.push(b);
    }
  }
  const loadingContent = programs.isPending || tracks.isPending || sections.isPending;
  const glance = (
    [
      [trackList.length ? number(trackList.length) + " مسار قبول" : "", ClipboardCheck],
      [housing(uni.housing_status) || "", uni.housing_status === "unavailable" ? Ban : BedDouble],
    ] as [string, LucideIcon][]
  ).filter(([g]) => g);
  return (
    <article className="profile">
      {preview && (
        <p className="notice" role="note">
          معاينة للفريق: هذا ما سيظهر للطالب بعد نشر الجامعة ومحتواها.
        </p>
      )}
      <nav className="breadcrumbs" aria-label="مسار التنقل">
        <Link to="/">دليل الجامعات</Link>
        <span aria-hidden="true">/</span>
        <span>{uni.name}</span>
      </nav>
      <div className="profile-hero">
      <header className="profile-header">
        <UniversityLogo university={uni} />
        <div className="profile-id">
          <h1>{uni.name}</h1>
          <p className="profile-meta">
            {uni.type && <span className="badge">{uni.type}</span>}
            {(uni.city || uni.region) && (
              <span>
                <MapPin size={15} />
                {place(uni.city, uni.region)}
              </span>
            )}
          </p>
        </div>
      </header>
      <div className="hero-bar">
        {glance.length > 0 && (
          <ul className="glance" aria-label="نظرة سريعة">
            {glance.map(([g, Icon]) => (
              <li key={g}>
                <Icon size={15} aria-hidden="true" />
                {g}
              </li>
            ))}
          </ul>
        )}
        <div className="profile-actions">
          {safeUrl(web) && (
            <a
              className="btn secondary compact site-link"
              href={safeUrl(web)}
              target="_blank"
              rel="noreferrer"
              aria-label="موقع الجامعة"
            >
              <span className="lbl">موقع الجامعة</span> <ExternalLink size={15} />
            </a>
          )}
          <ShareButton name={uni.name} />
          <FavoriteButton kind="university" id={id} label={uni.name} />
        </div>
      </div>
      </div>
      {contentError && (
        <ErrorState
          error={contentError}
          retry={() => {
            void programs.refetch();
            void tracks.refetch();
            void sections.refetch();
          }}
        />
      )}
      {blocks}
      {loadingContent && <Loading />}
      {!loadingContent && !contentError && blocks.length === 1 && (
        <p className="muted">لم تُنشر تفاصيل هذه الجامعة بعد.</p>
      )}
      <ReportError universityId={id} name={uni.name} />
    </article>
  );
}
