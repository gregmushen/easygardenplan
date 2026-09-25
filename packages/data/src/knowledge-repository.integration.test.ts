import { crop, evidenceItem, knowledgeSource, researchRun, reviewDecision, ruleFamily, ruleVersion, createDatabase } from "@easygardenplan/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { coverageMatrix, KnowledgeRepository } from "./knowledge-repository.js";
import { representativeRegionClasses, representativeRules } from "./fixtures/representative-catalog.js";
import { publishedRuleSchema } from "@easygardenplan/contracts";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;

suite("knowledge editorial publication", () => {
  const nonce = crypto.randomUUID();
  const ids: { cropId?: string; sourceId?: string; runId?: string; familyId?: string } = {};
  afterAll(async () => {
    if (ids.familyId) {
      await database!.execute(sql`delete from catalog_release where name in (${`fixture-one-${nonce}`}, ${`fixture-two-${nonce}`})`);
      await database!.delete(ruleVersion).where(eq(ruleVersion.familyId, ids.familyId));
      await database!.delete(reviewDecision).where(eq(reviewDecision.reviewerId, `fixture-reviewer-${nonce}`));
      await database!.delete(ruleFamily).where(eq(ruleFamily.id, ids.familyId));
    }
    if (ids.sourceId) await database!.delete(evidenceItem).where(eq(evidenceItem.sourceId, ids.sourceId));
    if (ids.cropId) await database!.delete(crop).where(eq(crop.id, ids.cropId));
    if (ids.sourceId) await database!.delete(knowledgeSource).where(eq(knowledgeSource.id, ids.sourceId));
    if (ids.runId) await database!.delete(researchRun).where(eq(researchRun.id, ids.runId));
    await database!.$client.end();
  });

  it("turns reviewed evidence into immutable releases and preserves old references", async () => {
    const [plant] = await database!.insert(crop).values({ slug: `fixture-${nonce}`, commonName: "Synthetic Tomato" }).returning();
    ids.cropId = plant!.id;
    const [run] = await database!.insert(researchRun).values({ provider: "fixture", requestFingerprint: nonce.replaceAll("-", ""), brief: { fixture: true }, status: "completed", attemptCount: 1, completedAt: new Date() }).returning();
    ids.runId = run!.id;
    const applicability = { methods: ["direct_sow"], regionIds: ["test-region"], climateRegimes: [], hardinessZones: [], varietyIds: [] };
    const payload = { state: "known", type: "spacing", withinRowMeters: { minimum: 0.3, maximum: 0.5, minimumInclusive: true, maximumInclusive: true }, pattern: "individual", sourceUnit: "meters" };
    const repository = new KnowledgeRepository(database!);
    const source = { url: `https://example.test/${nonce}`, title: "Synthetic fixture", publisher: "Test publisher", sourceType: "fixture", accessedAt: new Date(), attributionNotes: "Synthetic; not horticultural guidance" };
    const first = await repository.createDraft({ cropId: plant!.id, ruleType: "spacing", method: "direct_sow", contextKey: "default", applicability, payload, source, evidence: { researchRunId: run!.id, normalizedClaim: "Synthetic spacing fixture", scope: { region: "test" }, originalUnits: "meters" } });
    const [storedSource] = await database!.select().from(knowledgeSource).where(eq(knowledgeSource.url, source.url));
    const [storedFirst] = await database!.select().from(ruleVersion).where(eq(ruleVersion.id, first.ruleVersionId));
    ids.sourceId = storedSource!.id;
    ids.familyId = storedFirst!.familyId;
    await repository.review({ ruleVersionId: first.ruleVersionId, reviewerId: `fixture-reviewer-${nonce}`, decision: "accepted", rationale: "Synthetic fixture reviewed" });
    const release1 = await repository.publish({ releaseName: `fixture-one-${nonce}`, ruleVersionIds: [first.ruleVersionId], reviewerId: `fixture-reviewer-${nonce}`, note: "first" });
    expect((await repository.published(release1.releaseId)).rules).toHaveLength(1);
    await expect(database!.update(ruleVersion).set({ payload: { ...payload, sourceUnit: "feet" } }).where(eq(ruleVersion.id, first.ruleVersionId))).rejects.toThrow();

    const second = await repository.createDraft({ cropId: plant!.id, ruleType: "spacing", method: "direct_sow", contextKey: "default", applicability, payload: { ...payload, withinRowMeters: { minimum: 0.4, maximum: 0.6, minimumInclusive: true, maximumInclusive: true } }, overridesRuleVersionIds: [first.ruleVersionId], source, evidence: { researchRunId: run!.id, normalizedClaim: "Synthetic corrected spacing fixture", scope: { region: "test" }, originalUnits: "meters" } });
    await repository.review({ ruleVersionId: second.ruleVersionId, reviewerId: `fixture-reviewer-${nonce}`, decision: "accepted", rationale: "Correction reviewed" });
    const release2 = await repository.publish({ releaseName: `fixture-two-${nonce}`, ruleVersionIds: [second.ruleVersionId], reviewerId: `fixture-reviewer-${nonce}`, note: "correction" });
    await expect(database!.update(ruleVersion).set({ overridesRuleVersionIds: [] }).where(eq(ruleVersion.id, second.ruleVersionId))).rejects.toThrow();
    await repository.withdraw(first.ruleVersionId, second.ruleVersionId);
    expect((await repository.published(release1.releaseId)).rules[0]?.version).toBe(1);
    expect((await repository.published(release2.releaseId)).rules[0]).toMatchObject({ version: 2, overridesRuleVersionIds: [first.ruleVersionId] });
    expect((await repository.published()).rules[0]?.version).toBe(2);
    const cells = coverageMatrix({ cropIds: [plant!.id], methods: ["direct_sow"], ruleTypes: ["spacing", "light"], regionClasses: ["test-region"], rules: (await repository.published(release2.releaseId)).rules });
    expect(cells.map(({ status }) => status)).toEqual(["supported", "missing"]);
  });
});

describe("representative rule-shape fixture", () => {
  it("validates every initial rule payload and all launch region classes", () => {
    expect(representativeRules.map((rule) => publishedRuleSchema.parse(rule).ruleType).sort()).toEqual(["climate_response", "environmental_prerequisite", "instruction", "light", "maturity", "planting_window", "seed_start_lead", "spacing", "support"]);
    expect(representativeRegionClasses).toHaveLength(8);
  });
});
