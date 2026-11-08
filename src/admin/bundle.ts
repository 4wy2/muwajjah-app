// Whole-university import ("bundle"): one JSON file per university, previewed
// against that university's existing content and saved as drafts.
//
// Supported input:
//   - muwajjah-university-v2 (documented in docs/IMPORT_FORMAT.md)
//   - muwajjah-university-v1 and close variants, converted by toV2() below.
// Pure functions only, so the behaviour is covered by unit tests.
import { specs, sanitize } from "./specs";
import { isWeighted, normalize } from "../lib/utils";
import type { ContentKind, Row } from "../lib/types";

export const BUNDLE_FORMAT = "muwajjah-university-v2";
export type ChildKind = "programs" | "tracks" | "sections" | "cutoffs";
export const CHILD_KINDS: ChildKind[] = ["programs", "tracks", "sections", "cutoffs"];
export type MergeMode = "fill" | "replace";

type Rec = Record<string, unknown>;
export interface Bundle {
  format: string;
  converted_from?: string;
  university: Rec;
  programs: Rec[];
  tracks: Rec[];
  sections: Rec[];
  cutoffs: Rec[];
  source: { url: string; reviewed_on: string };
  uncertain: { note: string; page?: string }[];
  warnings: string[];
}

// Keys a file may never set: ownership, permissions, ids and publication state
// are decided by the logged-in user and the server, never by an uploaded file.
const FORBIDDEN = new Set([
  "id",
  "university_id",
  "published",
  "deleted_at",
  "publication_excluded",
  "created_at",
  "legacy_key",
  "user_id",
  "is_owner",
  "is_enabled",
  "can_edit",
  "can_publish",
  "can_delete",
]);
// Review-only metadata kept on the preview row but never written to a column.
const META = ["page", "pdf_page", "uncertain", "note", "notes"];

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const pick = (r: Rec, ...keys: string[]) => {
  for (const k of keys) if (str(r[k]) !== "") return r[k];
  return undefined;
};
const list = (v: unknown): Rec[] =>
  Array.isArray(v) ? v.filter((x) => x && typeof x === "object" && !Array.isArray(x)) : [];
const num = (v: unknown) => {
  if (v === null || v === undefined || str(v) === "") return undefined;
  const n = Number(String(v).replace("%", "").replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))));
  return Number.isFinite(n) ? n : NaN;
};

function clean(r: Rec, warnings: string[], where: string) {
  const out: Rec = {};
  for (const [k, v] of Object.entries(r)) {
    if (FORBIDDEN.has(k)) {
      warnings.push(`تجاهلنا الحقل «${k}» في ${where}: لا يُقبل من ملف الاستيراد.`);
      continue;
    }
    out[k] = v;
  }
  return out;
}

function program(r: Rec): Rec {
  return {
    name: pick(r, "name", "program_name", "major", "title"),
    college: pick(r, "college", "faculty", "group") ?? "",
    degree: pick(r, "degree", "level") ?? "",
    gender: pick(r, "gender", "category", "audience") ?? "",
    campus: pick(r, "campus", "branch", "location") ?? "",
    admission_route: pick(r, "admission_route", "route", "admission") ?? "",
    source_url: pick(r, "source_url") ?? "",
    verified_on: pick(r, "verified_on") ?? null,
    ...meta(r),
  };
}
function track(r: Rec): Rec {
  const w = (r.weights && typeof r.weights === "object" ? r.weights : {}) as Rec;
  return {
    name: pick(r, "name", "track", "title"),
    academic_year: pick(r, "academic_year", "year") ?? "",
    gender: pick(r, "gender", "category") ?? "",
    school_weight: num(pick(r, "school_weight", "high_school") ?? pick(w, "school", "high_school", "secondary")) ?? 0,
    aptitude_weight: num(pick(r, "aptitude_weight", "qudrat") ?? pick(w, "aptitude", "qudrat")) ?? 0,
    achievement_weight: num(pick(r, "achievement_weight", "tahsili") ?? pick(w, "achievement", "tahsili")) ?? 0,
    requirements: pick(r, "requirements", "conditions", "description") ?? "",
    source_url: pick(r, "source_url") ?? "",
    verified_on: pick(r, "verified_on") ?? null,
    ...meta(r),
  };
}
function section(r: Rec, i: number): Rec {
  return {
    title: pick(r, "title", "heading", "name"),
    content: pick(r, "content", "body", "text"),
    display_order: num(pick(r, "display_order", "order")) ?? i,
    feature_key: pick(r, "feature_key") ?? "general",
    source_url: pick(r, "source_url") ?? "",
    verified_on: pick(r, "verified_on") ?? null,
    ...meta(r),
  };
}
function cutoff(r: Rec): Rec {
  return {
    program_name: pick(r, "program_name", "program", "major", "name"),
    academic_year: pick(r, "academic_year", "year") ?? "",
    gender: pick(r, "gender", "category") ?? "",
    ratio: num(pick(r, "ratio", "percentage", "cutoff", "min_score")),
    source_url: pick(r, "source_url") ?? "",
    verified_on: pick(r, "verified_on") ?? null,
    ...meta(r),
  };
}
function meta(r: Rec): Rec {
  const m: Rec = {};
  const page = pick(r, "page", "pdf_page");
  if (page !== undefined) m._page = str(page);
  if (r.uncertain === true || str(r.uncertain) === "true") m._uncertain = true;
  const note = pick(r, "note", "notes");
  if (note !== undefined) m._note = str(note);
  return m;
}
function university(r: Rec): Rec {
  const out: Rec = {};
  for (const f of specs.universities.fields) if (r[f.key] !== undefined) out[f.key] = r[f.key];
  // Common v1 aliases.
  if (out.description === undefined && r.about !== undefined) out.description = r.about;
  if (out.website_url === undefined && r.website !== undefined) out.website_url = r.website;
  if (out.housing_note === undefined && r.housing !== undefined && typeof r.housing === "string")
    out.housing_note = r.housing;
  return out;
}

export function parseBundle(text: string): Bundle {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new Error("الملف ليس JSON صالحًا.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("ملف الجامعة يجب أن يكون كائن JSON يحتوي university وقوائم المحتوى.");
  const d = data as Rec;
  const format = str(d.format || d.version || d.schema);
  if (format && !/^muwajjah-university-v[12]$/.test(format))
    throw new Error(`صيغة غير مدعومة: ${format}. المدعوم muwajjah-university-v1 وmuwajjah-university-v2.`);
  if (!d.university || typeof d.university !== "object")
    throw new Error("لا يوجد مفتاح university في الملف.");
  const warnings: string[] = [];
  if (!format)
    warnings.push("الملف لا يحدد format؛ عومل كصيغة v1 قديمة. راجع المعاينة بعناية.");
  const src = d.source;
  const source =
    typeof src === "string"
      ? { url: src, reviewed_on: "" }
      : src && typeof src === "object"
        ? { url: str((src as Rec).url || (src as Rec).source_url), reviewed_on: "" }
        : { url: "", reviewed_on: "" };
  const uncertain = (Array.isArray(d.uncertain) ? d.uncertain : []).map((u) =>
    typeof u === "string"
      ? { note: u }
      : { note: str((u as Rec)?.note || (u as Rec)?.text || JSON.stringify(u)), page: str((u as Rec)?.page) || undefined },
  );
  const total = ["programs", "tracks", "sections", "cutoffs"].reduce(
    (n, k) => n + list(d[k]).length,
    0,
  );
  if (total > 3000) throw new Error("الملف يحتوي أكثر من 3000 سجل. قسّمه.");
  return {
    format: BUNDLE_FORMAT,
    converted_from: format === BUNDLE_FORMAT ? undefined : format || "v1 (بلا تحديد)",
    university: university(clean(d.university as Rec, warnings, "university")),
    programs: list(d.programs).map((r) => program(clean(r, warnings, "التخصصات"))),
    tracks: list(d.tracks).map((r) => track(clean(r, warnings, "المسارات"))),
    sections: list(d.sections).map((r, i) => section(clean(r, warnings, "الأقسام"), i)),
    cutoffs: list(d.cutoffs).map((r) => cutoff(clean(r, warnings, "النسب"))),
    source,
    uncertain,
    warnings: [...new Set(warnings)],
  };
}

// The file names a university; ask for explicit confirmation when it does not
// clearly match the one the owner opened.
export function universityMatches(fileName: unknown, currentName: unknown) {
  const a = normalize(String(fileName || "")).replace(/^جامعه\s*/, "");
  const b = normalize(String(currentName || "")).replace(/^جامعه\s*/, "");
  if (!a) return true;
  return a === b || a.includes(b) || b.includes(a);
}

const keyNorm = (v: unknown) => {
  const s = normalize(str(v));
  return s === normalize("غير محدد") ? "" : s;
};
export const naturalKey = (kind: ChildKind, r: Rec) =>
  specs[kind].match
    .filter((k) => k !== "university_id")
    .map((k) => keyNorm(r[k]))
    .join("|");

export type RowStatus = "new" | "changed" | "same" | "trashed" | "error" | "review";
export interface PreviewRow {
  key: string;
  kind: ContentKind;
  name: string;
  status: RowStatus;
  id?: string;
  payload: Rec;
  changes: { field: string; before: unknown; after: unknown }[];
  message?: string;
  page?: string;
  note?: string;
}

const isEmpty = (v: unknown) => v === null || v === undefined || str(v) === "";

// Decide what an incoming record would write. Empty incoming values never
// overwrite anything. "fill" writes only where the stored value is empty;
// "replace" also overwrites stored values that differ.
function mergePayload(kind: ContentKind, incoming: Rec, old: Rec | undefined, mode: MergeMode) {
  const fields = specs[kind].fields.map((f) => f.key);
  if (!old) return incoming;
  const out: Rec = {};
  for (const k of fields) {
    const v = incoming[k];
    if (isEmpty(v)) continue;
    const before = old[k];
    const same = JSON.stringify(str(before)) === JSON.stringify(str(v));
    if (same) continue;
    if (mode === "fill" && !isEmpty(before) && keyNorm(before) !== "") continue;
    out[k] = v;
  }
  return out;
}

export function previewBundle(
  b: Bundle,
  university: Rec,
  existing: Record<ChildKind, Row[]>,
  mode: MergeMode,
  fileSource: { url: string; reviewed_on: string; apply: boolean },
): PreviewRow[] {
  const rows: PreviewRow[] = [];
  const withSource = (r: Rec) =>
    fileSource.apply
      ? {
          ...r,
          source_url: isEmpty(r.source_url) ? fileSource.url : r.source_url,
          verified_on: isEmpty(r.verified_on) ? fileSource.reviewed_on || null : r.verified_on,
        }
      : r;
  // University fields (never creates a university: the workspace fixes which one).
  {
    const incoming = { ...b.university };
    delete incoming.name; // renaming is done by hand, not by import
    const payload = mergePayload("universities", incoming, university, mode);
    let status: RowStatus = Object.keys(payload).length ? "changed" : "same";
    let message: string | undefined;
    try {
      if (status === "changed") sanitize("universities", payload, true);
    } catch (e) {
      status = "error";
      message = (e as Error).message;
    }
    rows.push({
      key: "universities:0",
      kind: "universities",
      name: String(university.name || "الجامعة"),
      status,
      id: String(university.id),
      payload,
      message,
      changes: Object.entries(payload).map(([field, after]) => ({ field, before: university[field], after })),
    });
  }
  for (const kind of CHILD_KINDS) {
    const seen = new Set<string>();
    const stored = existing[kind] || [];
    b[kind].forEach((raw, i) => {
      const r = withSource(raw);
      const key = `${kind}:${i}`;
      const name = str(r.name || r.title || r.program_name) || `سجل ${i + 1}`;
      const base = { key, kind, name, page: r._page as string | undefined, note: r._note as string | undefined };
      try {
        // Kind-specific rules from the extraction guidelines.
        if (kind === "tracks") {
          const sum = Number(r.school_weight) + Number(r.aptitude_weight) + Number(r.achievement_weight);
          if ([r.school_weight, r.aptitude_weight, r.achievement_weight].some((x) => Number.isNaN(Number(x))))
            throw new Error("أوزان غير رقمية.");
          if (sum !== 0 && !isWeighted(r as never))
            throw new Error(`مجموع الأوزان ${sum}% وليس 100%. صححه أو اجعله مسارًا نصيًا بلا أوزان.`);
          if (sum === 0 && isEmpty(r.requirements))
            throw new Error("مسار بلا أوزان وبلا شروط نصية.");
          if (sum !== 0 && isEmpty(r.academic_year))
            throw new Error("المسار الموزون يحتاج العام الأكاديمي كما ورد في المصدر.");
        }
        if (kind === "cutoffs") {
          if (isEmpty(r.academic_year))
            throw new Error("النسبة بلا سنة صريحة؛ لا تُستورد كمعلومة مؤكدة.");
          if (r.ratio === undefined || Number.isNaN(Number(r.ratio)))
            throw new Error("قيمة النسبة غير صالحة.");
        }
        const nk = naturalKey(kind, r);
        if (seen.has(nk)) throw new Error("مكرر داخل الملف نفسه.");
        seen.add(nk);
        const matches = stored.filter((s) => naturalKey(kind, s) === nk);
        const live = matches.filter((s) => !s.deleted_at);
        if (!live.length && matches.length) {
          rows.push({ ...base, status: "trashed", payload: {}, changes: [], message: "موجود في السلة؛ تُرك كما هو ولن يُعاد." });
          return;
        }
        if (live.length > 1) throw new Error("يطابق أكثر من سجل موجود؛ عدّله يدويًا.");
        const old = live[0];
        const payload = mergePayload(kind, r, old, mode);
        if (old) {
          if (!Object.keys(payload).length) {
            rows.push({ ...base, status: "same", id: old.id, payload: {}, changes: [] });
            return;
          }
          sanitize(kind, payload, true);
          rows.push({
            ...base,
            status: r._uncertain ? "review" : "changed",
            id: old.id,
            payload,
            message: r._uncertain ? "معلّم كغير مؤكد في الملف." : undefined,
            changes: Object.entries(payload).map(([field, after]) => ({ field, before: old[field], after })),
          });
          return;
        }
        const clean: Rec = {};
        for (const f of specs[kind].fields) if (r[f.key] !== undefined) clean[f.key] = r[f.key];
        const payloadNew = sanitize(kind, { ...clean, university_id: university.id });
        rows.push({
          ...base,
          status: r._uncertain ? "review" : "new",
          payload: payloadNew,
          message: r._uncertain ? "معلّم كغير مؤكد في الملف." : undefined,
          changes: [],
        });
      } catch (e) {
        rows.push({ ...base, status: "error", payload: {}, changes: [], message: (e as Error).message });
      }
    });
  }
  return rows;
}

export const statusLabels: Record<RowStatus, string> = {
  new: "جديد",
  changed: "تحديث",
  same: "مطابق",
  trashed: "في السلة",
  error: "يحتاج تصحيح",
  review: "غير مؤكد",
};
