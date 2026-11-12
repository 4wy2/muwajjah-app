import { describe, it, expect } from "vitest";
import { savingState } from "../src/api/student";
import { headline, freeAnswer } from "../src/pages/Upgrade";

describe("saving follows the owner's setting", () => {
  it("behaves as today before the setting exists", () => {
    expect(savingState(null, true)).toBe("free");
    expect(savingState(null, false)).toBe("login");
    expect(savingState(undefined, true)).toBe("free");
  });
  it("uses the owner's state once set", () => {
    for (const s of ["hidden", "free", "login", "plus", "locked"])
      expect(savingState(s, true)).toBe(s);
  });
});

describe("upgrade page lists follow the settings", () => {
  it("headline names only the upgrade features", () => {
    expect(headline(["comparison"])).toBe("قرّر بثقة: قارن");
    expect(headline(["program_search", "comparison", "saving"])).toBe(
      "قرّر بثقة: ابحث بالتخصص، قارن، واحفظ اختياراتك",
    );
    expect(headline([])).toBe("أدوات تساعدك وقت القرار");
  });
  it("free answer adds features the owner made free, and only those", () => {
    const a = freeAnswer({ saving: "login", comparison: "locked", program_search: "free" });
    expect(a).toContain("حفظ المفضلة ونتائج الموزونة");
    expect(a).toContain("البحث بالتخصص");
    expect(a).not.toContain("مقارنة");
    expect(a).toContain("تسجيل دخول");
    expect(freeAnswer({ saving: "plus" })).not.toContain("المفضلة");
  });
});
