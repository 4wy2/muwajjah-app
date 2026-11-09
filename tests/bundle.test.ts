import { describe, it, expect } from "vitest";
import { parseBundle, previewBundle, universityMatches } from "../src/admin/bundle";
import { slotFor } from "../src/lib/sections";
import { isWeighted, place } from "../src/lib/utils";
import { sanitize } from "../src/admin/specs";
import { makeDiff } from "../src/admin/import";

const U = {
  id: "u1",
  name: "جامعة أم القرى",
  description: "وصف موجود جيد",
  city: "",
  housing_status: "unknown",
};
const none = { programs: [], tracks: [], sections: [], cutoffs: [] };
const noSrc = { url: "", reviewed_on: "", apply: false };
const v1 = JSON.stringify({
  format: "muwajjah-university-v1",
  university: { name: "أم القرى", description: "", city: "مكة المكرمة", published: true },
  programs: [
    { name: "الهندسة الكهربائية", college: "الهندسة", degree: "بكالوريوس", page: 12 },
    { name: "الهندسة الكهربائية", college: "الهندسة", degree: "دبلوم", page: 12 },
  ],
  tracks: [
    { name: "علمي", year: "1447", weights: { school: 30, aptitude: 30, achievement: 40 } },
    { name: "SAT", school_weight: 0, aptitude_weight: 0, achievement_weight: 0, requirements: "1200 فأعلى" },
    { name: "خطأ", year: "1447", school_weight: 50, aptitude_weight: 30, achievement_weight: 30 },
  ],
  cutoffs: [
    { program: "الطب", year: "1446", ratio: "95.5%" },
    { program: "الصيدلة", ratio: 90 },
  ],
  sections: [{ title: "التصنيف", body: "QS 2025", uncertain: true }],
  source: "https://uqu.edu.sa/guide.pdf",
  uncertain: ["رسوم غير مؤكدة"],
});

describe("university bundle import", () => {
  it("converts v1 aliases and drops fields a file may not set", () => {
    const b = parseBundle(v1);
    expect(b.converted_from).toBe("muwajjah-university-v1");
    expect(b.university.published).toBeUndefined();
    expect(b.warnings.join(" ")).toContain("published");
    expect(b.tracks[0]).toMatchObject({ academic_year: "1447", school_weight: 30, achievement_weight: 40 });
    expect(b.cutoffs[0]).toMatchObject({ program_name: "الطب", ratio: 95.5 });
    expect(b.sections[0]).toMatchObject({ content: "QS 2025", _uncertain: true });
    expect(b.source.url).toBe("https://uqu.edu.sa/guide.pdf");
    expect(b.uncertain[0].note).toBe("رسوم غير مؤكدة");
  });
  it("never overwrites stored values with blanks, and fill mode keeps good data", () => {
    const rows = previewBundle(parseBundle(v1), U, none, "fill", noSrc);
    const uni = rows.find((r) => r.kind === "universities")!;
    expect(uni.payload).toEqual({ city: "مكة المكرمة" });
    const replace = previewBundle(
      parseBundle(JSON.stringify({ university: { description: "وصف آخر", city: "" } })),
      U,
      none,
      "replace",
      noSrc,
    ).find((r) => r.kind === "universities")!;
    expect(replace.payload).toEqual({ description: "وصف آخر" });
  });
  it("keeps programs that differ by degree apart and validates tracks/cutoffs", () => {
    const rows = previewBundle(parseBundle(v1), U, none, "fill", noSrc);
    const progs = rows.filter((r) => r.kind === "programs");
    expect(progs.map((r) => r.status)).toEqual(["new", "new"]);
    expect(progs[0].page).toBe("12");
    const tracks = rows.filter((r) => r.kind === "tracks");
    expect(tracks[0].status).toBe("new");
    expect(tracks[1].status).toBe("new"); // textual track, no year, no invented weights
    expect(tracks[1].payload.academic_year).toBe("");
    expect(tracks[2].status).toBe("error");
    const cuts = rows.filter((r) => r.kind === "cutoffs");
    expect(cuts[0].status).toBe("new");
    expect(cuts[1].status).toBe("error"); // no stated year → not imported as fact
    expect(rows.find((r) => r.kind === "sections")!.status).toBe("review");
  });
  it("is safe to retry: saved rows become 'same' and trashed rows are not revived", () => {
    const b = parseBundle(v1);
    const existing = {
      ...none,
      programs: [
        { id: "p1", university_id: "u1", name: "الهندسة الكهربائية", college: "الهندسة", degree: "بكالوريوس", gender: "غير محدد", campus: "", deleted_at: null },
        { id: "p2", university_id: "u1", name: "الهندسة الكهربائية", college: "الهندسة", degree: "دبلوم", gender: "", campus: "", deleted_at: "2026-01-01" },
      ],
    };
    const progs = previewBundle(b, U, existing, "fill", noSrc).filter((r) => r.kind === "programs");
    expect(progs[0].status).toBe("same");
    expect(progs[1].status).toBe("trashed");
  });
  it("applies one file-level source only where a record has none", () => {
    const rows = previewBundle(parseBundle(v1), U, none, "fill", {
      url: "https://uqu.edu.sa/guide.pdf",
      reviewed_on: "2026-11-01",
      apply: true,
    });
    const p = rows.find((r) => r.kind === "programs")!;
    expect(p.payload).toMatchObject({ source_url: "https://uqu.edu.sa/guide.pdf", verified_on: "2026-11-01" });
  });
  it("flags a file that names another university", () => {
    expect(universityMatches("أم القرى", "جامعة أم القرى")).toBe(true);
    expect(universityMatches("جامعة الملك سعود", "جامعة أم القرى")).toBe(false);
  });
  it("rejects malformed or foreign files", () => {
    expect(() => parseBundle("not json")).toThrow();
    expect(() => parseBundle(JSON.stringify({ format: "other", university: {} }))).toThrow();
    expect(() => parseBundle(JSON.stringify({ programs: [] }))).toThrow();
  });
});

describe("profile helpers", () => {
  it("places flexible sections in the owner's reading order", () => {
    expect(slotFor({ title: "منصات التواصل", feature_key: "general" })).toBe("social");
    expect(slotFor({ title: "التواصل مع الجامعة", feature_key: "general" })).toBe("contact");
    expect(slotFor({ title: "نسب القبول للعام الماضي", feature_key: "general" })).toBe("cutoffs");
    expect(slotFor({ title: "أي عنوان", feature_key: "historical_cutoffs" })).toBe("cutoffs");
    expect(slotFor({ title: "أبرز السلبيات", feature_key: "general" })).toBe("drawbacks");
    expect(slotFor({ title: "الرسوم الدراسية", feature_key: "general" })).toBe("extra");
    expect(slotFor({ title: "شروط القبول العامة", feature_key: "general" })).toBe("admission");
  });
  it("only treats 100% tracks as weighted", () => {
    expect(isWeighted({ school_weight: 30, aptitude_weight: 30, achievement_weight: 40 })).toBe(true);
    expect(isWeighted({ school_weight: 0, aptitude_weight: 0, achievement_weight: 0 })).toBe(false);
  });
  it("does not repeat the city inside the region", () => {
    expect(place("مكة المكرمة", "منطقة مكة المكرمة")).toBe("مكة المكرمة");
    expect(place("الدمام", "المنطقة الشرقية")).toBe("الدمام، المنطقة الشرقية");
    expect(place("", "منطقة الرياض")).toBe("منطقة الرياض");
  });
  it("validates track forms: textual tracks may omit the year, weighted may not", () => {
    const base = { university_id: "u1", name: "SAT", requirements: "1200" };
    expect(() => sanitize("tracks", base)).not.toThrow();
    expect(() => sanitize("tracks", { ...base, school_weight: 50, aptitude_weight: 50 })).toThrow(/العام/);
    expect(() => sanitize("tracks", { ...base, academic_year: "1447", school_weight: 60, aptitude_weight: 30 })).toThrow(/100/);
  });
  it("single-type importer no longer blanks stored values", () => {
    const d = makeDiff(
      "universities",
      [{ name: "أ", city: "مكة", description: "" }],
      [{ id: "u", name: "أ", city: "مكة", description: "وصف", housing_status: "unknown" }],
      [],
    );
    expect(d[0].status).toBe("same");
  });
});

import { assess } from "../src/admin/readiness";
describe("data readiness", () => {
  const uni = { id: "u", name: "جامعة", description: "نبذة", city: "مكة", published: true, housing_status: "unknown" };
  it("flags a published university whose programs are all drafts (the Shaqra case)", () => {
    const r = assess(uni, {
      programs: [{ id: "p", university_id: "u", name: "هندسة", college: "الهندسة", published: false }],
      tracks: [],
      sections: [],
    });
    expect(r.ready).toBe(false); // no admission info
    expect(r.checks.find((c) => c.key === "admission")!.ok).toBe(false);
    expect(r.warnings[0]).toContain("كلها غير منشورة");
  });
  it("accepts a no-weights university with an admission section, and flags unsourced tracks", () => {
    const ok = assess(uni, {
      programs: [{ id: "p", university_id: "u", name: "طب", college: "الطب", published: true }],
      tracks: [],
      sections: [{ id: "s", university_id: "u", title: "شروط القبول", content: "مقابلة", feature_key: "general" }],
    });
    expect(ok.ready).toBe(true);
    expect(ok.checks.find((c) => c.key === "calculator")!.core).toBe(false);
    const bad = assess(uni, {
      programs: [{ id: "p", university_id: "u", name: "طب", published: true }],
      tracks: [{ id: "t", university_id: "u", name: "علمي", school_weight: 30, aptitude_weight: 30, achievement_weight: 40, source_url: "", verified_on: null }],
      sections: [],
    });
    expect(bad.ready).toBe(false);
    expect(bad.checks.find((c) => c.key === "sources")!.ok).toBe(false);
  });
});
