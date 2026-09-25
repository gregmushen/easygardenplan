import { createHash } from "node:crypto";

const fractions: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅛": 0.125, "1½": 1.5 };

function number(value: string): number {
  const normalized = value.trim();
  if (normalized in fractions) return fractions[normalized]!;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Unsupported numeric value: ${value}`);
  return parsed;
}

function range(value: string): { minimum: number; maximum: number } {
  const [minimum, maximum] = value.trim().split(/\s*[-–]\s*/);
  if (!minimum) throw new Error(`Missing range: ${value}`);
  return { minimum: number(minimum), maximum: number(maximum ?? minimum) };
}

function meters(value: number): number { return Number((value * 0.0254).toFixed(4)); }

function cleanName(value: string): { commonName: string; transplanted: boolean } {
  const transplanted = value.includes("\\*") || value.includes("*");
  return { commonName: value.replaceAll("**", "").replaceAll("\\*", "").replaceAll("*", "").trim(), transplanted };
}

function slug(value: string): string {
  return value.toLowerCase().replaceAll("&", " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export type CropRuleCandidate = Readonly<{
  cropSlug: string;
  commonName: string;
  ruleType: "spacing" | "maturity";
  methods: readonly ("direct_sow" | "indoor_start" | "purchased_start")[];
  regionIds: readonly ["us-sc"];
  payload: Record<string, unknown>;
  normalizedClaim: string;
  originalUnits: string;
  locator: "Table 2";
}>;

export function normalizeClemsonPlanningChart(markdown: string) {
  const start = markdown.indexOf("**Table 2. Vegetables Planting Chart**");
  if (start < 0) throw new Error("Clemson Table 2 was not found");
  const section = markdown.slice(start);
  const rows = [...section.matchAll(/^\| \*\*(.+?)\*\* \| (.*?) \| (.*?) \| (.*?) \| (.*?) \|$/gm)];
  const candidates: CropRuleCandidate[] = [];
  const omissions: Array<{ crop: string; ruleType: string; reason: string }> = [];
  for (const match of rows) {
    const rawName = match[1]!;
    if (rawName === "Vegetable") continue;
    const { commonName, transplanted } = cleanName(rawName);
    const cropSlug = slug(commonName);
    const methods = transplanted ? ["indoor_start", "purchased_start"] as const : ["direct_sow"] as const;
    const spacing = match[3]!.match(/^([^ ]+)\s+x\s+([^ ]+)$/i);
    if (spacing) {
      const between = range(spacing[1]!);
      const within = range(spacing[2]!);
      candidates.push({ cropSlug, commonName, ruleType: "spacing", methods, regionIds: ["us-sc"], locator: "Table 2", originalUnits: "inches",
        normalizedClaim: `${commonName}: ${spacing[2]} inches between plants and ${spacing[1]} inches between rows in the source chart.`,
        payload: { state: "known", type: "spacing", withinRowMeters: { minimum: meters(within.minimum), maximum: meters(within.maximum), minimumInclusive: true, maximumInclusive: true }, betweenRowMeters: { minimum: meters(between.minimum), maximum: meters(between.maximum), minimumInclusive: true, maximumInclusive: true }, pattern: "row", sourceUnit: "inches" } });
    } else omissions.push({ crop: commonName, ruleType: "spacing", reason: `Unsupported source value: ${match[3]}` });
    const maturityText = match[5]!.trim();
    if (/^\d+(?:\s*[-–]\s*\d+)?$/.test(maturityText)) {
      const maturity = range(maturityText);
      candidates.push({ cropSlug, commonName, ruleType: "maturity", methods, regionIds: ["us-sc"], locator: "Table 2", originalUnits: "calendar days",
        normalizedClaim: `${commonName}: approximately ${maturityText} days to harvest in the source chart.`,
        payload: { state: "known", type: "maturity", days: { ...maturity, minimumInclusive: true, maximumInclusive: true }, anchor: transplanted ? "transplant" : "sowing", sourceUnit: "calendar_days" } });
    } else omissions.push({ crop: commonName, ruleType: "maturity", reason: `Not normalized from non-day value: ${maturityText}` });
  }
  if (new Set(candidates.map(({ cropSlug }) => cropSlug)).size !== 39) throw new Error("Expected 39 Clemson crops");
  return { candidates, omissions };
}

export function sha256(content: string): string { return createHash("sha256").update(content).digest("hex"); }
