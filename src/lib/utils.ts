import type { Track } from "./types";
export const normalize = (v: unknown) =>
  String(v ?? "")
    .normalize("NFKD")
    .replace(/[\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim()
    .toLowerCase();
export const safeUrl = (v: unknown) => {
  try {
    const u = new URL(String(v));
    return ["http:", "https:"].includes(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
};
export const housing = (v: string) =>
  ({
    male_only: "يوجد سكن للطلاب فقط",
    female_only: "يوجد سكن للطالبات فقط",
    both: "يوجد سكن للطلاب والطالبات",
    available: "يوجد سكن",
    limited: "يوجد سكن بشروط",
    unavailable: "لا يوجد سكن",
  })[v] || "";
export const date = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
        dateStyle: "medium",
        calendar: "gregory",
      }).format(d);
};
// A weighted track has explicit numeric weights totalling 100%. Anything else
// (SAT, olympiad, conditional admission) is a textual track: never calculated.
export const isWeighted = (
  t: Pick<Track, "school_weight" | "aptitude_weight" | "achievement_weight">,
) => {
  const w = [t.school_weight, t.aptitude_weight, t.achievement_weight].map(
    Number,
  );
  return (
    w.every((x) => Number.isFinite(x) && x >= 0 && x <= 100) &&
    Math.abs(w.reduce((a, b) => a + b, 0) - 100) <= 0.01
  );
};
export const hostOf = (v: unknown) => {
  const u = safeUrl(v);
  return u ? new URL(u).hostname.replace(/^www\./, "") : "";
};
// "مكة المكرمة، منطقة مكة المكرمة" → "مكة المكرمة": avoid repeating the city.
export const place = (city?: string, region?: string) => {
  const c = (city || "").trim();
  const r = (region || "").trim();
  if (!c) return r;
  if (!r || normalize(r).includes(normalize(c))) return c;
  return c + "، " + r;
};
export const number = (v: number) => new Intl.NumberFormat("ar-SA-u-nu-latn").format(v);
export function calculate(
  track: Pick<
    Track,
    "school_weight" | "aptitude_weight" | "achievement_weight"
  >,
  values: string[],
) {
  const weights = [
    track.school_weight,
    track.aptitude_weight,
    track.achievement_weight,
  ].map(Number);
  if (
    weights.some((w) => !Number.isFinite(w) || w < 0 || w > 100) ||
    Math.abs(weights.reduce((a, b) => a + b, 0) - 100) > 0.01
  )
    throw new Error(
      "أوزان المسار لا تساوي 100%. لا يمكن حساب الموزونة لهذا المسار.",
    );
  if (
    values.length !== 3 ||
    values.some(
      (v, i) =>
        weights[i] > 0 &&
        (v.trim() === "" ||
          !Number.isFinite(Number(v)) ||
          Number(v) < 0 ||
          Number(v) > 100),
    )
  )
    throw new Error("أدخل الدرجات المطلوبة بين 0 و100.");
  return (
    Math.round(
      values.reduce(
        (n, v, i) =>
          n + (weights[i] === 0 ? 0 : (Number(v) * weights[i]) / 100),
        0,
      ) * 100,
    ) / 100
  );
}
export function friendly(e: unknown) {
  const err = e as { message?: string; code?: string };
  const m = err?.message || "";
  if (/invalid login credentials/i.test(m))
    return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (/email not confirmed/i.test(m))
    return "فعّل حسابك من رسالة تأكيد البريد أولًا.";
  if (/rate limit|too many requests/i.test(m))
    return "طلبات كثيرة خلال وقت قصير. حاول بعد قليل.";
  if (/password.*(short|least|weak)/i.test(m))
    return "استخدم كلمة مرور قوية لا تقل عن 8 أحرف.";
  if (/user already registered/i.test(m))
    return "هذا البريد مسجّل من قبل. يمكنك تسجيل الدخول أو استعادة كلمة المرور.";
  if (
    ["42501"].includes(err?.code || "") ||
    /row.level.security|permission denied/i.test(m)
  )
    return "لا تملك الصلاحية المطلوبة لإكمال هذه العملية.";
  if (/academic_year_check/.test(m))
    return "حفظ مسار بلا عام أكاديمي يحتاج تطبيق تحديث القاعدة database/002_textual_tracks.sql أولًا.";
  if (/publish_valid|source_required/.test(m))
    return "ما ينفع ينشر قبل ما تضيف له «رابط المصدر» و«تاريخ التحقق» (افتح السجل وعبّهم، وبعدين انشره).";
  if (err?.code === "23505" || /duplicate key/.test(m))
    return "يوجد سجل مطابق مسبقًا (قد يكون في السلة).";
  if (["PGRST205", "42P01", "PGRST202"].includes(err?.code || ""))
    return "هذه الميزة غير مفعّلة بعد. يرجى التواصل مع إدارة مُوجّه.";
  if (/dynamically imported module|Importing a module script failed|Loading chunk/i.test(m))
    return "تم تحديث الموقع. أعد تحميل الصفحة لتظهر النسخة الجديدة.";
  if (/fetch|network|timeout/i.test(m))
    return "تعذر الاتصال. تحقق من الإنترنت وحاول مجددًا.";
  if (/[\u0600-\u06ff]/.test(m)) return m;
  return "تعذر إكمال العملية. حاول مجددًا أو تواصل مع إدارة مُوجّه.";
}
export function downloadJson(name: string, value: unknown) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
