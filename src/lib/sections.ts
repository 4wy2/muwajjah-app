import type { Section } from "./types";

// The owner's reference reading order for a university profile. Flexible
// sections are placed into a slot by their title; anything unrecognised
// (fees, campus life…) is shown in the "extra" slot, before contact details.
export type SlotKey =
  | "about"
  | "branches"
  | "ranking"
  | "competition"
  | "employment"
  | "admission"
  | "programs"
  | "cutoffs"
  | "housing"
  | "environment"
  | "drawbacks"
  | "extra"
  | "contact"
  | "social";

export const slotOrder: { key: SlotKey; title: string }[] = [
  { key: "about", title: "نبذة عن الجامعة" },
  { key: "branches", title: "الفروع والمقرات" },
  { key: "ranking", title: "التصنيف" },
  { key: "competition", title: "التنافسية وصعوبة القبول" },
  { key: "employment", title: "التوظيف بعد التخرج" },
  { key: "admission", title: "شروط القبول ومساراته" },
  { key: "programs", title: "التخصصات" },
  { key: "cutoffs", title: "نسب القبول السابقة" },
  { key: "housing", title: "السكن الجامعي" },
  { key: "environment", title: "البيئة الجامعية والمميزات" },
  { key: "drawbacks", title: "أبرز السلبيات" },
  { key: "extra", title: "معلومات إضافية" },
  { key: "contact", title: "التواصل مع الجامعة" },
  { key: "social", title: "منصات الجامعة" },
];

// Order matters: "منصات التواصل" must match social before contact, and
// cutoff titles must never fall into the general admission slot.
const rules: [SlotKey, RegExp][] = [
  [
    "cutoffs",
    /نسب(ة|ه)?\s*القبول|معدلات?\s*القبول|[اأ]قل\s*موزون|حد\s*القبول|النسب\s*السابقة/,
  ],
  ["social", /منصات|حسابات|سوشيال|تويتر|اكس|انستقرام|تيك\s*توك|سناب|يوتيوب/],
  ["drawbacks", /سلبي|سلبيات|عيوب|ملاحظات\s*على/],
  ["contact", /تواصل|اتصال|هاتف|عنوان\s*الجامعة|البريد/],
  ["branches", /فرع|فروع|مقر|مقرات|حرم|كليات\s*المحافظات/],
  ["ranking", /تصنيف|ترتيب\s*الجامعة/],
  ["competition", /تنافس|صعوبة|قوة\s*القبول/],
  ["employment", /توظيف|سوق\s*العمل|بعد\s*التخرج/],
  ["admission", /شروط|قبول|تخصيص|التقديم|معايير/],
  ["housing", /سكن/],
  ["environment", /بيئة|مميزات|ميزات|الحياة\s*الجامعية|الأنشطة|نوادي/],
  ["about", /نبذة|عن\s*الجامعة|تعريف|رؤية|رسالة\s*الجامعة/],
];

export function slotFor(section: Pick<Section, "title" | "feature_key">): SlotKey {
  if (section.feature_key === "historical_cutoffs") return "cutoffs";
  const title = String(section.title || "");
  for (const [key, re] of rules) if (re.test(title)) return key;
  return "extra";
}

export function groupSections(sections: Section[]) {
  const groups = new Map<SlotKey, Section[]>();
  for (const s of [...sections].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  )) {
    const key = slotFor(s);
    groups.set(key, [...(groups.get(key) || []), s]);
  }
  return groups;
}
