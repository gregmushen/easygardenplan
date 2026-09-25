import { createDatabase, researchRun } from "@easygardenplan/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { PostgresResearchRuns, safeResearchSourceUrl } from "./research-runs.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;
const fingerprint = crypto.randomUUID().replaceAll("-", "");

suite("research run tracking", () => {
  afterAll(async () => { await database!.delete(researchRun).where(eq(researchRun.requestFingerprint, fingerprint)); await database!.$client.end(); });
  it("resumes a completed fingerprint without another provider call", async () => {
    let calls = 0;
    const brief = { cropNames: ["synthetic crop"], methods: ["direct_sow" as const], regionClasses: ["test"], ruleTypes: ["spacing" as const] };
    const store = new PostgresResearchRuns(database!);
    const search = async () => { calls += 1; return { requestFingerprint: fingerprint, providerRunId: "fixture-run", candidates: [], usage: { searches: 1 }, costUsd: 0.02 }; };
    expect((await store.run(brief, fingerprint, search)).resumed).toBe(false);
    expect((await store.run(brief, fingerprint, search)).resumed).toBe(true);
    expect(calls).toBe(1);
    const [saved] = await database!.select().from(researchRun).where(eq(researchRun.requestFingerprint, fingerprint));
    expect(saved).toMatchObject({ status: "completed", attemptCount: 1, providerRunId: "fixture-run", costUsd: "0.020000" });
  });
  it("rejects source retrieval from local and private networks", () => {
    expect(() => safeResearchSourceUrl("https://127.0.0.1/private")).toThrow();
    expect(safeResearchSourceUrl("https://extension.example/guide").hostname).toBe("extension.example");
  });
});
