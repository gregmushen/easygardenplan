import { planInputSnapshotSchema, planResultSchema, type BedGeometry, type MetricPoint, type PlanInputSnapshot, type PlanResult, type PublishedRule } from "@easygardenplan/contracts";
import { pointInRing, validateBedGeometry } from "./geometry.js";

function pointSegmentDistance(point: MetricPoint, a: MetricPoint, b: MetricPoint): number { const dx = b.x - a.x, dy = b.y - a.y; const length = dx * dx + dy * dy; const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0; return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy)); }
function ringClearance(point: MetricPoint, ring: MetricPoint[]): number { return Math.min(...ring.map((vertex, index) => pointSegmentDistance(point, vertex, ring[(index + 1) % ring.length]!))); }
export function circleFits(point: MetricPoint, radius: number, geometry: BedGeometry): boolean { return pointInRing(point, geometry.outer) && ringClearance(point, geometry.outer) + 1e-8 >= radius && geometry.exclusions.every((ring) => !pointInRing(point, ring) && ringClearance(point, ring) + 1e-8 >= radius); }

function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; return JSON.stringify(value); }
async function fingerprint(value: unknown): Promise<string> { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value))); return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join(""); }
function applicableRules(input: PlanInputSnapshot, selection: PlanInputSnapshot["selections"][number], type: PublishedRule["ruleType"]): PublishedRule[] {
  return input.rules.filter((rule) => rule.cropId === selection.cropId && rule.ruleType === type && rule.applicability.methods.includes(selection.method) && rule.payload.state === "known" && (rule.varietyId === null || rule.varietyId === selection.varietyId) && rule.applicability.regionIds.length === 0 && (rule.applicability.hardinessZones.length === 0 || (input.climate?.hardinessZone !== null && input.climate !== null && rule.applicability.hardinessZones.includes(input.climate.hardinessZone)))).sort((a, b) => a.id.localeCompare(b.id));
}

function daysInMonth(year: number, month: number): number { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function localDate(year: number, monthDay: string): string { const [month = 1, rawDay = 1] = monthDay.split("-").map(Number); const day = Math.min(rawDay, daysInMonth(year, month)); return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`; }
function addCalendarDays(value: string, days: number): string { const [year, month, day] = value.split("-").map(Number) as [number, number, number]; const date = new Date(Date.UTC(year, month - 1, day)); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }

export function resolveScheduleWindows(input: PlanInputSnapshot, selection: PlanInputSnapshot["selections"][number]): { windows: PlanResult["scheduleWindows"]; ruleIds: string[]; unresolved?: string } {
  const rules = applicableRules(input, selection, "planting_window").filter((rule) => rule.payload.state === "known" && rule.payload.type === "planting_window");
  if (rules.length === 0) return { windows: [], ruleIds: [], unresolved: "missing_planting_window_rule" };
  if (rules.length > 1) return { windows: [], ruleIds: rules.map(({ id }) => id), unresolved: "conflicting_planting_window_rules" };
  const rule = rules[0]!; if (rule.payload.state !== "known" || rule.payload.type !== "planting_window") return { windows: [], ruleIds: [], unresolved: "missing_planting_window_rule" };
  const windows: PlanResult["scheduleWindows"] = [];
  for (const window of rule.payload.windows) {
    if (window.kind === "calendar") {
      windows.push({ selectionId: selection.id, ruleVersionId: rule.id, startLocalDate: localDate(input.seasonYear, `${String(window.startMonth).padStart(2, "0")}-${String(window.startDay).padStart(2, "0")}`), endLocalDate: localDate(input.seasonYear + window.endYearOffset, `${String(window.endMonth).padStart(2, "0")}-${String(window.endDay).padStart(2, "0")}`), semantics: `calendar:${input.timezone}` });
      continue;
    }
    const anchor = window.anchor.startsWith("spring_last_freeze") ? input.climate?.springFrostLocalDate : input.climate?.autumnFrostLocalDate;
    if (!anchor || input.climate?.state !== "known" || window.anchor.endsWith("28f")) return { windows: [], ruleIds: [rule.id], unresolved: `missing_anchor:${window.anchor}` };
    const anchorDate = localDate(input.seasonYear, anchor);
    windows.push({ selectionId: selection.id, ruleVersionId: rule.id, startLocalDate: addCalendarDays(anchorDate, window.startOffsetDays), endLocalDate: addCalendarDays(anchorDate, window.endOffsetDays), semantics: `anchor:${window.anchor}:${input.timezone}` });
  }
  return { windows, ruleIds: [rule.id] };
}

export async function generatePlan(raw: unknown, effortBudget = 100_000): Promise<PlanResult> {
  const input = planInputSnapshotSchema.parse(raw); let effort = 0; const placements: PlanResult["placements"] = []; const results: PlanResult["selections"] = []; const scheduleWindows: PlanResult["scheduleWindows"] = []; const unresolved: PlanResult["unresolved"] = []; const usedRules = new Set<string>();
  const selections = [...input.selections].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const selection of selections) {
    const schedule = resolveScheduleWindows(input, selection); schedule.ruleIds.forEach((id) => usedRules.add(id)); scheduleWindows.push(...schedule.windows); if (schedule.unresolved) unresolved.push({ selectionId: selection.id, kind: "schedule", code: schedule.unresolved });
    const spacingRules = applicableRules(input, selection, "spacing").filter((rule) => rule.payload.state === "known" && rule.payload.type === "spacing");
    if (spacingRules.length !== 1) { const code = spacingRules.length ? "conflicting_spacing_rules" as const : "missing_spacing_rule" as const; results.push({ selectionId: selection.id, requested: selection.quantity, placed: 0, unplaced: selection.quantity, reasonCodes: [code] }); unresolved.push({ selectionId: selection.id, kind: "placement", code }); continue; }
    const rule = spacingRules[0]!;
    if (rule.payload.state !== "known" || rule.payload.type !== "spacing") throw new Error("Resolved spacing rule has an invalid payload");
    usedRules.add(rule.id); const spacing = rule.payload.withinRowMeters.maximum; const radius = spacing / 2;
    let eligible = input.beds.filter((bed) => validateBedGeometry(bed.geometry).length === 0);
    if (selection.preferredBedId) eligible = [...eligible].sort((a, b) => Number(b.id === selection.preferredBedId) - Number(a.id === selection.preferredBedId) || a.id.localeCompare(b.id)); else eligible.sort((a, b) => a.id.localeCompare(b.id));
    if (selection.bedRestriction === "only") eligible = eligible.filter(({ id }) => id === selection.preferredBedId);
    let placed = 0; let budgetHit = false;
    for (const plot of eligible) {
      const xs = plot.geometry.outer.map(({ x }) => x), ys = plot.geometry.outer.map(({ y }) => y); const minX = Math.min(...xs) + radius, maxX = Math.max(...xs) - radius, minY = Math.min(...ys) + radius, maxY = Math.max(...ys) - radius;
      for (let y = minY; y <= maxY + 1e-8 && placed < selection.quantity; y += spacing) for (let x = minX; x <= maxX + 1e-8 && placed < selection.quantity; x += spacing) {
        effort += 1; if (effort > effortBudget) { budgetHit = true; break; }
        const position = { x: Number(x.toFixed(6)), y: Number(y.toFixed(6)) };
        if (!circleFits(position, radius, plot.geometry)) continue;
        if (placements.some((other) => other.bedId === plot.id && Math.hypot(other.position.x - position.x, other.position.y - position.y) + 1e-8 < other.footprintRadiusMeters + radius)) continue;
        placements.push({ id: `${selection.id}:${placed + 1}`, selectionId: selection.id, cropId: selection.cropId, bedId: plot.id, position, footprintRadiusMeters: radius, spacingRuleVersionId: rule.id, pinned: false }); placed += 1;
      }
      if (budgetHit || placed === selection.quantity) break;
    }
    const unplaced = selection.quantity - placed; const reasonCodes = unplaced ? [eligible.length ? budgetHit ? "search_budget_exhausted" as const : "layout_search_exhausted" as const : "no_eligible_bed" as const] : [];
    results.push({ selectionId: selection.id, requested: selection.quantity, placed, unplaced, reasonCodes }); if (unplaced) unresolved.push({ selectionId: selection.id, kind: "placement", code: reasonCodes[0]! });
  }
  const result = { algorithmVersion: "grid-v1" as const, fingerprint: await fingerprint(input), placements, selections: results.sort((a, b) => a.selectionId.localeCompare(b.selectionId)), scheduleWindows: scheduleWindows.sort((a, b) => a.selectionId.localeCompare(b.selectionId) || a.startLocalDate.localeCompare(b.startLocalDate)), ruleVersionIds: [...usedRules].sort(), unresolved };
  return planResultSchema.parse(result);
}
