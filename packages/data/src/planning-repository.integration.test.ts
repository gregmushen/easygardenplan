import { bed, bedGeometryRevision, catalogRelease, catalogReleaseRule, createDatabase, crop, cropSelection, evidenceItem, garden, gardenPlanVersion, knowledgeSource, organization, ruleFamily, ruleVersion } from "@easygardenplan/db";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PlanningConflictError, PlanningRepository } from "./planning-repository.js";
import { ProgressRepository } from "./progress-repository.js";

const connectionString = process.env.TRESTLE_RLS_TEST_DATABASE_URL;
const suite = connectionString ? describe : describe.skip;
const database = connectionString ? createDatabase(connectionString, "postgres-js") : undefined;
const id = () => crypto.randomUUID();

suite("planning persistence and concurrency", () => {
  const nonce = crypto.randomUUID(); const organizationId = `planning-${nonce}`; const gardenId = id(); const cropId = id(); const bedId = id(); const revisionId = id(); const sourceId = id(); const evidenceId = id(); const familyIds = [id(), id(), id()]; const ruleIds = [id(), id(), id()]; const releaseId = id();
  const repository = database ? new PlanningRepository(database, organizationId, releaseId) : undefined;
  const progress = database ? new ProgressRepository(database, organizationId) : undefined;
  beforeAll(async () => {
    await database!.insert(organization).values({ id: organizationId, name: "Planning fixture", slug: organizationId, createdAt: new Date() });
    await database!.insert(garden).values({ id: gardenId, organizationId, name: "Fixture garden", timezone: "America/Los_Angeles", revision: 1, locationConfirmed: true });
    await database!.insert(bed).values({ id: bedId, organizationId, gardenId, name: "Fixture bed", revision: 1, activeRevisionId: revisionId });
    await database!.insert(bedGeometryRevision).values({ id: revisionId, organizationId, bedId, revision: 1, geometry: { outer: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }, { x: 0, y: 2 }], exclusions: [] }, geographicTransform: { anchor: { latitude: 1, longitude: 1 }, rotationRadians: 0, scale: 1, translationMeters: { x: 0, y: 0 }, projection: "local_equirectangular_v1" }, measurementProvenance: "measured" });
    await database!.insert(crop).values({ id: cropId, slug: `fixture-${nonce}`, commonName: "Synthetic crop", status: "published" });
    await database!.insert(knowledgeSource).values({ id: sourceId, url: `https://example.test/${nonce}`, title: "Synthetic source", publisher: "Tests", sourceType: "fixture", accessedAt: new Date() });
    await database!.insert(evidenceItem).values({ id: evidenceId, sourceId, normalizedClaim: "Synthetic planning fact", scope: { fixture: true } });
    await database!.insert(ruleFamily).values([
      { id: familyIds[0]!, cropId, ruleType: "spacing", method: "direct_sow", contextKey: `fixture-${nonce}` },
      { id: familyIds[1]!, cropId, ruleType: "planting_window", method: "direct_sow", contextKey: `fixture-${nonce}` },
      { id: familyIds[2]!, cropId, ruleType: "maturity", method: "direct_sow", contextKey: `fixture-${nonce}` },
    ]);
    const applicability = { methods: ["direct_sow"], regionIds: [], climateRegimes: [], hardinessZones: [], varietyIds: [] };
    await database!.insert(ruleVersion).values([
      { id: ruleIds[0]!, familyId: familyIds[0]!, version: 1, state: "published", applicability, payload: { state: "known", type: "spacing", withinRowMeters: { minimum: 0.5, maximum: 0.5, minimumInclusive: true, maximumInclusive: true }, pattern: "individual", sourceUnit: "meters" }, evidenceIds: [evidenceId], publishedAt: new Date() },
      { id: ruleIds[1]!, familyId: familyIds[1]!, version: 1, state: "published", applicability, payload: { state: "known", type: "planting_window", windows: [{ kind: "calendar", startMonth: 3, startDay: 1, endMonth: 4, endDay: 1, endYearOffset: 0 }] }, evidenceIds: [evidenceId], publishedAt: new Date() },
      { id: ruleIds[2]!, familyId: familyIds[2]!, version: 1, state: "published", applicability, payload: { state: "known", type: "maturity", days: { minimum: 50, maximum: 60, minimumInclusive: true, maximumInclusive: true }, anchor: "sowing", sourceUnit: "calendar_days" }, evidenceIds: [evidenceId], publishedAt: new Date() },
    ]);
    await database!.insert(catalogRelease).values({ id: releaseId, name: `planning-${nonce}`, status: "published", publishedBy: "test", publishedAt: new Date("2000-01-01") });
    await database!.insert(catalogReleaseRule).values(ruleIds.map((ruleVersionId) => ({ releaseId, ruleVersionId })));
  });
  afterAll(async () => {
    await database!.delete(organization).where(eq(organization.id, organizationId));
    await database!.delete(catalogRelease).where(eq(catalogRelease.id, releaseId));
    await database!.delete(ruleVersion).where(sql`${ruleVersion.id} in (${ruleIds[0]}, ${ruleIds[1]}, ${ruleIds[2]})`);
    await database!.delete(ruleFamily).where(sql`${ruleFamily.id} in (${familyIds[0]}, ${familyIds[1]}, ${familyIds[2]})`);
    await database!.delete(evidenceItem).where(eq(evidenceItem.id, evidenceId)); await database!.delete(knowledgeSource).where(eq(knowledgeSource.id, sourceId)); await database!.delete(crop).where(eq(crop.id, cropId));
    await database!.$client.end();
  });

  it("persists deterministic proposals, rejects stale activation, and serializes competing activation", async () => {
    const selection = await repository!.saveSelection(gardenId, { id: id(), cropId, varietyId: null, method: "direct_sow", quantity: 5, preferredBedId: bedId, bedRestriction: "only", priority: 0 }, 0);
    const first = await repository!.generate(gardenId, 2027); const repeat = await repository!.generate(gardenId, 2027);
    expect(first.result).toEqual(repeat.result); expect(first.result.selections[0]!.requested).toBe(first.result.selections[0]!.placed + first.result.selections[0]!.unplaced);
    const acknowledgements = first.result.unresolved.map((item) => `${item.kind}:${item.selectionId}:${item.code}`);
    const race = await Promise.allSettled([repository!.activate(gardenId, first.id, acknowledgements), repository!.activate(gardenId, first.id, acknowledgements)]);
    expect(race.filter(({ status }) => status === "fulfilled")).toHaveLength(1); expect(race.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const [task] = (await progress!.listTasks(gardenId)).filter(({ planState }) => planState === "active"); expect(task?.status).toMatchObject({ revision: 1, state: "planned" });
    const postponed = await progress!.transition(gardenId, task!.id, { expectedRevision: 1, state: "postponed", scheduledStartLocalDate: "2027-03-08", scheduledEndLocalDate: "2027-04-08" }); expect(postponed.revision).toBe(2);
    await expect(progress!.transition(gardenId, task!.id, { expectedRevision: 1, state: "completed", actualLocalDate: "2027-03-10" })).rejects.toBeInstanceOf(PlanningConflictError);
    await progress!.record(gardenId, { taskId: task!.id, selectionId: selection.id, eventType: "sown", occurredLocalDate: "2027-03-10", bedId, position: { x: 0.25, y: 0.25 } });
    expect((await progress!.listTasks(gardenId)).some(({ origin, taskType, status }) => origin === "derived_actual" && taskType === "harvest" && status?.scheduledStartLocalDate === "2027-04-29")).toBe(true);
    const changed = await repository!.saveSelection(gardenId, { id: selection.id, cropId, varietyId: null, method: "direct_sow", quantity: 6, preferredBedId: bedId, bedRestriction: "only", priority: 0 }, 1);
    expect(changed.revision).toBe(2);
    const stale = await repository!.generate(gardenId, 2027);
    await repository!.saveSelection(gardenId, { id: selection.id, cropId, varietyId: null, method: "direct_sow", quantity: 7, preferredBedId: bedId, bedRestriction: "only", priority: 0 }, 2);
    await expect(repository!.activate(gardenId, stale.id, stale.result.unresolved.map((item) => `${item.kind}:${item.selectionId}:${item.code}`))).rejects.toBeInstanceOf(PlanningConflictError);
    const [stored] = await database!.select({ state: gardenPlanVersion.state }).from(gardenPlanVersion).where(eq(gardenPlanVersion.id, stale.id)); expect(stored?.state).toBe("stale");
    const replacement = await repository!.generate(gardenId, 2027); await repository!.activate(gardenId, replacement.id, replacement.result.unresolved.map((item) => `${item.kind}:${item.selectionId}:${item.code}`));
    expect(await progress!.listEvents(gardenId)).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "sown", planVersionId: first.id })]));
    expect((await repository!.listPlans(gardenId)).map(({ state }) => state)).toEqual(expect.arrayContaining(["active", "superseded", "stale"]));
  });
});
