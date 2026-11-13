// Turns the owner health summary (database/014) into checks, each with a
// level and a concrete fix. Pure, so the thresholds are tested.

export interface Health {
  db_bytes: number;
  users_total: number;
  active_month: number;
  new_today: number;
  new_week: number;
  new_month: number;
  views: { day: string; hits: number }[];
  views_month: number;
  universities: number;
  programs: number;
  programs_sourced: number;
  sections: number;
  sections_sourced: number;
  tracks: number;
  tracks_published: number;
  cutoffs: number;
  private: boolean | null;
  commercial: boolean | null;
  season_label: string | null;
  season_ends_at: string | null;
  has_purchase_url: boolean | null;
  today: string;
}

export type Level = "ok" | "warn" | "bad" | "info";
export interface Check {
  id: string;
  group: "usage" | "launch" | "data";
  level: Level;
  title: string;
  value: string;
  // 0..1 when the check is measured against a limit.
  ratio?: number;
  fix: string;
  // Where to act: an admin path (starts with /) or an external link.
  action?: { label: string; to: string };
}

// Supabase Free plan limits (supabase.com/docs/pricing, checked Nov 2026).
export const FREE_DB_BYTES = 500 * 1024 * 1024;
export const FREE_ACTIVE_USERS = 50_000;
// Page views per month at which the 5 GB browsing allowance needs a look.
// An estimate from the November 2026 measurements; compare with Supabase
// Usage after the first weeks and adjust.
export const VIEWS_WATCH = 15_000;
export const VIEWS_ALERT = 30_000;

export const SUPABASE_PROJECT = "https://supabase.com/dashboard/project/gybksasoembmgdevogpv";

const levelFor = (ratio: number): Level => (ratio >= 0.8 ? "bad" : ratio >= 0.6 ? "warn" : "ok");
const pct = (r: number) => Math.round(r * 100) + "%";
const n = (v: number) => new Intl.NumberFormat("ar-SA-u-nu-latn").format(v);
const mb = (b: number) => (b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + " ميجا";
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function healthChecks(h: Health): Check[] {
  const out: Check[] = [];
  const upgrade = { label: "افتح Supabase", to: SUPABASE_PROJECT };

  // Usage against the free plan.
  const dbRatio = h.db_bytes / FREE_DB_BYTES;
  out.push({
    id: "db",
    group: "usage",
    level: levelFor(dbRatio),
    title: "حجم قاعدة البيانات",
    value: mb(h.db_bytes) + " من 500 ميجا",
    ratio: dbRatio,
    fix:
      dbRatio >= 0.6
        ? "قربت من الحد. اشترك في Supabase Pro (25 دولار بالشهر) من Billing، وحدّه 8 جيجا."
        : "بعيد عن الحد. ما يحتاج شي الحين.",
    action: dbRatio >= 0.6 ? upgrade : undefined,
  });
  const usersRatio = h.active_month / FREE_ACTIVE_USERS;
  out.push({
    id: "users",
    group: "usage",
    level: levelFor(usersRatio),
    title: "الطلاب اللي دخلوا هالشهر",
    value: n(h.active_month) + " من " + n(FREE_ACTIVE_USERS),
    ratio: usersRatio,
    fix:
      usersRatio >= 0.6
        ? "قربت من حد الخطة المجانية. اشترك في Pro قبل نهاية الشهر، وحدّه 100 ألف."
        : "بعيد عن الحد.",
    action: usersRatio >= 0.6 ? upgrade : undefined,
  });
  const viewsLevel: Level =
    h.views_month >= VIEWS_ALERT ? "bad" : h.views_month >= VIEWS_WATCH ? "warn" : "info";
  out.push({
    id: "browsing",
    group: "usage",
    level: viewsLevel,
    title: "التصفح (تقدير)",
    value: n(h.views_month) + " زيارة لصفحات الجامعات هالشهر",
    fix:
      viewsLevel === "bad"
        ? "الزيارات عالية، والتصفح غالبًا قرب من حد 5 جيجا. افتح Usage في Supabase الحين، ولو فوق 80% اشترك في Pro اليوم."
        : viewsLevel === "warn"
          ? "الزيارات تزيد. افتح Usage في Supabase وشوف نسبة Egress، ولو فوق 60% جهّز الاشتراك."
          : "الرقم الحقيقي للتصفح ما يوصل للموقع، وتلقاه في Supabase ← Usage ← Egress. راجعه مرة بالأسبوع بعد الإطلاق.",
    action: { label: "افتح Usage في Supabase", to: SUPABASE_PROJECT },
  });

  // Launch settings.
  if (h.season_ends_at) {
    const left = daysBetween(h.today, h.season_ends_at);
    out.push({
      id: "season",
      group: "launch",
      level: left < 0 ? "bad" : left <= 14 ? "warn" : "ok",
      title: "موسم الترقية",
      value:
        (h.season_label || "بدون اسم") +
        (left < 0 ? " · انتهى" : " · باقي " + n(left) + " يوم"),
      fix:
        left <= 14
          ? "حدّث اسم الموسم وتاريخ نهايته (مثلًا: موسم قبول 1449، ينتهي آخر أغسطس) من صفحة بلس والوصول."
          : "التاريخ مضبوط.",
      action: left <= 14 ? { label: "عدّل الموسم", to: "/admin/access" } : undefined,
    });
  }
  if (h.private !== null)
    out.push({
      id: "private",
      group: "launch",
      level: h.private ? "info" : "ok",
      title: "ظهور الموقع",
      value: h.private ? "خاص: الفريق بس يشوف المحتوى" : "عام: الكل يشوف المحتوى",
      fix: h.private
        ? "يوم الإطلاق افتحه للعموم من صفحة بلس والوصول."
        : "الموقع مفتوح للطلاب.",
      action: h.private ? { label: "إعداد الظهور", to: "/admin/access" } : undefined,
    });
  if (h.commercial)
    out.push({
      id: "buy",
      group: "launch",
      level: h.has_purchase_url ? "ok" : "bad",
      title: "رابط الشراء",
      value: h.has_purchase_url ? "موجود" : "الترقية مفعّلة بدون رابط شراء",
      fix: h.has_purchase_url
        ? "جرّب شراء حقيقي مرة للتأكد إن الترقية تنفتح تلقائيًا."
        : "الطلاب يشوفون الترقية وما يقدرون يدفعون. أضف رابط منتج زد من صفحة بلس والوصول.",
      action: h.has_purchase_url ? undefined : { label: "أضف الرابط", to: "/admin/access" },
    });

  // Data quality.
  out.push({
    id: "tracks",
    group: "data",
    level: h.tracks > 0 && h.tracks_published === 0 ? "bad" : h.tracks_published < h.tracks ? "warn" : "ok",
    title: "مسارات الموزونة",
    value: n(h.tracks_published) + " منشور من " + n(h.tracks),
    fix:
      h.tracks_published === 0 && h.tracks > 0
        ? "حاسبة الموزونة مخفية عن الطلاب لأن ولا مسار منشور. راجع المسارات وانشرها."
        : h.tracks_published < h.tracks
          ? "فيه مسارات ما انتشرت، والحاسبة ما تطلع في جامعاتها."
          : "كل المسارات منشورة.",
    action: h.tracks_published < h.tracks ? { label: "افتح المسارات", to: "/admin/tracks" } : undefined,
  });
  const srcRatio =
    h.programs + h.sections > 0
      ? (h.programs_sourced + h.sections_sourced) / (h.programs + h.sections)
      : 1;
  out.push({
    id: "sources",
    group: "data",
    level: srcRatio < 0.5 ? "warn" : "ok",
    title: "المصادر",
    value:
      "تخصصات: " + n(h.programs_sourced) + " من " + n(h.programs) +
      " · أقسام: " + n(h.sections_sourced) + " من " + n(h.sections),
    ratio: srcRatio,
    fix:
      srcRatio < 0.5
        ? "أغلب المعلومات بدون رابط مصدر، وهذا يضعف ثقة الطالب. خلّ الفريق يضيف رابط دليل القبول لكل جامعة."
        : "أغلب المعلومات موثّقة.",
    action: srcRatio < 0.5 ? { label: "افتح جاهزية البيانات", to: "/admin/readiness" } : undefined,
  });
  out.push({
    id: "cutoffs",
    group: "data",
    level: h.cutoffs === 0 ? "warn" : "ok",
    title: "نسب القبول السابقة",
    value: n(h.cutoffs) + " نسبة منشورة",
    fix:
      h.cutoffs === 0
        ? "ما فيه نسب منشورة، فميزة النسب السابقة فاضية."
        : "كل ما زادت النسب، زادت قيمة الميزة.",
    action: { label: "افتح النسب", to: "/admin/cutoffs" },
  });
  return out;
}

// What needs the owner now, worst first.
export const alerts = (checks: Check[]) =>
  checks
    .filter((c) => c.level === "bad" || c.level === "warn")
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "bad" ? -1 : 1));
