import { describe, expect, it } from "vitest";
import { ExaResearchAdapter, researchFingerprint } from "./exa.js";

const brief = { cropNames: ["tomato"], methods: ["indoor_start" as const], regionClasses: ["cool_summer"], ruleTypes: ["spacing" as const, "planting_window" as const] };

describe("Exa research adapter", () => {
  it("uses a stable request fingerprint and sends no customer location", async () => {
    expect(await researchFingerprint(brief)).toBe(await researchFingerprint({ ...brief }));
    let sent = "";
    const adapter = new ExaResearchAdapter("test-key", async (_url, init) => {
      sent = String(init.body);
      return new Response(JSON.stringify({ requestId: "exa-run-1", results: [{ id: "source-1", url: "https://extension.example/tomato", title: "Tomato guide", highlights: ["review me"] }], costDollars: { total: 0.01 } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await adapter.search(brief);
    expect(result).toMatchObject({ providerRunId: "exa-run-1", candidates: [{ title: "Tomato guide" }], costUsd: 0.01 });
    expect(sent).not.toMatch(/address|latitude|longitude|customer/iu);
  });

  it("does not turn provider errors into research results", async () => {
    const adapter = new ExaResearchAdapter("test-key", async () => new Response("rate limited", { status: 429 }));
    await expect(adapter.search(brief)).rejects.toThrow("Exa search failed (429)");
  });

  it("drops private-network and insecure source candidates", async () => {
    const adapter = new ExaResearchAdapter("test-key", async () => new Response(JSON.stringify({ results: [
      { id: "a", url: "http://extension.example/guide", title: "Insecure" },
      { id: "b", url: "https://127.0.0.1/private", title: "Private" },
      { id: "c", url: "https://extension.example/guide", title: "Public" },
    ] }), { status: 200 }));
    expect((await adapter.search(brief)).candidates.map(({ title }) => title)).toEqual(["Public"]);
  });
});
