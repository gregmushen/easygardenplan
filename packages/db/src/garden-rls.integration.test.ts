import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const prefix = `garden-rls-${Date.now()}-`;
const orgA = `${prefix}org-a`;
const orgB = `${prefix}org-b`;
const sql = connectionString ? postgres(connectionString, { max: 1, prepare: false }) : undefined;

suite("Garden forced tenant isolation", () => {
  beforeAll(async () => {
    await sql!`insert into organization (id, name, slug, created_at) values (${orgA}, 'A', ${orgA}, now()), (${orgB}, 'B', ${orgB}, now())`;
    await sql!`insert into garden (organization_id, name) values (${orgA}, ${`${prefix}a`}), (${orgB}, ${`${prefix}b`})`;
  });
  afterAll(async () => { await sql!`delete from organization where id in (${orgA}, ${orgB})`; await sql!.end(); });
  it("fails closed and blocks cross-tenant reads and writes", async () => {
    await sql!.begin(async (transaction) => {
      await transaction`set local role trestle_app`;
      expect(await transaction`select id from garden where name like ${`${prefix}%`}`).toHaveLength(0);
      await transaction`select set_config('app.organization_id', ${orgA}, true)`;
      expect((await transaction`select organization_id from garden where name like ${`${prefix}%`}`).map((row) => row.organization_id)).toEqual([orgA]);
      expect((await transaction`update garden set name = 'forbidden' where organization_id = ${orgB}`).count).toBe(0);
      expect((await transaction`delete from garden where organization_id = ${orgB}`).count).toBe(0);
    });
  });
});
