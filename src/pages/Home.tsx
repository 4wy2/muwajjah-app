import { useEffect, useMemo, useState } from "react";
import {
  Search,
  SlidersHorizontal,
  GraduationCap,
  MapPin,
  ArrowUpLeft,
  Compass,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useCatalog, useFeature, missingSearch } from "../api/catalog";
import { useAuth } from "../auth/AuthProvider";
import { normalize, number } from "../lib/utils";
import { Empty, ErrorState, Loading, useDebounce } from "../components/ui";
import UniversityCard from "../components/UniversityCard";
export default function Home() {
  const q = useCatalog();
  const { user } = useAuth();
  const feature = useFeature("comparison", user?.id);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const term = useDebounce(search);
  const type = params.get("type") || "";
  const region = params.get("region") || "";
  const [limit, setLimit] = useState(12);
  const [filters, setFilters] = useState(false);
  const universities = q.data || [];
  const regions = useMemo(
    () =>
      [...new Set(universities.map((u) => u.region).filter(Boolean))].sort(),
    [q.data],
  );
  const types = useMemo(
    () => [...new Set(universities.map((u) => u.type).filter(Boolean))],
    [q.data],
  );
  const results = useMemo(
    () =>
      universities.filter(
        (u) =>
          (!term ||
            normalize(u.name + " " + u.city).includes(normalize(term))) &&
          (!type || u.type === type) &&
          (!region || u.region === region),
      ),
    [q.data, term, type, region],
  );
  const update = (key: string, value: string) => {
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  };
  useEffect(() => {
    setLimit(12);
    setParams(
      (p) => {
        if (term) p.set("q", term);
        else p.delete("q");
        return p;
      },
      { replace: true },
    );
  }, [term, setParams]);
  useEffect(() => {
    if (
      term.trim() &&
      q.isSuccess &&
      results.length === 0 &&
      !type &&
      !region
    ) {
      const t = setTimeout(() => void missingSearch(normalize(term)), 1000);
      return () => clearTimeout(t);
    }
  }, [term, q.isSuccess, results.length, type, region]);
  return (
    <>
      <div className="home-intro">
        <div>
          <span className="eyebrow">
            <span className="tiny-line" /> دليلك للجامعات السعودية
          </span>
          <h1>
            خطوتك الجاية، <span>أوضح.</span>
          </h1>
          <p>اكتشف الجامعات والتخصصات، واختر المسار المناسب لك.</p>
        </div>
        <div className="intro-counter">
          <GraduationCap />
          <strong>{q.isSuccess ? number(universities.length) : "—"}</strong>
          <span>جامعة في الدليل</span>
        </div>
      </div>
      <div className="catalog-layout">
        <aside className={"filters " + (filters ? "mobile-open" : "")}>
          <div className="filter-title">
            <SlidersHorizontal size={19} />
            <h2>حدّد خياراتك</h2>
          </div>
          <div className="filter-group">
            <h3>نوع الجامعة</h3>
            {["", ...types].map((t) => (
              <label className="choice" key={t}>
                <input
                  type="radio"
                  name="type"
                  checked={type === t}
                  onChange={() => update("type", t)}
                />
                <span>{t || "جميع الجامعات"}</span>
              </label>
            ))}
          </div>
          <div className="filter-group">
            <h3>المنطقة</h3>
            <select
              aria-label="المنطقة"
              value={region}
              onChange={(e) => update("region", e.target.value)}
            >
              <option value="">كل المناطق</option>
              {regions.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          {(type || region || search) && (
            <button
              className="text-btn"
              onClick={() => {
                setSearch("");
                setParams({});
                setLimit(12);
              }}
            >
              إعادة ضبط الفلاتر
            </button>
          )}
          <div className="sidebar-note">
            <Compass size={26} />
            <h3>كل الخيارات قدّامك</h3>
            <p>احفظ الجامعات التي تهمك، وارجع لها في أي وقت.</p>
            <Link to="/student/favorites">
              اذهب إلى مفضلتي <ArrowUpLeft size={17} />
            </Link>
          </div>
        </aside>
        <section className="catalog-content" aria-label="الجامعات">
          <div className="search-box">
            <Search size={21} />
            <input
              aria-label="البحث باسم الجامعة أو المدينة"
              type="search"
              placeholder="ابحث باسم الجامعة أو المدينة…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="search-hint">
              <MapPin size={14} /> السعودية
            </span>
          </div>
          <div className="results-bar">
            <h2>
              استكشف الجامعات{" "}
              <span>{q.isSuccess ? number(results.length) : "—"}</span>
            </h2>
            <button
              className="filter-toggle btn secondary compact"
              onClick={() => setFilters(!filters)}
            >
              <SlidersHorizontal size={16} /> تصفية
            </button>
            <span className="muted result-info">مرتبة حسب الاسم</span>
          </div>
          {q.isPending ? (
            <Loading />
          ) : q.error ? (
            <ErrorState error={q.error} retry={() => q.refetch()} />
          ) : results.length === 0 ? (
            <Empty title="ما لقينا جامعات مطابقة">
              <p>جرّب اسمًا آخر أو غيّر خيارات التصفية.</p>
            </Empty>
          ) : (
            <>
              <div className="university-grid">
                {results.slice(0, limit).map((u) => (
                  <UniversityCard
                    university={u}
                    key={u.id}
                    compare={!!feature.data && feature.data !== "hidden"}
                  />
                ))}
              </div>
              <div className="load-more">
                <span role="status">
                  عرض {number(Math.min(limit, results.length))} من{" "}
                  {number(results.length)} جامعة
                </span>
                {limit < results.length && (
                  <button
                    className="btn secondary"
                    onClick={() => setLimit((l) => l + 12)}
                  >
                    عرض المزيد
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
