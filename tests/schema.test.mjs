// Runs the project's real SQL (database/original/schema.sql, plus.sql, the
// student migration and 002/003) on a local PostgreSQL (PGlite) and checks the
// behaviours the owner depends on. This proves the reference schema behaves as
// described; it cannot prove the production database matches the reference.
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const OWNER = "11111111-1111-4111-8111-111111111111";
const EDITOR = "22222222-2222-4222-8222-222222222222"; // edit only, assigned to U
const STUDENT = "33333333-3333-4333-8333-333333333333";
const STUDENT2 = "44444444-4444-4444-8444-444444444444";
let db;
const file = (n) => readFileSync(new URL("../database/" + n, import.meta.url), "utf8");
const as = (id) =>
  db.exec(`reset role; set role ${id ? "authenticated" : "anon"};
    select set_config('request.jwt.claim.sub','${id || ""}',false);`);
const root = () => db.exec("reset role;");
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const fails = async (sql, params = []) => {
  try {
    await db.query(sql, params);
    return false;
  } catch {
    return true;
  }
};
let U, U2, P1, P2, Tw, Tt, S1;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}',
      email_confirmed_at timestamptz, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth, public to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users(id,email,raw_user_meta_data) values
      ('${OWNER}','owner@x.sa','{}'), ('${EDITOR}','editor@x.sa','{"guide_signup":true,"guide_name":"محرر"}'),
      ('${STUDENT}','s1@x.sa','{"guide_account_kind":"student"}'), ('${STUDENT2}','s2@x.sa','{"guide_account_kind":"student"}');`);
  for (const f of ["original/schema.sql", "original/plus.sql", "001_student_features.sql"]) await db.exec(file(f));
  await db.exec(`insert into guide_admins(user_id,is_owner,can_edit,can_publish,can_delete) values ('${OWNER}',true,true,true,true);`);
  await as(OWNER);
  U = (await q(`insert into guide_universities(name) values('جامعة أ') returning id`))[0].id;
  U2 = (await q(`insert into guide_universities(name) values('جامعة ب') returning id`))[0].id;
  P1 = (await q(`insert into guide_programs(university_id,name) values($1,'هندسة') returning id`, [U]))[0].id;
  P2 = (await q(`insert into guide_programs(university_id,name) values($1,'طب') returning id`, [U]))[0].id;
  Tw = (await q(`insert into guide_tracks(university_id,name,academic_year,school_weight,aptitude_weight,achievement_weight,source_url,verified_on)
    values($1,'علمي','1447',30,30,40,'https://u.sa','2026-01-01') returning id`, [U]))[0].id;
  Tt = (await q(`insert into guide_tracks(university_id,name,academic_year,requirements,source_url,verified_on)
    values($1,'SAT','1447','1200 فأعلى','https://u.sa','2026-01-01') returning id`, [U]))[0].id;
  S1 = (await q(`insert into guide_sections(university_id,title,content) values($1,'التصنيف','QS') returning id`, [U]))[0].id;
  await q(`insert into guide_cutoffs(university_id,program_name,academic_year,ratio,source_url,verified_on)
    values($1,'طب','1446',95,'https://u.sa','2026-01-01')`, [U]);
  await q(`select guide_set_member('editor@x.sa',true,false,false,true,$1)`, [[U]]);
}, 60000);
afterAll(async () => db?.close());

describe("publication (reference schema)", () => {
  it("publishes the university with its content but respects manual hiding and leaves cutoffs", async () => {
    await as(OWNER);
    await q(`select * from guide_change_record_state('guide_programs',$1,'draft')`, [[P2]]);
    const [{ r }] = await q(`select guide_publish_university_with_content($1) r`, [U]);
    expect(r).toMatchObject({ programs: 1, tracks: 2, sections: 1, hidden: 1, pending_tracks: 0 });
    await as(null);
    expect((await q(`select name from guide_programs`)).map((x) => x.name)).toEqual(["هندسة"]);
    expect(await q(`select * from guide_cutoffs`)).toEqual([]);
  });
  it("does not bring back trashed-then-restored content on republish until it is re-included", async () => {
    await as(OWNER);
    await q(`select * from guide_change_record_state('guide_programs',$1,'trash')`, [[P1]]);
    await q(`select * from guide_change_record_state('guide_programs',$1,'restore')`, [[P1]]);
    await q(`select guide_publish_university_with_content($1)`, [U]);
    await as(null);
    expect(await q(`select name from guide_programs`)).toEqual([]);
    await as(OWNER);
    await q(`select * from guide_change_record_state('guide_programs',$1,'include')`, [[P1]]);
    await q(`select guide_publish_university_with_content($1)`, [U]);
    await as(null);
    expect((await q(`select name from guide_programs`)).map((x) => x.name)).toEqual(["هندسة"]);
  });
  it("hides all content from visitors when the university is unpublished or trashed", async () => {
    await as(OWNER);
    await q(`select * from guide_change_record_state('guide_universities',$1,'draft')`, [[U]]);
    await as(null);
    expect(await q(`select id from guide_programs`)).toEqual([]);
    expect(await q(`select id from guide_sections`)).toEqual([]);
    await as(OWNER);
    await q(`select guide_publish_university_with_content($1)`, [U]);
  });
});

describe("team permissions are enforced by the database", () => {
  it("an editor cannot touch an unassigned university, even with a direct request", async () => {
    await as(EDITOR);
    expect(await q(`update guide_universities set city='x' where id=$1 returning id`, [U2])).toEqual([]);
    expect(await fails(`insert into guide_programs(university_id,name) values($1,'دخيل')`, [U2])).toBe(true);
  });
  it("an editor without publish permission edits drafts only and cannot publish", async () => {
    await as(EDITOR);
    expect((await q(`update guide_programs set college='ك' where id=$1 returning id`, [P2])).length).toBe(1);
    // Reference-schema rule: editing a published row needs publish permission too.
    expect(await fails(`update guide_programs set college='ك' where id=$1`, [P1])).toBe(true);
    expect(await fails(`select guide_publish_university_with_content($1)`, [U])).toBe(true);
    expect(await fails(`update guide_programs set published=false where id=$1`, [P1])).toBe(true);
  });
  it("students cannot grant themselves admin, plus or feature access", async () => {
    await as(STUDENT);
    expect(await fails(`insert into guide_admins(user_id,is_owner) values($1,true)`, [STUDENT])).toBe(true);
    expect(await fails(`select guide_owner_manage_plus($1,'grant',365,'')`, [STUDENT])).toBe(true);
    expect(await fails(`select guide_owner_set_feature('historical_cutoffs','free',false)`)).toBe(true);
    expect(await q(`select * from guide_audit_log`)).toEqual([]); // RLS: owner only
  });
  it("records who changed what", async () => {
    await as(OWNER);
    const rows = await q(`select actor_email, table_name, action from guide_audit_log where row_id=$1 order by id`, [P2]);
    expect(rows[0]).toMatchObject({ actor_email: "owner@x.sa", table_name: "guide_programs", action: "INSERT" });
    expect(rows.some((r) => r.actor_email === "editor@x.sa")).toBe(true);
  });
  it("lists the contributor request for the owner only", async () => {
    await root();
    await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
      ('55555555-5555-4555-8555-555555555555','new@x.sa','{"guide_signup":true,"guide_name":"جديد"}')`);
    await as(OWNER);
    expect((await q(`select email from guide_pending_signups()`)).map((r) => r.email)).toContain("new@x.sa");
    await as(STUDENT);
    expect(await fails(`select * from guide_pending_signups()`)).toBe(true);
  });
});

describe("silent launch: plus-only cutoffs without a public offer", () => {
  it("visitors and non-plus students get 'hidden' and no rows; plus holders see them until revoked", async () => {
    await as(OWNER);
    await q(`update guide_cutoffs set published=true`);
    await q(`select guide_owner_set_feature('historical_cutoffs','plus',false)`);
    await as(null);
    expect((await q(`select guide_feature_state('historical_cutoffs') s`))[0].s).toBe("hidden");
    expect(await q(`select * from guide_cutoffs`)).toEqual([]);
    await as(STUDENT);
    expect(await q(`select * from guide_cutoffs`)).toEqual([]);
    await as(OWNER);
    await q(`select guide_owner_manage_plus($1,'grant',30,'تجربة')`, [STUDENT]);
    await as(STUDENT);
    expect((await q(`select guide_feature_state('historical_cutoffs') s`))[0].s).toBe("plus");
    expect((await q(`select ratio from guide_cutoffs`)).length).toBe(1);
    await as(STUDENT2);
    expect(await q(`select * from guide_cutoffs`)).toEqual([]);
    await as(OWNER);
    await q(`select guide_owner_manage_plus($1,'revoke',30,'')`, [STUDENT]);
    await as(STUDENT);
    expect(await q(`select * from guide_cutoffs`)).toEqual([]);
  });
});

describe("migration 002: textual tracks without a year", () => {
  it("is rejected before 002, accepted after, while weighted tracks still need a year", async () => {
    await as(OWNER);
    const textual = `insert into guide_tracks(university_id,name,academic_year,requirements) values($1,'أولمبياد','','شروط')`;
    expect(await fails(textual, [U])).toBe(true);
    await root();
    await db.exec(file("002_textual_tracks.sql"));
    await db.exec(file("002_textual_tracks.sql")); // re-runnable
    await as(OWNER);
    expect(await fails(textual, [U])).toBe(false);
    expect(
      await fails(
        `insert into guide_tracks(university_id,name,academic_year,school_weight,aptitude_weight,achievement_weight) values($1,'موزون بلا سنة','',30,30,40)`,
        [U],
      ),
    ).toBe(true);
    expect(await fails(`insert into guide_cutoffs(university_id,program_name,academic_year,ratio) values($1,'x','',90)`, [U])).toBe(true);
  });
});

describe("analytics", () => {
  it("the reference recording functions fail as written (ambiguous column)", async () => {
    await as(null);
    expect(await fails(`select guide_record_interest('university',$1)`, [U])).toBe(true);
    expect(await fails(`select guide_record_missing_search('بحث بلا نتيجة')`)).toBe(true);
  });
  it("003 fixes recording and lets the owner stop analytics writes without affecting browsing", async () => {
    await root();
    await db.exec(file("003_analytics_fix.sql"));
    await db.exec(file("003_analytics_fix.sql"));
    await as(null);
    await q(`select guide_record_interest('university',$1)`, [U]);
    await as(OWNER);
    const before = (await q(`select coalesce(sum(hits),0)::int n from guide_daily_interest`))[0].n;
    expect(before).toBe(1);
    await as(STUDENT);
    expect(await fails(`select guide_owner_set_analytics(false)`)).toBe(true);
    await as(OWNER);
    await q(`select guide_owner_set_analytics(false)`);
    await as(null);
    await q(`select guide_record_interest('university',$1)`, [U]);
    await q(`select guide_record_missing_search('تخصص غير موجود')`);
    expect((await q(`select count(*)::int n from guide_universities`))[0].n).toBe(1);
    await as(OWNER);
    expect((await q(`select coalesce(sum(hits),0)::int n from guide_daily_interest`))[0].n).toBe(1);
    expect((await q(`select count(*)::int n from guide_daily_missing_search`))[0].n).toBe(0);
  });
  it("archive deletion refuses recent days and changed counts", async () => {
    await as(OWNER);
    expect(await fails(`select guide_delete_archived_analytics(current_date-10,0,0)`)).toBe(true);
    await root();
    await db.exec(`insert into guide_daily_interest(event_day,event_kind,entity_id,hits) values (current_date-200,'university','${U}',5)`);
    await as(OWNER);
    expect(await fails(`select guide_delete_archived_analytics(current_date-90,0,0)`)).toBe(true);
    const [{ r }] = await q(`select guide_delete_archived_analytics(current_date-90,1,0) r`);
    expect(r).toEqual({ interest_rows: 1, search_rows: 0 });
  });
});

describe("migration 004: students delete their own saved scores", () => {
  it("only the owner of a score can delete it, and only after 004", async () => {
    await as(OWNER);
    await q(`select guide_publish_university_with_content($1)`, [U]);
    await as(STUDENT);
    const [{ id }] = await q(
      `insert into guide_student_scores(user_id,university_id,track_id,school,aptitude,achievement,result)
       values($1,$2,$3,90,80,85,85) returning id`,
      [STUDENT, U, Tw],
    );
    expect(await fails(`delete from guide_student_scores where id=$1`, [id])).toBe(true); // no grant before 004
    await root();
    await db.exec(file("004_student_score_delete.sql"));
    await db.exec(file("004_student_score_delete.sql"));
    await as(STUDENT2);
    expect(await q(`delete from guide_student_scores where id=$1 returning id`, [id])).toEqual([]);
    await as(STUDENT);
    expect((await q(`delete from guide_student_scores where id=$1 returning id`, [id])).length).toBe(1);
  });
});
