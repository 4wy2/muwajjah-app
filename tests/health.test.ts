import { describe, it, expect } from "vitest";
import { healthChecks, alerts, FREE_DB_BYTES, type Health } from "../src/admin/health";

const base: Health = {
  db_bytes: 22 * 1024 * 1024, users_total: 3, active_month: 0, new_today: 0, new_week: 0, new_month: 0,
  views: [], views_month: 74, universities: 27, programs: 2509, programs_sourced: 1, sections: 235,
  sections_sourced: 0, tracks: 59, tracks_published: 0, cutoffs: 23, private: true, commercial: false,
  season_label: "موسم قبول 1448", season_ends_at: "2026-11-20", has_purchase_url: false, today: "2026-11-12",
};
const get = (h: Health, id: string) => healthChecks(h).find((c) => c.id === id)!;

describe("site health checks", () => {
  it("reads today's real state correctly", () => {
    expect(get(base, "db").level).toBe("ok");
    expect(get(base, "season").level).toBe("warn"); // 8 days left
    expect(get(base, "tracks").level).toBe("bad"); // calculator hidden
    expect(get(base, "sources").level).toBe("warn");
    expect(get(base, "private").level).toBe("info");
    expect(healthChecks(base).some((c) => c.id === "buy")).toBe(false); // upgrades off
    expect(alerts(healthChecks(base))[0].level).toBe("bad");
  });
  it("warns at 60% and alerts at 80% of the free plan, with an upgrade action", () => {
    expect(get({ ...base, db_bytes: FREE_DB_BYTES * 0.65 }, "db").level).toBe("warn");
    const db = get({ ...base, db_bytes: FREE_DB_BYTES * 0.85 }, "db");
    expect(db.level).toBe("bad");
    expect(db.action?.to).toContain("supabase.com");
    expect(get({ ...base, active_month: 45_000 }, "users").level).toBe("bad");
    expect(get({ ...base, views_month: 16_000 }, "browsing").level).toBe("warn");
    expect(get({ ...base, views_month: 31_000 }, "browsing").level).toBe("bad");
  });
  it("flags an ended season and upgrades switched on without a purchase link", () => {
    expect(get({ ...base, season_ends_at: "2026-11-01" }, "season").level).toBe("bad");
    expect(get({ ...base, season_ends_at: "2027-08-31" }, "season").level).toBe("ok");
    expect(get({ ...base, commercial: true }, "buy").level).toBe("bad");
    expect(get({ ...base, commercial: true, has_purchase_url: true }, "buy").level).toBe("ok");
  });
  it("is calm when everything is fine", () => {
    const fine = { ...base, tracks_published: 59, programs_sourced: 2509, sections_sourced: 235, private: false, season_ends_at: "2027-08-31" };
    expect(alerts(healthChecks(fine))).toHaveLength(0);
  });
});
