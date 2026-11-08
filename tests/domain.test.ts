import { describe, it, expect } from "vitest";
import { calculate, normalize, safeUrl } from "../src/lib/utils";
import { makeDiff, parseImport } from "../src/admin/import";
const weights = {
  school_weight: 30,
  aptitude_weight: 30,
  achievement_weight: 40,
};
describe("Admission calculator", () => {
  it("uses exact university weights", () =>
    expect(calculate(weights, ["97", "85", "90"])).toBe(90.6));
  it("rejects a bad weight total", () =>
    expect(() =>
      calculate({ ...weights, school_weight: 20 }, ["90", "90", "90"]),
    ).toThrow());
  it("does not coerce a missing required score to zero", () =>
    expect(() => calculate(weights, ["", "90", "90"])).toThrow());
  it("accepts zero and rejects out-of-range or nonnumeric values", () => {
    expect(calculate(weights, ["0", "0", "0"])).toBe(0);
    expect(() => calculate(weights, ["101", "0", "0"])).toThrow();
    expect(() => calculate(weights, ["x", "1", "2"])).toThrow();
  });
  it("ignores a score when its weight is zero", () =>
    expect(
      calculate(
        { school_weight: 50, aptitude_weight: 50, achievement_weight: 0 },
        ["90", "80", ""],
      ),
    ).toBe(85));
});
describe("Safe links and Arabic search", () => {
  it("rejects executable link protocols", () => {
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,hello")).toBe("");
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
  });
  it("normalizes common Arabic spelling and accents", () =>
    expect(normalize("جَامِعَة الإمام")).toBe(normalize("جامعة الامام")));
});
describe("Import review", () => {
  it("handles quoted CSV commas and newlines", () => {
    const rows = parseImport(
      'name,description\n"جامعة تجريبية","سطر، ونص\nثانٍ"',
      "data.csv",
      "universities",
    );
    expect(rows[0].description).toContain("\n");
  });
  it("blocks duplicate incoming records", () => {
    const rows = makeDiff(
      "universities",
      [
        { name: "أ", city: "ب" },
        { name: "أ", city: "ب" },
      ],
      [],
      [],
    );
    expect(rows.map((r) => r.status)).toEqual(["new", "error"]);
  });
  it("cannot change another university or invent an existing id", () => {
    expect(
      makeDiff(
        "programs",
        [{ id: "x", university_id: "other", name: "test" }],
        [{ id: "x", university_id: "u", name: "test" }],
        [{ id: "u" }],
      )[0].status,
    ).toBe("error");
    expect(
      makeDiff("universities", [{ id: "unknown", name: "test" }], [], [])[0]
        .status,
    ).toBe("error");
  });
  it("does not import publication, deletion, or arbitrary privileged properties", () => {
    const d = makeDiff(
      "universities",
      [{ name: "Test", published: true, deleted_at: "today", is_owner: true }],
      [],
      [],
    )[0];
    expect(d.status).toBe("new");
    expect(d.payload).not.toHaveProperty("published");
    expect(d.payload).not.toHaveProperty("deleted_at");
    expect(d.payload).not.toHaveProperty("is_owner");
  });
  it("preserves fields not supplied by a partial update", () => {
    const d = makeDiff(
      "universities",
      [{ id: "u", name: "New" }],
      [{ id: "u", name: "Old", city: "Riyadh", housing_status: "unknown" }],
      [],
    )[0];
    expect(d.payload.city).toBe("Riyadh");
    expect(d.changes.find((c) => c.field === "name")?.before).toBe("Old");
  });
});
