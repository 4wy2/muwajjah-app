import type { ContentKind, Row } from "../lib/types";
export type FieldSpec = {
  key: string;
  label: string;
  type?: "text" | "textarea" | "number" | "date" | "url" | "select";
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  default?: unknown;
};
const text = (key: string, label: string, required = false): FieldSpec => ({
  key,
  label,
  required,
});
const source: FieldSpec[] = [
  { key: "source_url", label: "رابط المصدر", type: "url" },
  { key: "verified_on", label: "تاريخ التحقق", type: "date" },
];
const weights: FieldSpec[] = [
  ["school_weight", "وزن الثانوية"],
  ["aptitude_weight", "وزن القدرات"],
  ["achievement_weight", "وزن التحصيلي"],
].map(([key, label]) => ({
  key,
  label,
  type: "number",
  min: 0,
  max: 100,
  default: 0,
}));
export const specs: Record<
  ContentKind,
  { label: string; singular: string; fields: FieldSpec[]; match: string[] }
> = {
  universities: {
    label: "الجامعات",
    singular: "جامعة",
    match: ["name", "city"],
    fields: [
      text("name", "اسم الجامعة", true),
      text("city", "المدينة"),
      text("region", "المنطقة"),
      text("type", "نوع الجامعة"),
      { key: "description", label: "نبذة", type: "textarea" },
      {
        key: "housing_status",
        label: "حالة السكن",
        type: "select",
        options: ["unknown", "available", "limited", "unavailable"],
        default: "unknown",
      },
      { key: "housing_note", label: "معلومات السكن", type: "textarea" },
      { key: "housing_source_url", label: "مصدر السكن", type: "url" },
      {
        key: "housing_verified_on",
        label: "تاريخ التحقق من السكن",
        type: "date",
      },
      { key: "website_url", label: "الموقع الرسمي", type: "url" },
      { key: "logo_url", label: "رابط الشعار", type: "url" },
      ...source,
    ],
  },
  programs: {
    label: "التخصصات",
    singular: "تخصص",
    match: ["university_id", "name", "college", "degree", "gender", "campus"],
    fields: [
      text("name", "اسم التخصص", true),
      text("college", "الكلية"),
      text("degree", "الدرجة العلمية"),
      text("gender", "الفئة"),
      text("campus", "المقر"),
      { key: "admission_route", label: "طريقة الالتحاق", type: "textarea" },
      ...source,
    ],
  },
  tracks: {
    label: "مسارات القبول",
    singular: "مسار",
    match: ["university_id", "name", "academic_year", "gender"],
    fields: [
      text("name", "اسم المسار", true),
      text("academic_year", "العام الأكاديمي", true),
      text("gender", "الفئة"),
      ...weights,
      { key: "requirements", label: "شروط القبول", type: "textarea" },
      ...source,
    ],
  },
  sections: {
    label: "الأقسام المرنة",
    singular: "قسم",
    match: ["university_id", "title"],
    fields: [
      text("title", "عنوان القسم", true),
      {
        key: "content",
        label: "محتوى القسم",
        type: "textarea",
        required: true,
      },
      {
        key: "display_order",
        label: "ترتيب العرض",
        type: "number",
        default: 0,
      },
      {
        key: "feature_key",
        label: "صلاحية المحتوى",
        type: "select",
        options: ["general", "historical_cutoffs"],
        default: "general",
      },
      ...source,
    ],
  },
  cutoffs: {
    label: "النسب السابقة",
    singular: "نسبة",
    match: ["university_id", "program_name", "academic_year", "gender"],
    fields: [
      text("program_name", "اسم التخصص", true),
      text("academic_year", "العام الأكاديمي", true),
      text("gender", "الفئة"),
      {
        key: "ratio",
        label: "نسبة القبول",
        type: "number",
        required: true,
        min: 0,
        max: 100,
      },
      ...source,
    ],
  },
};
export const fieldValueLabels: Record<string, string> = {
  unknown: "غير محدد",
  available: "يتوفر سكن",
  limited: "سكن بشروط",
  unavailable: "لا يتوفر سكن",
  general: "متاح للجميع",
  historical_cutoffs: "يتبع صلاحية النسب السابقة",
};
export function sanitize(
  kind: ContentKind,
  raw: Record<string, unknown>,
  partial = false,
) {
  const result: Record<string, unknown> = {};
  for (const f of specs[kind].fields) {
    if (partial && !(f.key in raw)) continue;
    const v = raw[f.key];
    if (
      f.required &&
      (v === undefined || v === null || String(v).trim() === "")
    )
      throw new Error("الحقل مطلوب: " + f.label);
    if (f.type === "number") {
      const n = Number(v ?? f.default ?? 0);
      if (
        !Number.isFinite(n) ||
        (f.min !== undefined && n < f.min) ||
        (f.max !== undefined && n > f.max)
      )
        throw new Error("قيمة غير صالحة: " + f.label);
      result[f.key] = n;
    } else if (f.type === "date") {
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v)))
        throw new Error("تاريخ غير صالح: " + f.label);
      result[f.key] = v || null;
    } else {
      const s = String(v ?? f.default ?? "").trim();
      if (f.type === "url" && s) {
        try {
          const url = new URL(s);
          if (!["https:", "http:"].includes(url.protocol)) throw new Error();
        } catch {
          throw new Error("رابط غير صالح: " + f.label);
        }
      }
      if (f.options && !f.options.includes(s))
        throw new Error("خيار غير صالح: " + f.label);
      result[f.key] = s;
    }
  }
  if (kind !== "universities") {
    if (!raw.university_id && !partial) throw new Error("اختر الجامعة.");
    if (raw.university_id) result.university_id = raw.university_id;
  }
  return result;
}
export const rowLabel = (row: Row) =>
  String(row.name || row.title || row.program_name || row.id);
