import type { ResearchBrief } from "@easygardenplan/contracts";
import { researchRun, type Database } from "@easygardenplan/db";
import type { ResearchSearchResult } from "@easygardenplan/integrations";
import { eq, sql } from "drizzle-orm";

export class PostgresResearchRuns {
  constructor(private readonly database: Database) {}

  async run(brief: ResearchBrief, fingerprint: string, search: () => Promise<ResearchSearchResult>): Promise<{ resumed: boolean; result: ResearchSearchResult }> {
    const existing = await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${fingerprint}, 0))`);
      const [row] = await transaction.select().from(researchRun).where(eq(researchRun.requestFingerprint, fingerprint)).limit(1);
      if (row?.status === "completed" && row.result) return row;
      if (!row) await transaction.insert(researchRun).values({ provider: "exa", requestFingerprint: fingerprint, brief, status: "running", attemptCount: 1 });
      else await transaction.update(researchRun).set({ status: "running", attemptCount: row.attemptCount + 1, errorCode: null }).where(eq(researchRun.id, row.id));
      return null;
    });
    if (existing?.result) return { resumed: true, result: existing.result as ResearchSearchResult };
    try {
      const result = await search();
      await this.database.update(researchRun).set({ status: "completed", providerRunId: result.providerRunId, result, usage: result.usage, costUsd: result.costUsd?.toFixed(6), completedAt: new Date(), errorCode: null }).where(eq(researchRun.requestFingerprint, fingerprint));
      return { resumed: false, result };
    } catch (error) {
      await this.database.update(researchRun).set({ status: "failed", errorCode: error instanceof Error ? error.name : "UnknownError", completedAt: new Date() }).where(eq(researchRun.requestFingerprint, fingerprint));
      throw error;
    }
  }
}

export function safeResearchSourceUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Research sources must use a public HTTPS URL");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || /^(?:10\.|127\.|169\.254\.|192\.168\.)/u.test(hostname) || /^172\.(?:1[6-9]|2\d|3[01])\./u.test(hostname) || hostname === "::1") throw new Error("Private network research sources are not allowed");
  return url;
}
