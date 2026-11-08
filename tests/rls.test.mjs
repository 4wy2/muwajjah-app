import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let sql;
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const u = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const t = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const p = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
async function asUser(id) {
  await sql.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`,
  );
}
beforeAll(async () => {
  sql = new PGlite();
  await sql.exec(`
 create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table public.guide_universities(id uuid primary key,name text,published boolean,deleted_at timestamptz);
 create table public.guide_programs(id uuid primary key,university_id uuid,name text,published boolean,deleted_at timestamptz);
 create table public.guide_tracks(id uuid primary key,university_id uuid,name text,published boolean,deleted_at timestamptz,school_weight numeric,aptitude_weight numeric,achievement_weight numeric);
 insert into auth.users values('${a}'),('${b}');
 insert into public.guide_universities values('${u}','Test university',true,null);
 insert into public.guide_programs values('${p}','${u}','Test program',true,null);
 insert into public.guide_tracks values('${t}','${u}','Test track',true,null,30,30,40);
 grant select on guide_universities,guide_programs,guide_tracks to authenticated,anon;
 alter table guide_universities enable row level security;alter table guide_programs enable row level security;alter table guide_tracks enable row level security;
 create policy visible on guide_universities for select using(published and deleted_at is null);
 create policy visible on guide_programs for select using(published and deleted_at is null);
 create policy visible on guide_tracks for select using(published and deleted_at is null);
 `);
  const migration = readFileSync(
    new URL("../database/001_student_features.sql", import.meta.url),
    "utf8",
  );
  await sql.exec(migration);
  await sql.exec(migration);
}, 30000);
afterAll(async () => {
  await sql?.close();
});
describe("Student migration RLS (local PostgreSQL)", () => {
  it("isolates favorites between two users", async () => {
    await asUser(a);
    await sql.query(
      "insert into guide_student_favorites(user_id,university_id) values($1,$2)",
      [a, u],
    );
    expect(
      (await sql.query("select * from guide_student_favorites")).rows,
    ).toHaveLength(1);
    await asUser(b);
    expect(
      (await sql.query("select * from guide_student_favorites")).rows,
    ).toHaveLength(0);
    expect(
      (
        await sql.query(
          "delete from guide_student_favorites where user_id=$1 returning id",
          [a],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rejects forged favorite ownership", async () => {
    await asUser(b);
    await expect(
      sql.query(
        "insert into guide_student_favorites(user_id,program_id) values($1,$2)",
        [a, p],
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("enforces a single target and duplicate protection", async () => {
    await asUser(a);
    await expect(
      sql.query(
        "insert into guide_student_favorites(user_id,university_id) values($1,$2)",
        [a, u],
      ),
    ).rejects.toThrow();
    await expect(
      sql.query(
        "insert into guide_student_favorites(user_id,university_id,program_id) values($1,$2,$3)",
        [a, u, p],
      ),
    ).rejects.toThrow();
  });
  it("recalculates a forged client result and hides it from another user", async () => {
    await asUser(a);
    const { rows } = await sql.query(
      "insert into guide_student_scores(user_id,university_id,track_id,school,aptitude,achievement,result) values($1,$2,$3,97,85,90,100) returning result,school_weight",
      [a, u, t],
    );
    expect(Number(rows[0].result)).toBe(90.6);
    expect(Number(rows[0].school_weight)).toBe(30);
    await asUser(b);
    expect(
      (await sql.query("select * from guide_student_scores")).rows,
    ).toHaveLength(0);
  });
  it("rejects score writes for another identity", async () => {
    await asUser(b);
    await expect(
      sql.query(
        "insert into guide_student_scores(user_id,university_id,track_id,school,aptitude,achievement,result) values($1,$2,$3,97,85,90,100)",
        [a, u, t],
      ),
    ).rejects.toThrow();
  });
  it("blocks anonymous student data access", async () => {
    await sql.exec("reset role;set role anon;");
    await expect(
      sql.query("select * from guide_student_favorites"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      sql.query("select * from guide_student_scores"),
    ).rejects.toThrow(/permission denied/);
  });
  it("refuses scores for unpublished tracks", async () => {
    await sql.exec(
      `reset role;update guide_tracks set published=false where id='${t}';`,
    );
    await asUser(a);
    await expect(
      sql.query(
        "insert into guide_student_scores(user_id,university_id,track_id,school,aptitude,achievement,result) values($1,$2,$3,97,85,90,100)",
        [a, u, t],
      ),
    ).rejects.toThrow();
  });
});
