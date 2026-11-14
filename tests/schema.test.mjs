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
  // Like Supabase: its default privileges grant execute on new functions to
  // anon and authenticated directly, so "revoke from public" alone leaves them.
  await db.exec(`grant execute on all functions in schema public to anon, authenticated;`);
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

describe("migration 005: subscriptions switch, program search, season and pending Plus", () => {
  it("applies twice, keeps search hidden until the switch, then sells it", async () => {
    await root();
    await db.exec(file("005_commerce.sql"));
    await db.exec(file("005_commerce.sql"));
    // Program P1 ('هندسة') is published in U by the publication tests.
    await as(null);
    expect(await fails(`select * from guide_search_programs('هندسة')`)).toBe(true);
    expect((await q(`select guide_feature_state('program_search') s`))[0].s).toBe("hidden");
    await as(STUDENT);
    expect(await fails(`select guide_owner_set_offer(true,'1447','29 ريال','https://zid.store/x','2099-01-01','')`)).toBe(true);
    expect(await fails(`update guide_offer_settings set commercial_enabled=true`)).toBe(true);
    await as(OWNER);
    expect(await fails(`select guide_owner_set_offer(true,'','','',null,'')`)).toBe(true); // needs season end
    expect(await fails(`select guide_owner_set_offer(false,'','','http://bad','2099-01-01','')`)).toBe(true);
    await q(`select guide_owner_set_offer(true,'موسم 1447','29 ريال','https://zid.store/x','2099-01-01','')`);
    await as(null);
    expect((await q(`select guide_feature_state('program_search') s`))[0].s).toBe("locked");
    expect((await q(`select price_text from guide_offer_settings`))[0].price_text).toBe("29 ريال");
    expect(await fails(`select * from guide_search_programs('هندسة')`)).toBe(true);
    // Switching off hides every offer again.
    await as(OWNER);
    await q(`select guide_owner_set_offer(false,'موسم 1447','29 ريال','https://zid.store/x','2099-01-01','')`);
    await as(null);
    expect((await q(`select guide_feature_state('program_search') s`))[0].s).toBe("hidden");
  });
  it("season grant runs to the season end and unlocks search for that student only", async () => {
    await as(OWNER);
    await q(`select guide_owner_set_offer(true,'موسم','','', '2099-01-01','')`);
    const [{ e }] = await q(`select guide_owner_manage_plus($1,'season',0,'تحويل') e`, [STUDENT2]);
    expect(new Date(e).getUTCFullYear()).toBe(2099);
    await as(STUDENT2);
    const rows = await q(`select program_name, university_name from guide_search_programs('هند')`);
    expect(rows.map((r) => r.program_name)).toEqual(["هندسة"]);
    await as(STUDENT);
    expect(await fails(`select * from guide_search_programs('هند')`)).toBe(true);
  });
  it("a payment made before signing up is claimed once by the confirmed email owner", async () => {
    await root();
    await db.exec(`update auth.users set email_confirmed_at=now() where id='${STUDENT}';
      insert into guide_pending_plus(email,external_order_id,expires_at) values('s1@x.sa','Z-1','2099-01-02');`);
    await as(STUDENT2);
    expect((await q(`select guide_claim_pending_plus() n`))[0].n).toBe(0);
    await as(STUDENT);
    expect(await fails(`select * from guide_pending_plus`)).toBe(true); // not readable by students
    expect((await q(`select guide_claim_pending_plus() n`))[0].n).toBe(1);
    expect((await q(`select guide_claim_pending_plus() n`))[0].n).toBe(0);
    expect((await q(`select guide_has_plus() p`))[0].p).toBe(true);
  });
});

describe("migration 006: Zid paid orders", () => {
  it("only the server role can grant; grants once, holds unknown buyers, revokes on refund", async () => {
    await root();
    await db.exec(`do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
      grant usage on schema public, auth to service_role;`);
    await db.exec(file("006_zid_orders.sql"));
    await db.exec(file("006_zid_orders.sql"));
    await as(STUDENT2);
    expect(await fails(`select guide_service_zid_order('Z-9','s2@x.sa',true)`)).toBe(true);
    await root();
    await db.exec(`update auth.users set email_confirmed_at=now() where id='${STUDENT2}'`);
    await db.exec("set role service_role");
    expect((await q(`select guide_service_zid_order('Z-9','S2@x.sa ',true) r`))[0].r).toBe("granted");
    expect((await q(`select guide_service_zid_order('Z-9','s2@x.sa',true) r`))[0].r).toBe("duplicate");
    expect((await q(`select guide_service_zid_order('Z-10','new@x.sa',true) r`))[0].r).toBe("pending");
    expect((await q(`select guide_service_zid_order('Z-9','',false) r`))[0].r).toBe("revoked");
    await root();
    expect((await q(`select count(*)::int n from guide_plus_entitlements where external_order_id='Z-9' and revoked_at is not null`))[0].n).toBe(1);
  });
});

describe("migration 007: members-only features", () => {
  it("free for signed-in users, asks guests to sign in, and the server enforces it", async () => {
    await root();
    await db.exec(file("007_members_mode.sql"));
    await db.exec(file("007_members_mode.sql"));
    await as(OWNER);
    await q(`select guide_owner_set_offer(false,'','','',null,'')`);
    await q(`select guide_owner_set_feature('program_search','members',false)`);
    await as(null);
    expect((await q(`select guide_feature_state('program_search') s`))[0].s).toBe("login");
    expect(await fails(`select * from guide_search_programs('هند')`)).toBe(true);
    await as(STUDENT);
    expect((await q(`select guide_feature_state('program_search') s`))[0].s).toBe("free");
    expect((await q(`select program_name from guide_search_programs('هند')`)).length).toBe(1);
    await root();
    await db.exec(file("007_members_mode_rollback.sql"));
    await as(null);
    expect((await q(`select guide_feature_state('program_search') s`))[0].s).toBe("hidden");
    await root();
    await db.exec(file("007_members_mode.sql"));
  });
});

describe("migration 008: edits over POST keep every database rule", () => {
  it("applies the same permissions as a direct update", async () => {
    await root();
    await db.exec(file("008_update_via_post.sql"));
    await db.exec(file("008_update_via_post.sql"));
    await as(null);
    expect(await fails(`select guide_update_record('programs',$1,'{"college":"x"}')`, [P2])).toBe(true);
    await as(EDITOR);
    // Draft row in an assigned university: allowed.
    expect((await q(`select guide_update_record('programs',$1,'{"college":"كلية أ"}') r`, [P2]))[0].r).toBe(P2);
    // Unassigned university: no row changes.
    expect((await q(`select guide_update_record('universities',$1,'{"city":"x"}') r`, [U2]))[0].r).toBe(null);
    // Unknown column and unknown table are refused.
    expect(await fails(`select guide_update_record('programs',$1,'{"nope":1}')`, [P2])).toBe(true);
    expect(await fails(`select guide_update_record('admins',$1,'{"is_owner":true}')`, [P2])).toBe(true);
    await as(OWNER);
    expect((await q(`select guide_update_record('cutoffs',(select id from guide_cutoffs limit 1),'{"ratio":91.5}') r`))[0].r).not.toBe(null);
    expect(Number((await q(`select ratio from guide_cutoffs limit 1`))[0].ratio)).toBe(91.5);
  });
});

describe("migration 009: housing says who it is for", () => {
  it("accepts the new values, keeps the old ones, rejects anything else, and rolls back", async () => {
    await root();
    await db.exec(file("009_housing_gender.sql"));
    await db.exec(file("009_housing_gender.sql"));
    await as(OWNER);
    for (const v of ["male_only", "female_only", "both", "unavailable", "available"])
      expect((await q(`select guide_update_record('universities',$1,$2::jsonb) r`, [U, JSON.stringify({ housing_status: v })]))[0].r).toBe(U);
    expect(await fails(`select guide_update_record('universities',$1,'{"housing_status":"girls"}')`, [U])).toBe(true);
    await root();
    await db.exec(`update guide_universities set housing_status='unknown'`);
    await db.exec(file("009_housing_gender_rollback.sql"));
    expect(await fails(`update guide_universities set housing_status='both'`)).toBe(true);
    await db.exec(file("009_housing_gender.sql"));
  });
});

describe("migration 010 (prepared): visitors cannot call admin functions", () => {
  it("blocks anon from owner RPCs but keeps public browsing and the owner's tools", async () => {
    await root();
    await db.exec(file("010_revoke_anon_admin_rpc.sql"));
    await db.exec(file("010_revoke_anon_admin_rpc.sql"));
    expect((await q(`select has_function_privilege('anon','public.guide_list_team()','execute') p`))[0].p).toBe(false);
    await as(null);
    expect(await fails(`select guide_list_team()`)).toBe(true);
    // Policy helpers stay callable: row-level policies run them as the visitor.
    expect(await fails(`select guide_is_owner()`)).toBe(false);
    expect((await q(`select guide_feature_state('comparison') s`))[0].s).toBeTruthy();
    expect(await fails(`select id from guide_universities where published`)).toBe(false);
    await as(OWNER);
    expect((await q(`select guide_is_owner() o`))[0].o).toBe(true);
    await root();
    await db.exec(file("010_revoke_anon_admin_rpc_rollback.sql"));
    expect((await q(`select has_function_privilege('anon','public.guide_list_team()','execute') p`))[0].p).toBe(true);
  });
});

describe("migration 011: private site switch", () => {
  it("hides content from visitors and students while private, keeps the team working, and only the owner flips it", async () => {
    await root();
    await db.exec(`update guide_universities set published=true, deleted_at=null where id='${U}'`);
    await db.exec(file("011_private_site.sql"));
    await db.exec(file("011_private_site.sql"));
    const unis = async () => (await q(`select count(*)::int n from guide_universities where published`))[0].n;
    await as(null);
    expect(await unis()).toBe(0);
    expect((await q(`select guide_feature_state('comparison') s`))[0].s).toBe("hidden");
    expect((await q(`select count(*)::int n from guide_public_program_counts()`))[0].n).toBe(0);
    expect(await fails(`select guide_owner_set_private(false)`)).toBe(true);
    await as(STUDENT);
    expect(await unis()).toBe(0);
    expect(await fails(`select guide_owner_set_private(false)`)).toBe(true);
    expect(await fails(`update guide_site_settings set private=false`)).toBe(true);
    await as(EDITOR);
    expect(await unis()).toBeGreaterThan(0);
    await as(OWNER);
    expect(await unis()).toBeGreaterThan(0);
    await q(`select guide_owner_set_private(false)`);
    await as(null);
    expect(await unis()).toBeGreaterThan(0);
    expect((await q(`select guide_site_private() p`))[0].p).toBe(false);
    await as(OWNER);
    await q(`select guide_owner_set_private(true)`);
    await root();
    await db.exec(file("011_private_site_rollback.sql"));
    await as(null);
    expect(await unis()).toBeGreaterThan(0);
  });
});

describe("migration 010 together with 011", () => {
  it("visitors can still read public content after 010, and get nothing (no error) while private", async () => {
    await root();
    await db.exec(`update guide_universities set published=true, deleted_at=null where id='${U}'`);
    await db.exec(file("011_private_site.sql"));
    await db.exec(file("010_revoke_anon_admin_rpc.sql"));
    await db.exec(`update guide_site_settings set private=false`);
    await as(null);
    expect(await fails(`select id from guide_universities where published`)).toBe(false);
    expect((await q(`select count(*)::int n from guide_universities where published`))[0].n).toBeGreaterThan(0);
    expect(await fails(`select id from guide_programs`)).toBe(false);
    expect(await fails(`select guide_list_team()`)).toBe(true);
    await root();
    await db.exec(`update guide_site_settings set private=true`);
    await as(null);
    expect((await q(`select count(*)::int n from guide_universities where published`))[0].n).toBe(0);
    await root();
    await db.exec(file("010_revoke_anon_admin_rpc_rollback.sql"));
  });
});

describe("migration 012: saving as an owner-controlled feature", () => {
  it("keeps saving open to signed-in students by default, and the owner can gate it", async () => {
    await root();
    await db.exec(`update guide_universities set published=true, deleted_at=null where id='${U}'`);
    await db.exec(`update guide_site_settings set private=false`);
    await db.exec(`update guide_tracks set published=true, deleted_at=null where id='${Tw}'`);
    await db.exec(file("012_saving_feature.sql"));
    await db.exec(file("012_saving_feature.sql"));
    const save = () => fails(`insert into guide_student_favorites(user_id, university_id) values ($1, $2)`, [STUDENT, U]);
    const clear = async () => { await root(); await db.exec(`delete from guide_student_favorites where user_id='${STUDENT}'`); };
    await as(STUDENT);
    expect(await save()).toBe(false); // default 'members': unchanged behaviour
    await clear();
    await as(STUDENT);
    expect(await fails(`select guide_owner_set_feature('saving','plus',false)`)).toBe(true);
    await as(OWNER);
    await q(`select guide_owner_set_feature('saving','plus',false)`);
    const S3 = "55555555-5555-4555-8555-555555555555";
    await root();
    await db.exec(`insert into auth.users(id,email) values ('${S3}','s3@x.sa') on conflict do nothing`);
    await as(S3);
    expect((await q(`select guide_has_plus() p`))[0].p).toBe(false);
    expect(await fails(`insert into guide_student_favorites(user_id, university_id) values ($1, $2)`, [S3, U])).toBe(true); // no upgrade: refused by the database
    expect(await fails(`select * from guide_student_favorites`)).toBe(false); // own data still readable
    await as(STUDENT);
    expect((await q(`select guide_has_plus() p`))[0].p).toBe(true);
    expect(await save()).toBe(false); // upgraded: allowed
    await clear();
    await as(OWNER);
    await q(`select guide_owner_set_feature('saving','hidden',false)`);
    await as(STUDENT);
    expect(await save()).toBe(true);
    expect(await fails(`insert into guide_student_scores(user_id,university_id,track_id,school,aptitude,achievement,result) values($1,$2,$3,90,80,85,85)`, [STUDENT, U, Tw])).toBe(true);
    await root();
    await db.exec(file("012_saving_feature_rollback.sql"));
    await as(STUDENT);
    expect(await save()).toBe(false);
    await clear();
    await db.exec(`update guide_site_settings set private=true`);
  });
});

describe("migration 013: filters and comparison sharing", () => {
  it("adds both as hidden, lets only the owner change them, and rolls back", async () => {
    await root();
    await db.exec(`update guide_site_settings set private=false`);
    await db.exec(file("012_saving_feature.sql"));
    await db.exec(file("013_filters_share.sql"));
    await db.exec(file("013_filters_share.sql"));
    await as(STUDENT);
    expect((await q(`select guide_feature_state('filters') s`))[0].s).toBe("hidden");
    expect((await q(`select guide_feature_state('compare_share') s`))[0].s).toBe("hidden");
    expect(await fails(`select guide_owner_set_feature('filters','free',false)`)).toBe(true);
    await as(OWNER);
    await q(`select guide_owner_set_feature('filters','free',false)`);
    await q(`select guide_owner_set_feature('compare_share','members',false)`);
    await q(`select guide_owner_set_feature('saving','members',false)`);
    await as(null);
    expect((await q(`select guide_feature_state('filters') s`))[0].s).toBe("free");
    expect((await q(`select guide_feature_state('compare_share') s`))[0].s).toBe("login");
    await root();
    await db.exec(file("013_filters_share_rollback.sql"));
    expect((await q(`select count(*)::int n from guide_feature_flags where feature_key in ('filters','compare_share')`))[0].n).toBe(0);
    await as(OWNER);
    expect(await fails(`select guide_owner_set_feature('filters','free',false)`)).toBe(true);
    expect(await fails(`select guide_owner_set_feature('saving','free',false)`)).toBe(false);
    await root();
    await db.exec(`update guide_site_settings set private=true`);
  });
});

describe("migration 014: site health (owner only, read only)", () => {
  it("answers the owner, refuses everyone else, and rolls back", async () => {
    await root();
    await db.exec(`alter table auth.users add column if not exists last_sign_in_at timestamptz`);
    await db.exec(file("014_site_health.sql"));
    await db.exec(file("014_site_health.sql"));
    await as(OWNER);
    const [{ h }] = await q(`select guide_owner_site_health() h`);
    expect(h.db_bytes).toBeGreaterThan(0);
    expect(h.users_total).toBeGreaterThan(0);
    expect(Array.isArray(h.views)).toBe(true);
    expect(typeof h.private).toBe("boolean");
    await as(STUDENT);
    expect(await fails(`select guide_owner_site_health()`)).toBe(true);
    await as(EDITOR);
    expect(await fails(`select guide_owner_site_health()`)).toBe(true);
    await as(null);
    expect(await fails(`select guide_owner_site_health()`)).toBe(true);
    await root();
    await db.exec(file("014_site_health_rollback.sql"));
    await as(OWNER);
    expect(await fails(`select guide_owner_site_health()`)).toBe(true);
    await root();
  });
});

describe("migration 015: same permissions, faster policies", () => {
  it("keeps who can read and write profiles, plus and memberships", async () => {
    await root();
    await db.exec(file("015_rls_speed.sql"));
    await db.exec(file("015_rls_speed.sql"));
    const check = async () => {
      await as(STUDENT);
      const plus = await q(`select user_id from guide_plus_entitlements`);
      expect(plus.every((r) => r.user_id === STUDENT)).toBe(true);
      const profs = await q(`select user_id from guide_student_profiles`);
      expect(profs.every((r) => r.user_id === STUDENT)).toBe(true);
      expect(await fails(`insert into guide_student_profiles(user_id, display_name) values ($1,'طالب ثاني')`, [STUDENT2])).toBe(true);
      expect(await fails(`insert into guide_student_profiles(user_id, display_name) values ($1,'طالب') on conflict (user_id) do update set display_name = excluded.display_name`, [STUDENT])).toBe(false);
      const adm = await q(`select user_id from guide_admins`);
      expect(adm.length).toBe(0);
      await as(EDITOR);
      expect((await q(`select user_id from guide_admins`)).every((r) => r.user_id === EDITOR)).toBe(true);
      expect(await fails(`insert into guide_student_profiles(user_id, display_name) values ($1,'محرر')`, [EDITOR])).toBe(true);
      await as(OWNER);
      expect((await q(`select count(*)::int n from guide_admins`))[0].n).toBeGreaterThan(1);
    };
    await check();
    await root();
    const pol = await q(`select pg_get_expr(polqual, polrelid) e from pg_policy where polname='Guide own plus read'`);
    expect(pol[0].e).toMatch(/SELECT auth\.uid\(\)/);
    await db.exec(file("015_rls_speed_rollback.sql"));
    await check();
    await root();
    await db.exec(file("015_rls_speed.sql"));
    await root();
  });
});

describe("migration 017: score saving apart from favorites", () => {
  it("lets the owner gate saved scores separately and rolls back", async () => {
    await root();
    await db.exec(`update guide_site_settings set private=false`);
    await db.exec(`update guide_universities set published=true, deleted_at=null where id='${U}'`);
    await db.exec(file("012_saving_feature.sql"));
    await db.exec(file("013_filters_share.sql"));
    await db.exec(file("017_score_saving.sql"));
    await db.exec(file("017_score_saving.sql"));
    await db.exec(`update guide_tracks set published=true, deleted_at=null where id='${Tw}'`);
    expect((await q(`select access_mode from guide_feature_flags where feature_key='score_saving'`))[0].access_mode).toBe(
      (await q(`select access_mode from guide_feature_flags where feature_key='saving'`))[0].access_mode,
    );
    const score = () => fails(`insert into guide_student_scores(user_id,university_id,track_id,school,aptitude,achievement,result) values($1,$2,$3,90,80,85,85)`, [STUDENT, U, Tw]);
    const fav = () => fails(`insert into guide_student_favorites(user_id, university_id) values ($1,$2)`, [STUDENT, U]);
    const clear = async () => { await root(); await db.exec(`delete from guide_student_favorites where user_id='${STUDENT}'; delete from guide_student_scores where user_id='${STUDENT}'`); };
    await as(OWNER);
    await q(`select guide_owner_set_feature('saving','members',false)`);
    await q(`select guide_owner_set_feature('score_saving','hidden',false)`);
    await as(STUDENT);
    expect(await fav()).toBe(false); // favorites still open
    expect(await score()).toBe(true); // scores closed on their own
    await clear();
    await as(OWNER);
    await q(`select guide_owner_set_feature('saving','hidden',false)`);
    await q(`select guide_owner_set_feature('score_saving','members',false)`);
    await as(STUDENT);
    expect(await fav()).toBe(true);
    expect(await score()).toBe(false);
    await clear();
    await db.exec(file("017_score_saving_rollback.sql"));
    expect((await q(`select count(*)::int n from guide_feature_flags where feature_key='score_saving'`))[0].n).toBe(0);
    await as(OWNER);
    await q(`select guide_owner_set_feature('saving','members',false)`);
    await as(STUDENT);
    expect(await score()).toBe(false);
    await clear();
    await db.exec(`update guide_site_settings set private=true`);
  });
});

describe("migration 018: partners and their own teams", () => {
  const STAFF = "77777777-7777-4777-8777-777777777777";
  const OUT = "88888888-8888-4888-8888-888888888888";
  const allowed = async (id, uni, action) => {
    await as(id);
    return (await q(`select guide_allowed($1,$2) ok`, [uni, action]))[0].ok;
  };
  it("lets a partner run a team inside their own universities only, and rolls back", async () => {
    await root();
    await db.exec(`insert into auth.users(id,email) values ('${STAFF}','staff@x.sa'), ('${OUT}','out@x.sa') on conflict do nothing`);
    await db.exec(file("018_partner_teams.sql"));
    await db.exec(file("018_partner_teams.sql"));
    // Nothing changes for today's members.
    expect(await allowed(EDITOR, U, "edit")).toBe(true);
    expect(await allowed(EDITOR, U2, "read")).toBe(false);
    // Only the owner names partners.
    await as(EDITOR);
    expect(await fails(`select guide_owner_set_partner($1,true)`, [EDITOR])).toBe(true);
    expect(await fails(`select * from guide_partner_team()`)).toBe(true);
    await as(OWNER);
    await q(`select guide_owner_set_partner($1,true)`, [EDITOR]);
    // The partner adds someone, only with their own universities.
    await as(EDITOR);
    expect(await fails(`select guide_partner_set_member('staff@x.sa','موظف',true,true,$1)`, [[U2]])).toBe(true);
    expect(await fails(`select guide_partner_set_member('owner@x.sa','المالك',true,true,$1)`, [[U]])).toBe(true);
    expect(await fails(`select guide_partner_set_member('nobody@x.sa','أحد',true,true,$1)`, [[U]])).toBe(true);
    await q(`select guide_partner_set_member('staff@x.sa','موظف',true,true,$1)`, [[U]]);
    expect((await q(`select email, can_edit, university_ids from guide_partner_team()`))).toEqual([
      { email: "staff@x.sa", can_edit: true, university_ids: [U] },
    ]);
    expect(await allowed(STAFF, U, "edit")).toBe(true);
    expect(await allowed(STAFF, U2, "read")).toBe(false);
    expect(await allowed(STAFF, U, "publish")).toBe(false);
    // Team members cannot manage anyone, and the owner's pages stay closed.
    await as(STAFF);
    expect(await fails(`select * from guide_partner_team()`)).toBe(true);
    expect(await fails(`select * from guide_team_directory()`)).toBe(true);
    // A partner cannot take over someone else's member.
    await as(OWNER);
    await q(`select guide_set_member('out@x.sa',false,false,false,true,$1)`, [[U]]);
    await as(EDITOR);
    expect(await fails(`select guide_partner_set_member('out@x.sa','غيره',false,true,$1)`, [[U]])).toBe(true);
    expect(await fails(`select guide_partner_remove_member($1)`, [OUT])).toBe(true);
    // Losing a university, or the partner role, closes it for the team too.
    await as(OWNER);
    await q(`select guide_set_member('editor@x.sa',true,false,false,true,$1)`, [[U2]]);
    expect(await allowed(STAFF, U, "read")).toBe(false);
    await as(OWNER);
    await q(`select guide_set_member('editor@x.sa',true,false,false,true,$1)`, [[U]]);
    expect(await allowed(STAFF, U, "edit")).toBe(true);
    await as(OWNER);
    await q(`select guide_owner_set_partner($1,false)`, [EDITOR]);
    expect(await allowed(STAFF, U, "read")).toBe(false);
    await as(OWNER);
    await q(`select guide_owner_set_partner($1,true)`, [EDITOR]);
    expect(await allowed(STAFF, U, "edit")).toBe(true);
    // The partner can stop a member of their team.
    await as(EDITOR);
    await q(`select guide_partner_remove_member($1)`, [STAFF]);
    expect(await allowed(STAFF, U, "read")).toBe(false);
    await as(EDITOR);
    await q(`select guide_partner_set_member('staff@x.sa','موظف',false,true,$1)`, [[U]]);
    expect(await allowed(STAFF, U, "read")).toBe(true);
    expect(await allowed(STAFF, U, "edit")).toBe(false);
    // Rollback: team members are switched off, everyone else is as before.
    await root();
    await db.exec(file("018_partner_teams_rollback.sql"));
    expect(await allowed(STAFF, U, "read")).toBe(false);
    expect(await allowed(EDITOR, U, "edit")).toBe(true);
    expect(await allowed(OWNER, U2, "delete")).toBe(true);
    await root();
    expect((await q(`select count(*)::int n from information_schema.columns where table_name='guide_admins' and column_name in ('is_partner','managed_by')`))[0].n).toBe(0);
    await db.exec(`delete from guide_assignments where user_id in ('${OUT}','${STAFF}'); delete from guide_admins where user_id in ('${OUT}','${STAFF}')`);
  });
});

describe("migration 019: report an error", () => {
  it("lets signed-in students send, only the team reads, limits spam, and rolls back", async () => {
    await root();
    await db.exec(file("019_error_reports.sql"));
    await db.exec(file("019_error_reports.sql"));
    const send = (msg = "رابط التقديم قديم") =>
      fails(`insert into guide_error_reports(university_id, section, message) values ($1,'admission',$2)`, [U, msg]);
    await as(null);
    expect(await send()).toBe(true); // visitors cannot send
    await as(STUDENT);
    expect(await send("قص")).toBe(true); // too short
    expect(await send()).toBe(false);
    expect(await q(`select * from guide_error_reports`)).toEqual([]); // students read nothing
    expect(await fails(`update guide_error_reports set status='done'`)).toBe(true); // no update rights
    expect(await fails(`insert into guide_error_reports(university_id, message, user_id) values ($1,'باسم غيري',$2)`, [U, STUDENT2])).toBe(true);
    for (let i = 0; i < 4; i++) expect(await send()).toBe(false);
    expect(await send()).toBe(true); // 6th in a day refused
    await as(EDITOR); // assigned to U
    const rows = await q(`select id, status from guide_error_reports where university_id=$1`, [U]);
    expect(rows.length).toBe(5);
    await q(`select guide_set_error_report($1,true)`, [rows[0].id]);
    expect((await q(`select status from guide_error_reports where id=$1`, [rows[0].id]))[0].status).toBe("done");
    await as(STUDENT);
    expect(await fails(`select guide_set_error_report($1,false)`, [rows[0].id])).toBe(true);
    await as(OWNER);
    expect((await q(`select count(*)::int n from guide_error_reports`))[0].n).toBe(5);
    await root();
    await db.exec(file("019_error_reports_rollback.sql"));
    expect((await q(`select to_regclass('public.guide_error_reports') t`))[0].t).toBe(null);
  });
});
