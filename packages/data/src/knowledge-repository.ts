import { applicabilitySchema, editorialDraftSchema, editorialPublicationSchema, publishedRuleSchema, rulePayloadSchema, type GrowingMethod, type PublishedRule, type RuleType } from "@easygardenplan/contracts";
import { catalogRelease, catalogReleaseRule, crop, cropVariety, evidenceItem, knowledgeSource, reviewDecision, ruleFamily, ruleVersion, type Database } from "@easygardenplan/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { safeResearchSourceUrl } from "./research-runs.js";

export type CoverageCell = Readonly<{ cropId: string; method: GrowingMethod; ruleType: RuleType; regionClass: string; status: "supported" | "partial" | "missing" | "conflicted" }>;

export class KnowledgeRepository {
  constructor(private readonly database: Database) {}

  async listEditorialRules(): Promise<Array<Record<string, unknown>>> {
    const rules = await this.database.select({ id: ruleVersion.id, familyId: ruleVersion.familyId, cropId: ruleFamily.cropId, cropName: crop.commonName, varietyId: ruleFamily.varietyId, ruleType: ruleFamily.ruleType, method: ruleFamily.method, contextKey: ruleFamily.contextKey, version: ruleVersion.version, state: ruleVersion.state, applicability: ruleVersion.applicability, payload: ruleVersion.payload, evidenceIds: ruleVersion.evidenceIds, overridesRuleVersionIds: ruleVersion.overridesRuleVersionIds, reviewDecisionId: ruleVersion.reviewDecisionId, createdAt: ruleVersion.createdAt })
      .from(ruleVersion).innerJoin(ruleFamily, eq(ruleFamily.id, ruleVersion.familyId)).innerJoin(crop, eq(crop.id, ruleFamily.cropId)).orderBy(asc(ruleVersion.createdAt));
    const evidenceIds = [...new Set(rules.flatMap((rule) => rule.evidenceIds as string[]))];
    const evidence = evidenceIds.length ? await this.database.select({ id: evidenceItem.id, locator: evidenceItem.locator, normalizedClaim: evidenceItem.normalizedClaim, scope: evidenceItem.scope, originalUnits: evidenceItem.originalUnits, sourceUrl: knowledgeSource.url, sourceTitle: knowledgeSource.title, sourcePublisher: knowledgeSource.publisher, sourceType: knowledgeSource.sourceType, sourceAccessedAt: knowledgeSource.accessedAt, sourceChecksum: knowledgeSource.contentChecksum }).from(evidenceItem).innerJoin(knowledgeSource, eq(knowledgeSource.id, evidenceItem.sourceId)).where(inArray(evidenceItem.id, evidenceIds)) : [];
    const byId = new Map(evidence.map((item) => [item.id, item]));
    return rules.map((rule) => ({ ...rule, evidence: (rule.evidenceIds as string[]).map((id) => byId.get(id)).filter(Boolean) }));
  }

  async createDraft(input: unknown): Promise<{ ruleVersionId: string; evidenceId: string }> {
    const draft = editorialDraftSchema.parse(input);
    const sourceUrl = safeResearchSourceUrl(draft.source.url).toString();
    return await this.database.transaction(async (transaction) => {
      const [plant] = await transaction.select({ id: crop.id }).from(crop).where(eq(crop.id, draft.cropId)).limit(1);
      if (!plant) throw new Error("Crop not found");
      const [existingSource] = await transaction.select().from(knowledgeSource).where(eq(knowledgeSource.url, sourceUrl)).limit(1);
      const source = existingSource ?? (await transaction.insert(knowledgeSource).values({ ...draft.source, url: sourceUrl }).returning())[0];
      if (!source) throw new Error("Source was not recorded");
      const [evidence] = await transaction.insert(evidenceItem).values({ ...draft.evidence, sourceId: source.id }).returning();
      if (!evidence) throw new Error("Evidence was not recorded");
      const familyConditions = [eq(ruleFamily.cropId, draft.cropId), draft.varietyId ? eq(ruleFamily.varietyId, draft.varietyId) : sql`${ruleFamily.varietyId} is null`, eq(ruleFamily.ruleType, draft.ruleType), eq(ruleFamily.method, draft.method), eq(ruleFamily.contextKey, draft.contextKey)];
      let [family] = await transaction.select().from(ruleFamily).where(and(...familyConditions)).limit(1);
      if (!family) [family] = await transaction.insert(ruleFamily).values({ cropId: draft.cropId, varietyId: draft.varietyId, ruleType: draft.ruleType, method: draft.method, contextKey: draft.contextKey }).returning();
      if (!family) throw new Error("Rule family was not created");
      const [latest] = await transaction.select({ version: ruleVersion.version }).from(ruleVersion).where(eq(ruleVersion.familyId, family.id)).orderBy(desc(ruleVersion.version)).limit(1);
      const [version] = await transaction.insert(ruleVersion).values({ familyId: family.id, version: (latest?.version ?? 0) + 1, applicability: draft.applicability, payload: draft.payload, evidenceIds: [evidence.id], overridesRuleVersionIds: draft.overridesRuleVersionIds }).returning();
      if (!version) throw new Error("Rule draft was not created");
      return { ruleVersionId: version.id, evidenceId: evidence.id };
    });
  }

  async review(input: { ruleVersionId: string; reviewerId: string; decision: "accepted" | "rejected" | "conflicted"; rationale: string }): Promise<string> {
    return await this.database.transaction(async (transaction) => {
      const [candidate] = await transaction.select().from(ruleVersion).where(eq(ruleVersion.id, input.ruleVersionId)).limit(1);
      if (!candidate || candidate.state === "published" || candidate.state === "withdrawn") throw new Error("Rule version is not reviewable");
      const evidenceIds = candidate.evidenceIds as string[];
      const [decision] = await transaction.insert(reviewDecision).values({ reviewerId: input.reviewerId, decision: input.decision, rationale: input.rationale, evidenceIds }).returning();
      if (!decision) throw new Error("Review decision was not recorded");
      await transaction.update(ruleVersion).set({ reviewDecisionId: decision.id, state: input.decision === "accepted" ? "reviewed" : input.decision }).where(eq(ruleVersion.id, candidate.id));
      return decision.id;
    });
  }

  async publish(input: unknown): Promise<{ releaseId: string; publishedAt: Date }> {
    const command = editorialPublicationSchema.parse(input);
    return await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext('catalog-publication'))`);
      const versions = await transaction.select().from(ruleVersion).where(inArray(ruleVersion.id, command.ruleVersionIds));
      if (versions.length !== new Set(command.ruleVersionIds).size) throw new Error("Every requested rule version must exist");
      for (const version of versions) {
        applicabilitySchema.parse(version.applicability);
        const payload = rulePayloadSchema.parse(version.payload);
        const evidenceIds = version.evidenceIds as string[];
        if (version.state !== "reviewed" || !version.reviewDecisionId || evidenceIds.length === 0 || payload.state === "conflicted") throw new Error("Every published rule requires accepted, resolved evidence review");
        const [decision] = await transaction.select().from(reviewDecision).where(and(eq(reviewDecision.id, version.reviewDecisionId), eq(reviewDecision.decision, "accepted"))).limit(1);
        if (!decision) throw new Error("Every published rule requires an accepted review decision");
        const evidence = await transaction.select({ id: evidenceItem.id }).from(evidenceItem).where(inArray(evidenceItem.id, evidenceIds));
        if (evidence.length !== new Set(evidenceIds).size) throw new Error("Every evidence reference must exist");
        const overrideIds = version.overridesRuleVersionIds as string[];
        if (overrideIds.includes(version.id) || overrideIds.length !== new Set(overrideIds).size) throw new Error("Rule overrides must be unique and cannot reference themselves");
        if (overrideIds.length) {
          const [currentFamily] = await transaction.select().from(ruleFamily).where(eq(ruleFamily.id, version.familyId)).limit(1);
          const targets = await transaction.select({ id: ruleVersion.id, state: ruleVersion.state, cropId: ruleFamily.cropId, ruleType: ruleFamily.ruleType, method: ruleFamily.method }).from(ruleVersion).innerJoin(ruleFamily, eq(ruleFamily.id, ruleVersion.familyId)).where(inArray(ruleVersion.id, overrideIds));
          if (!currentFamily || targets.length !== overrideIds.length || targets.some((target) => target.state !== "published" || target.cropId !== currentFamily.cropId || target.ruleType !== currentFamily.ruleType || target.method !== currentFamily.method)) throw new Error("Every override must reference a published rule for the same crop, type and method");
        }
      }
      const now = new Date();
      const [release] = await transaction.insert(catalogRelease).values({ name: command.releaseName, status: "published", publishedBy: command.reviewerId, publishedAt: now }).returning();
      if (!release) throw new Error("Catalog release was not created");
      await transaction.insert(catalogReleaseRule).values(command.ruleVersionIds.map((ruleVersionId) => ({ releaseId: release.id, ruleVersionId })));
      await transaction.update(ruleVersion).set({ state: "published", publishedAt: now }).where(inArray(ruleVersion.id, command.ruleVersionIds));
      const familyIds = [...new Set(versions.map(({ familyId }) => familyId))];
      const families = await transaction.select({ cropId: ruleFamily.cropId }).from(ruleFamily).where(inArray(ruleFamily.id, familyIds));
      await transaction.update(crop).set({ status: "published" }).where(inArray(crop.id, [...new Set(families.map(({ cropId }) => cropId))]));
      return { releaseId: release.id, publishedAt: now };
    });
  }

  async published(releaseId?: string): Promise<{ releaseId: string | null; rules: PublishedRule[]; crops: Array<{ id: string; slug: string; commonName: string; scientificName: string | null }>; varieties: Array<{ id: string; cropId: string; name: string }> }> {
    const [release] = releaseId
      ? await this.database.select().from(catalogRelease).where(and(eq(catalogRelease.id, releaseId), eq(catalogRelease.status, "published"))).limit(1)
      : await this.database.select().from(catalogRelease).where(eq(catalogRelease.status, "published")).orderBy(desc(catalogRelease.publishedAt)).limit(1);
    if (!release) return { releaseId: null, rules: [], crops: [], varieties: [] };
    const releaseCondition = releaseId
      ? eq(catalogReleaseRule.releaseId, release.id)
      : and(eq(catalogReleaseRule.releaseId, release.id), eq(ruleVersion.state, "published"));
    const rows = await this.database.select({ id: ruleVersion.id, familyId: ruleVersion.familyId, cropId: ruleFamily.cropId, varietyId: ruleFamily.varietyId, ruleType: ruleFamily.ruleType, version: ruleVersion.version, applicability: ruleVersion.applicability, payload: ruleVersion.payload, publishedAt: ruleVersion.publishedAt, evidenceIds: ruleVersion.evidenceIds, overridesRuleVersionIds: ruleVersion.overridesRuleVersionIds })
      .from(catalogReleaseRule).innerJoin(ruleVersion, eq(ruleVersion.id, catalogReleaseRule.ruleVersionId)).innerJoin(ruleFamily, eq(ruleFamily.id, ruleVersion.familyId))
      .where(releaseCondition);
    const cropIds = [...new Set(rows.map(({ cropId }) => cropId))];
    const plants = cropIds.length ? await this.database.select({ id: crop.id, slug: crop.slug, commonName: crop.commonName, scientificName: crop.scientificName }).from(crop).where(and(inArray(crop.id, cropIds), eq(crop.status, "published"))).orderBy(asc(crop.commonName)) : [];
    const varieties = cropIds.length ? await this.database.select({ id: cropVariety.id, cropId: cropVariety.cropId, name: cropVariety.name }).from(cropVariety).where(and(inArray(cropVariety.cropId, cropIds), eq(cropVariety.status, "published"))).orderBy(asc(cropVariety.name)) : [];
    return { releaseId: release.id, rules: rows.map((row) => publishedRuleSchema.parse(row)), crops: plants, varieties };
  }

  async withdraw(ruleVersionId: string, replacementId?: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const [current] = await transaction.select().from(ruleVersion).where(eq(ruleVersion.id, ruleVersionId)).limit(1);
      if (!current || current.state !== "published") throw new Error("Only a published rule can be withdrawn");
      if (replacementId) {
        const [replacement] = await transaction.select().from(ruleVersion).where(and(eq(ruleVersion.id, replacementId), eq(ruleVersion.familyId, current.familyId), eq(ruleVersion.state, "published"))).limit(1);
        if (!replacement) throw new Error("Replacement must be a published version in the same family");
      }
      await transaction.update(ruleVersion).set({ state: "withdrawn", withdrawnAt: new Date(), ...(replacementId ? { replacementVersionId: replacementId } : {}) }).where(eq(ruleVersion.id, ruleVersionId));
    });
  }
}

export function coverageMatrix(input: { cropIds: readonly string[]; methods: readonly GrowingMethod[]; ruleTypes: readonly RuleType[]; regionClasses: readonly string[]; rules: readonly PublishedRule[] }): CoverageCell[] {
  const cells: CoverageCell[] = [];
  for (const cropId of input.cropIds) for (const method of input.methods) for (const ruleType of input.ruleTypes) for (const regionClass of input.regionClasses) {
    const candidates = input.rules.filter((rule) => rule.cropId === cropId && rule.ruleType === ruleType && rule.applicability.methods.includes(method) && (rule.applicability.regionIds.length === 0 || rule.applicability.regionIds.includes(regionClass)));
    const status = candidates.some(({ payload }) => payload.state === "conflicted") ? "conflicted" : candidates.some(({ payload }) => payload.state === "known") ? "supported" : candidates.length > 0 ? "partial" : "missing";
    cells.push({ cropId, method, ruleType, regionClass, status });
  }
  return cells;
}
