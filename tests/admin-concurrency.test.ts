import { describe, it, expect, vi } from "vitest";
vi.mock("../src/api/client", () => ({ db: {}, allRows: vi.fn(), rpc: vi.fn(), queryClient: {} }));
vi.mock("../src/auth/AuthProvider", () => ({ useAuth: vi.fn(), useMember: vi.fn(), useAssignments: vi.fn() }));
const { changedSince } = await import("../src/api/admin");
describe("stale edit detection", () => {
  it("flags only fields someone else changed", () => {
    const opened = { id: "1", name: "أ", city: "مكة", note: null };
    expect(changedSince(opened, { name: "أ", city: "مكة", note: "" }, ["name", "city", "note"])).toEqual([]);
    expect(changedSince(opened, { name: "ب", city: "مكة" }, ["name", "city"])).toEqual(["name"]);
  });
  it("ignores fields the server did not return", () => {
    expect(changedSince({ a: 1 }, {}, ["a"])).toEqual([]);
  });
});
