import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useCatalog, useFeature, missingSearch } from "../api/catalog";
import { useAuth } from "../auth/AuthProvider";
import { normalize, number } from "../lib/utils";
import { Empty, ErrorState, useDebounce } from "../components/ui";
import UniversityCard from "../components/UniversityCard";

// Search-first catalogue. Owner decision: no region filter, no program search,
// no housing filter, no program counts on cards. Region stays visible as data.
export default function Home() {
  const q = useCatalog();
  const { user } = useAuth();
  const feature = useFeature("comparison", user?.id);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") || "");
  const term = useDebounce(search);
  const type = params.get("type") || "";
  const [limit, setLimit] = useState(24);
  const universities = q.data || [];
  const types = useMemo(
    () => [...new Set(universities.map((u) => u.type).filter(Boolean))].sort(),
    [q.data],
  );
  const results = useMemo(
    () =>
      universities.filter(
        (u) =>
          (!term ||
            normalize(u.name + " " + u.city + " " + u.region).includes(
              normalize(term),
            )) &&
          (!type || u.type === type),
      ),
    [q.data, term, type],
  );
  useEffect(() => {
    setLimit(24);
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
    if (term.trim() && q.isSuccess && results.length === 0 && !type) {
      const t = setTimeout(() => void missingSearch(normalize(term)), 1000);
      return () => clearTimeout(t);
    }
  }, [term, q.isSuccess, results.length, type]);
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
      <div className="catalog-head">
        <h1>دليل الجامعات السعودية</h1>
        <p>معلومات القبول والتخصصات والسكن لكل جامعة، في مكان واحد.</p>
      </div>
      <div className="search-box">
        <Search size={19} aria-hidden="true" />
        <input
          aria-label="ابحث باسم الجامعة أو المدينة"
          type="search"
          placeholder="ابحث باسم الجامعة أو المدينة"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="results-bar">
        {types.length > 1 && (
          <div className="type-chips" role="group" aria-label="نوع الجامعة">
            {["", ...types].map((t) => (
              <button
                key={t || "all"}
                className={"chip-btn" + (type === t ? " active" : "")}
                aria-pressed={type === t}
                onClick={() => setType(t)}
              >
                {t || "الكل"}
              </button>
            ))}
          </div>
        )}
        <span className="muted result-info" role="status">
          {q.isSuccess ? number(results.length) + " جامعة" : ""}
        </span>
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
                compare={!!feature.data && feature.data !== "hidden"}
              />
            ))}
          </div>
          {limit < results.length && (
            <div className="load-more">
              <button
                className="btn secondary compact"
                onClick={() => setLimit((l) => l + 24)}
              >
                عرض المزيد ({number(results.length - limit)})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
