import { describe, expect, it } from "vitest";
import { safeReturnTo } from "../src/auth/redirects";
import { canOpenAdminModule } from "../src/admin/access";
const contributor = {
  user_id: "contributor",
  is_owner: false,
  is_enabled: true,
  can_edit: false,
  can_publish: false,
  can_delete: false,
};
describe("Login return destinations", () => {
  it("preserves protected deep links in the matching portal", () => {
    expect(safeReturnTo("/admin/programs?status=draft", "admin")).toBe(
      "/admin/programs?status=draft",
    );
    expect(safeReturnTo("/student/favorites", "student")).toBe(
      "/student/favorites",
    );
  });
  it("rejects external, encoded and malformed redirect destinations", () => {
    for (const value of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/%5cevil.example",
      "/%2Fevil.example",
      "/\nevil.example",
      "/%",
      "/admin/../../auth/login",
    ]) {
      expect(safeReturnTo(value, "admin")).toBe("/admin/universities");
    }
  });
  it("avoids login loops and keeps admin callbacks inside administration", () => {
    for (const value of [
      null,
      "/auth/login",
      "/admin/login",
      "/admin/reset",
      "/student/dashboard",
      "/administrator",
    ]) {
      expect(safeReturnTo(value, "admin")).toBe("/admin/universities");
    }
    expect(safeReturnTo("/auth/reset", "student")).toBe("/");
    // No "next": students land on the home page, not their portal.
    expect(safeReturnTo(null, "student")).toBe("/");
  });
});
describe("Admin module visibility (RLS remains authoritative)", () => {
  it("denies missing and disabled memberships, including a disabled owner", () => {
    expect(canOpenAdminModule(null, "member")).toBe(false);
    expect(
      canOpenAdminModule(
        { ...contributor, is_owner: true, is_enabled: false },
        "owner",
      ),
    ).toBe(false);
  });
  it("separates contributor, editor and owner-only modules", () => {
    expect(canOpenAdminModule(contributor, "member")).toBe(true);
    expect(canOpenAdminModule(contributor, "editor")).toBe(false);
    expect(
      canOpenAdminModule({ ...contributor, can_edit: true }, "editor"),
    ).toBe(true);
    expect(
      canOpenAdminModule({ ...contributor, can_edit: true }, "owner"),
    ).toBe(false);
    expect(
      canOpenAdminModule({ ...contributor, is_owner: true }, "owner"),
    ).toBe(true);
  });
});
