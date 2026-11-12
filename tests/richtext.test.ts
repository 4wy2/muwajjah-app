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

import { paraParts } from "../src/components/RichText";
import { slotFor } from "../src/lib/sections";
describe("paragraph structure", () => {
  it("reads short headings, fact tiles and long labelled text", () => {
    expect(paraParts("للسعوديين:\nعالميًا: ضمن الفئة 1201–1400.\nشروطه: الانتظام في الدراسة، وأن يكون الطالب من خارج المدينة")).toEqual([
      { head: "للسعوديين" },
      { kv: [["عالميًا", "ضمن الفئة 1201–1400"]] },
      { lead: ["شروطه", "الانتظام في الدراسة، وأن يكون الطالب من خارج المدينة"] },
    ]);
  });
  it("leaves links and ordinary sentences alone", () => {
    expect(paraParts("الموقع: https://iu.edu.sa")).toEqual([{ text: "الموقع: https://iu.edu.sa" }]);
    expect(paraParts("سطر عادي بدون نقطتين")).toEqual([{ text: "سطر عادي بدون نقطتين" }]);
  });
  it("puts the weighted-percentage section with admission", () => {
    expect(slotFor({ title: "النسبة الموزونة", feature_key: "general" })).toBe("admission");
    expect(slotFor({ title: "أقل موزونة مقبولة", feature_key: "general" })).toBe("cutoffs");
  });
});
