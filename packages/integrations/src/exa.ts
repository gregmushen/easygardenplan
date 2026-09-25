import { researchBriefSchema, type ResearchBrief } from "@easygardenplan/contracts";

export type ResearchCandidate = Readonly<{ id: string; url: string; title: string; publishedDate?: string; highlights: readonly string[] }>;
export type ResearchSearchResult = Readonly<{ providerRunId?: string; requestFingerprint: string; candidates: readonly ResearchCandidate[]; usage?: unknown; costUsd?: number }>;
export type ExaFetch = (input: string, init: RequestInit) => Promise<Response>;

function publicHttps(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password && !url.port && hostname !== "localhost" && !hostname.endsWith(".local") && !/^(?:10\.|127\.|169\.254\.|192\.168\.)/u.test(hostname) && !/^172\.(?:1[6-9]|2\d|3[01])\./u.test(hostname) && hostname !== "::1";
  } catch { return false; }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function researchFingerprint(brief: ResearchBrief): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(researchBriefSchema.parse(brief))));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class ExaResearchAdapter {
  constructor(private readonly apiKey: string, private readonly request: ExaFetch = fetch) {
    if (!apiKey.trim()) throw new Error("EXA_API_KEY is required");
  }

  async search(input: ResearchBrief): Promise<ResearchSearchResult> {
    const brief = researchBriefSchema.parse(input);
    const requestFingerprint = await researchFingerprint(brief);
    const query = [
      "Find primary horticultural or university extension sources for reviewed vegetable growing guidance.",
      `Crops: ${brief.cropNames.join(", ")}.`,
      `Methods: ${brief.methods.join(", ")}.`,
      `Regional or climate classes: ${brief.regionClasses.join(", ")}.`,
      `Rule topics: ${brief.ruleTypes.join(", ")}.`,
      "Return sources only; do not infer or publish recommendations.",
    ].join(" ");
    const response = await this.request("https://api.exa.ai/search", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ query, type: "auto", numResults: 10, contents: { highlights: { query: brief.ruleTypes.join(" "), numSentences: 3 } } }),
    });
    if (!response.ok) throw new Error(`Exa search failed (${response.status})`);
    const body = await response.json() as { requestId?: string; results?: Array<{ id?: string; url?: string; title?: string; publishedDate?: string; highlights?: string[] }>; usage?: unknown; costDollars?: { total?: number } };
    const candidates = (body.results ?? []).filter((item): item is typeof item & { id: string; url: string; title: string } => Boolean(item.id && item.url && item.title && publicHttps(item.url))).map((item) => ({ id: item.id, url: item.url, title: item.title, ...(item.publishedDate ? { publishedDate: item.publishedDate } : {}), highlights: item.highlights ?? [] }));
    return { ...(body.requestId ? { providerRunId: body.requestId } : {}), requestFingerprint, candidates, ...(body.usage ? { usage: body.usage } : {}), ...(typeof body.costDollars?.total === "number" ? { costUsd: body.costDollars.total } : {}) };
  }
}
