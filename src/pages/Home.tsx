import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Lock,
  Landmark,
  BookOpen,
} from "lucide-react";

import { Link, useSearchParams } from "react-router-dom";
import { useProgramSearch } from "../api/commerce";
import { track } from "../lib/analytics";
import { useCatalog, useFeature, missingSearch } from "../api/catalog";
import { useAuth } from "../auth/AuthProvider";
import { normalize, number } from "../lib/utils";
import { Empty, ErrorState, useDebounce } from "../components/ui";
import UniversityCard from "../components/UniversityCard";

// Search-first catalogue. Owner decisions: no region filter, no housing filter,
// no program counts on cards. Searching by major is a paid feature
// (program_search): hidden while subscriptions are off, locked when they are on.
export default function Home() {
  const q = useCatalog();
  const { user } = useAuth();
  const feature = useFeature("comparison", user?.id);
  const majorFeature = useFeature("program_search", user?.id);
  const majorState = majorFeature.data || "hidden";
  const [params, setParams] = useSearchParams();
  const mode = params.get("by") === "major" && majorState !== "hidden" ? "major" : "uni";
  const [search, setSearch] = useState(params.get("q") || "");
  const term = useDebounce(search);
  const type = params.get("type") || "";
  const sort = params.get("sort") === "city" ? "city" : "name";
  const compareOn = !!feature.data && feature.data !== "hidden";
  const [limit, setLimit] = useState(30);
  const canSearchMajor = majorState === "free" || majorState === "plus";
  const majors = useProgramSearch(term, mode === "major" && canSearchMajor);
  useEffect(() => {
    if (mode === "major" && majors.isSuccess && term.trim().length >= 2)
      track("major_search", { term: term.trim().slice(0, 60), results: majors.data?.length || 0 });
  }, [mode, majors.isSuccess, term]);
  const setMode = (m: string) =>
    setParams(
      (p) => {
        if (m === "major") p.set("by", "major");
        else p.delete("by");
        return p;
      },
      { replace: true },
    );
  const universities = q.data || [];
  const types = useMemo(
    () => [...new Set(universities.map((u) => u.type).filter(Boolean))].sort(),
    [q.data],
  );
  const results = useMemo(() => {
    const t = normalize(term);
    const list = universities.filter(
      (u) =>
        (!t || normalize(u.name + " " + u.city + " " + u.region).includes(t)) &&
        (!type || u.type === type),
    );
    // Name matches first, then city/region matches; then the chosen order.
    const rank = (u: (typeof list)[number]) => (t && !normalize(u.name).includes(t) ? 1 : 0);
    const key = (u: (typeof list)[number]) =>
      sort === "city" ? (u.city || u.region || "ي") + " " + u.name : u.name.replace(/^(جامعة|الجامعة|كلية)\s+/, "");
    return [...list].sort(
      (a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b), "ar"),
    );
  }, [q.data, term, type, sort]);
  useEffect(() => {
    setLimit(30);
    setParams(
      (p) => {
        if (term) p.set("q", term);
        else p.delete("q");
        return p;
      },
      { replace: true },
    );
  }, [term, setParams]);
  // Coming back from a university page returns to the same place in the list.
  const scrollKey = "home-scroll:" + params.toString();
  useEffect(() => {
    if (!q.isSuccess) return;
    let saved = 0;
    try {
      saved = Number(sessionStorage.getItem(scrollKey) || 0);
    } catch {
      /* storage unavailable */
    }
    if (saved > 0) requestAnimationFrame(() => window.scrollTo(0, saved));
    return () => {
      try {
        sessionStorage.setItem(scrollKey, String(window.scrollY));
      } catch {
        /* storage unavailable */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isSuccess]);
  useEffect(() => {
    if (mode === "uni" && term.trim() && q.isSuccess && results.length === 0 && !type) {
      const t = setTimeout(() => void missingSearch(normalize(term)), 1000);
      return () => clearTimeout(t);
    }
  }, [term, q.isSuccess, results.length, type, mode]);
  const setSort = (v: string) =>
    setParams(
      (p) => {
        if (v === "city") p.set("sort", "city");
        else p.delete("sort");
        return p;
      },
      { replace: true },
    );
  const searching = !!term.trim() || !!type;
  const setType = (t: string) =>
    setParams(
      (p) => {
        if (t) p.set("type", t);
        else p.delete("type");
        return p;
      },
      { replace: true },
    );
  return (
    <div className="catalog">
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">دليل الجامعات السعودية</h1>
        <p className="hero-lead">
          القبول والتخصصات والسكن لكل جامعة حكومية، مرتّبة في صفحة وحدة.
        </p>
        {majorState !== "hidden" && (
          <div className="hero-modes" role="tablist" aria-label="نوع البحث">
            <button role="tab" aria-selected={mode === "uni"} className={mode === "uni" ? "active" : ""} onClick={() => setMode("uni")}>
              <Landmark size={16} aria-hidden="true" /> ابحث عن جامعة
            </button>
            <button role="tab" aria-selected={mode === "major"} className={mode === "major" ? "active" : ""} onClick={() => setMode("major")}>
              {majorState === "locked" ? <Lock size={16} aria-hidden="true" /> : <BookOpen size={16} aria-hidden="true" />} ابحث عن تخصص
            </button>
          </div>
        )}
        <div className="search-box hero-search" id="search">
          <Search size={20} aria-hidden="true" />
          <input
            aria-label={mode === "major" ? "ابحث باسم التخصص" : "ابحث باسم الجامعة أو المدينة"}
            type="search"
            placeholder={
              mode === "major"
                ? "اكتب التخصص، مثل: تمريض، هندسة كهربائية"
                : "اكتب اسم الجامعة أو المدينة"
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </section>
      {mode === "major" && (
        <MajorResults
          term={term}
          state={majorState}
          query={majors}
        />
      )}
      {mode === "uni" && (
      <>
      <div className="results-bar">
        <div className="results-tools">
          <span className="result-count" role="status">
            {q.isSuccess ? number(results.length) + (searching ? " نتيجة" : " جامعة") : ""}
          </span>
          <label className="sort-select">
            <span>ترتيب</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">حسب الاسم</option>
              <option value="city">حسب المدينة</option>
            </select>
          </label>
        </div>
      </div>
      {q.isPending ? (
        <div className="university-grid" aria-busy="true" aria-label="جارٍ تحميل الجامعات">
          {Array.from({ length: 8 }, (_, i) => (
            <div className="university-card skeleton" key={i} aria-hidden="true">
              <span className="sk sk-logo" />
              <span className="sk sk-line" />
              <span className="sk sk-line short" />
            </div>
          ))}
        </div>
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : results.length === 0 ? (
        <Empty title="لا توجد جامعات مطابقة">
          <p>جرّب اسمًا آخر أو مدينة أخرى.</p>
          {(term || type) && (
            <button
              className="text-btn"
              onClick={() => {
                setSearch("");
                setParams({});
              }}
            >
              عرض كل الجامعات
            </button>
          )}
        </Empty>
      ) : (
        <>
          <div className="university-grid">
            {results.slice(0, limit).map((u) => (
              <UniversityCard
                university={u}
                key={u.id}
                compare={compareOn}
              />
            ))}
          </div>
          {limit < results.length && (
            <div className="load-more">
              <button
                className="btn secondary compact"
                onClick={() => setLimit((l) => l + 30)}
              >
                عرض المزيد ({number(results.length - limit)})
              </button>
            </div>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

function MajorResults({
  term,
  state,
  query,
}: {
  term: string;
  state: string;
  query: ReturnType<typeof useProgramSearch>;
}) {
  if (state === "login")
    return (
      <div className="panel locked-panel">
        <Lock size={28} aria-hidden="true" />
        <h2>سجّل دخولك للبحث بالتخصص</h2>
        <p>اكتب التخصص اللي تبيه، وتطلع لك كل الجامعات اللي تدرّسه. متاح مجانًا لكل من يسجل دخوله.</p>
        <Link className="btn primary" to={"/auth/login?next=" + encodeURIComponent("/?by=major")}>
          تسجيل الدخول
        </Link>
      </div>
    );
  if (state !== "free" && state !== "plus")
    return (
      <div className="panel locked-panel">
        <Lock size={28} aria-hidden="true" />
        <h2>البحث بالتخصص من مزايا الحساب المُرقّى</h2>
        <p>اكتب التخصص اللي تبيه، وتطلع لك كل الجامعات اللي تدرّسه في مكان واحد.</p>
        <Link className="btn primary" to="/upgrade">
          اعرف المميزات
        </Link>
      </div>
    );
  if (term.trim().length < 2)
    return <p className="muted result-info">اكتب حرفين على الأقل من اسم التخصص.</p>;
  if (query.isPending) return <p className="muted result-info">جارٍ البحث…</p>;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const rows = query.data || [];
  if (!rows.length)
    return (
      <Empty title="ما لقينا تخصص بهذا الاسم">
        <p>جرّب كلمة أقصر أو اسمًا آخر للتخصص.</p>
      </Empty>
    );
  const groups = new Map<string, { name: string; city: string; items: typeof rows }>();
  for (const r of rows) {
    const g = groups.get(r.university_id) || { name: r.university_name, city: r.city, items: [] };
    g.items.push(r);
    groups.set(r.university_id, g);
  }
  return (
    <>
      <p className="muted result-info" role="status">
        {number(rows.length)} تخصص في {number(groups.size)} جامعة
      </p>
      <div className="major-results">
        {[...groups.entries()].map(([id, g]) => (
          <section className="panel major-group" key={id}>
            <h2>
              <Link to={"/universities/" + id}>{g.name}</Link>
              {g.city && <small className="muted"> · {g.city}</small>}
            </h2>
            <ul>
              {g.items.map((p) => (
                <li key={p.program_id}>
                  <strong>{p.program_name}</strong>
                  {[p.college, p.degree, p.gender, p.campus]
                    .map((x) => (x || "").trim())
                    .filter((x) => x && !/^غير (محدد|مذكور)/.test(x))
                    .map((x) => (
                      <span className="chip" key={x}>
                        {x}
                      </span>
                    ))}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
