// Data-readiness checks per university. Pure functions so they are unit-tested
// and reusable (readiness page, workspace header).
import { slotFor } from "../lib/sections";
import { isWeighted } from "../lib/utils";
import type { Row } from "../lib/types";

export interface Check {
  key: string;
  label: string;
  ok: boolean;
  // Core checks decide whether a university is ready to publish; the rest
  // make the profile richer but are not required.
  core: boolean;
  hint?: string;
}
export interface Readiness {
  university: Row;
  checks: Check[];
  score: number; // 0..100 over all checks
  ready: boolean; // all core checks pass
  warnings: string[]; // problems on content that is already live
  counts: { programs: number; programsLive: number; tracks: number; sections: number };
}

const live = (r: Row) => !r.deleted_at;
const has = (v: unknown) => String(v ?? "").trim() !== "";

export function assess(
  university: Row,
  content: { programs: Row[]; tracks: Row[]; sections: Row[] },
): Readiness {
  const of = (rows: Row[]) => rows.filter((r) => r.university_id === university.id && live(r));
  const programs = of(content.programs);
  const tracks = of(content.tracks);
  const sections = of(content.sections);
  const slots = new Set(sections.map((s) => slotFor(s as never)));
  const admissionText = slots.has("admission");
  const weighted = tracks.filter((t) => isWeighted(t as never));
  const unsourced = tracks.filter((t) => !has(t.source_url) || !t.verified_on);
  const checks: Check[] = [
    { key: "about", label: "نبذة", ok: has(university.description), core: true },
    { key: "place", label: "المدينة", ok: has(university.city), core: true },
    { key: "programs", label: "التخصصات", ok: programs.length > 0, core: true },
    {
      key: "admission",
      label: "شروط القبول أو مساراته",
      ok: tracks.length > 0 || admissionText,
      core: true,
      hint: "أضف مسارات القبول، أو قسمًا بعنوان «شروط القبول» إن كانت الجامعة لا تعتمد موزونة.",
    },
    {
      key: "sources",
      label: "مصدر وتاريخ تحقق للمسارات",
      ok: tracks.length === 0 || unsourced.length === 0,
      core: true,
      hint: `${unsourced.length} مسار لن يُنشر بدون رابط مصدر وتاريخ تحقق.`,
    },
    {
      key: "calculator",
      label: "مسار موزون (يشغّل الحاسبة)",
      ok: weighted.length > 0,
      core: false,
      hint: "اختياري: بعض الجامعات لا تعتمد موزونة.",
    },
    {
      key: "housing",
      label: "السكن",
      ok: (has(university.housing_status) && university.housing_status !== "unknown") || has(university.housing_note),
      core: false,
    },
    { key: "colleges", label: "التخصصات مجمعة حسب الكلية", ok: programs.length > 0 && programs.every((p) => has(p.college)), core: false },
    { key: "environment", label: "البيئة والمميزات", ok: slots.has("environment"), core: false },
    { key: "drawbacks", label: "أبرز السلبيات", ok: slots.has("drawbacks"), core: false },
    { key: "contact", label: "التواصل أو موقع الجامعة", ok: slots.has("contact") || has(university.website_url), core: false },
  ];
  const warnings: string[] = [];
  const programsLive = programs.filter((p) => p.published).length;
  if (university.published) {
    if (programs.length && !programsLive)
      warnings.push(`منشورة لكن تخصصاتها الـ${programs.length} كلها غير منشورة. استخدم «نشر الجامعة ومحتواها».`);
    else if (programs.length - programsLive > 0)
      warnings.push(`${programs.length - programsLive} تخصص لم يُنشر بعد (مسودة أو مخفي).`);
    if (tracks.length && !tracks.some((t) => t.published))
      warnings.push("مسارات القبول موجودة لكن لم يُنشر أي منها.");
  }
  const passed = checks.filter((c) => c.ok).length;
  return {
    university,
    checks,
    score: Math.round((passed / checks.length) * 100),
    ready: checks.filter((c) => c.core).every((c) => c.ok),
    warnings,
    counts: { programs: programs.length, programsLive, tracks: tracks.length, sections: sections.length },
  };
}
