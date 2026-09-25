import { describe, expect, it } from "vitest";
import { decideRiskTransition, evaluateColdRisk, type PreviousRisk } from "./monitoring.js";

const base: PreviousRisk = { state: "clear", episodeId: null, actionFingerprint: null, clearConfirmationCount: 0 };
const candidate = { hazard: "cold" as const, groupKey: "tomato:transplanted", action: "Cover plants", affectedIds: ["plant-1"], validFrom: "2026-10-01T06:00:00.000Z", validThrough: "2026-10-01T12:00:00.000Z", evidenceFingerprint: "forecast-a" };
const previous = (value: ReturnType<typeof decideRiskTransition>): PreviousRisk => ({ state: value.nextState, episodeId: value.episodeId, actionFingerprint: value.actionFingerprint, clearConfirmationCount: value.clearConfirmationCount });

describe("weather risk transitions", () => {
  it("warns once, resolves after confirmation, stays silent, then renews", () => {
    const first = decideRiskTransition(base, { status: "evaluated", candidate }, { newEpisodeId: () => "episode-1" });
    expect(first).toMatchObject({ nextState: "active", transition: "warning", episodeId: "episode-1" });
    const repeated = decideRiskTransition(previous(first), { status: "evaluated", candidate });
    expect(repeated.transition).toBeNull();
    const pending = decideRiskTransition(previous(repeated), { status: "evaluated" });
    expect(pending).toMatchObject({ nextState: "active", transition: null, clearConfirmationCount: 1 });
    const resolved = decideRiskTransition(previous(pending), { status: "evaluated" });
    expect(resolved).toMatchObject({ nextState: "resolved", transition: "resolution" });
    expect(decideRiskTransition(previous(resolved), { status: "evaluated" }).transition).toBeNull();
    expect(decideRiskTransition(previous(resolved), { status: "evaluated", candidate }, { newEpisodeId: () => "episode-2" })).toMatchObject({ transition: "renewed_warning", episodeId: "episode-2" });
  });

  it("retains an active episode through missing or stale data", () => {
    const active = decideRiskTransition(base, { status: "evaluated", candidate }, { newEpisodeId: () => "episode-1" });
    expect(decideRiskTransition(previous(active), { status: "stale" })).toMatchObject({ nextState: "unknown", episodeId: "episode-1", transition: null, retainActiveEpisode: true });
  });

  it("emits a material change only when the action identity changes", () => {
    const active = decideRiskTransition(base, { status: "evaluated", candidate }, { newEpisodeId: () => "episode-1" });
    expect(decideRiskTransition(previous(active), { status: "evaluated", candidate: { ...candidate, evidenceFingerprint: "forecast-b" } }).transition).toBeNull();
    expect(decideRiskTransition(previous(active), { status: "evaluated", candidate: { ...candidate, action: "Move plants indoors" } }).transition).toBe("material_change");
  });

  it("evaluates only covered future intervals against an explicit reviewed threshold", () => {
    const result = evaluateColdRisk({ intervals: [{ start: "2026-10-01T06:00:00.000Z", end: "2026-10-01T07:00:00.000Z", temperatureCelsius: 1 }], thresholdCelsius: 2, action: "Cover", affectedIds: ["one"], groupKey: "crop:stage", evidenceFingerprint: "a", now: new Date("2026-10-01T05:00:00.000Z"), horizonThrough: new Date("2026-10-02T05:00:00.000Z") });
    expect(result.candidate?.minimumForecastCelsius).toBe(1);
  });
});
