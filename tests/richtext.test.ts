import { describe, it, expect } from "vitest";
import { parseBlocks, sameText } from "../src/components/RichText";
describe("rich text", () => {
  it("turns dash lines into one list", () => {
    expect(parseBlocks("مقدمة\n- أ\n- ب\nخاتمة")).toEqual([
      { para: "مقدمة" },
      { list: ["أ", "ب"] },
      { para: "خاتمة" },
    ]);
  });
  it("keeps plain multi-line paragraphs", () => {
    expect(parseBlocks("سطر\nسطر٢\n\nفقرة")).toEqual([{ para: "سطر\nسطر٢" }, { para: "فقرة" }]);
  });
  it("detects repeated housing text", () => {
    expect(sameText("يتوفر سكن للطلاب.", "- يتوفر سكن للطلاب")).toBe(true);
    expect(sameText("يتوفر سكن", "لا يتوفر حاليًا مقاعد")).toBe(false);
  });
});
