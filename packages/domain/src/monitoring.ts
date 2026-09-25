import type { RecommendationTransitionKind, WeatherEvaluationStatus, WeatherRiskState } from "@easygardenplan/contracts";

export type RiskCandidate = Readonly<{
  hazard: "cold" | "heat" | "official_alert";
  groupKey: string;
  action: string;
  affectedIds: readonly string[];
  affectedTaskIds?: readonly string[];
  validFrom: string;
  validThrough: string;
  evidenceFingerprint: string;
  minimumForecastCelsius?: number;
  thresholdCelsius?: number;
}>;

export type PreviousRisk = Readonly<{
  state: WeatherRiskState;
  episodeId: string | null;
  actionFingerprint: string | null;
  clearConfirmationCount: number;
}>;

export type RiskObservation = Readonly<{
  status: WeatherEvaluationStatus;
  candidate?: RiskCandidate;
  hold?: boolean;
  snapshotId?: string;
}>;

export type RiskDecision = Readonly<{
  nextState: WeatherRiskState;
  episodeId: string | null;
  actionFingerprint: string | null;
  clearConfirmationCount: number;
  transition: RecommendationTransitionKind | null;
  retainActiveEpisode: boolean;
}>;

export function candidateActionFingerprint(candidate: RiskCandidate): string {
  return JSON.stringify({ hazard: candidate.hazard, groupKey: candidate.groupKey, action: candidate.action, affectedIds: [...candidate.affectedIds].sort(), affectedTaskIds: [...(candidate.affectedTaskIds ?? [])].sort(), validFrom: candidate.validFrom, validThrough: candidate.validThrough });
}

/** Pure episode state machine. Missing or stale data can never resolve risk. */
export function decideRiskTransition(previous: PreviousRisk, observation: RiskObservation, options: { resolutionConfirmations?: number; newEpisodeId?: () => string } = {}): RiskDecision {
  const confirmations = Math.max(1, options.resolutionConfirmations ?? 2);
  if (observation.status !== "evaluated") {
    return { nextState: "unknown", episodeId: previous.episodeId, actionFingerprint: previous.actionFingerprint, clearConfirmationCount: 0, transition: null, retainActiveEpisode: previous.state === "active" || (previous.state === "unknown" && previous.episodeId !== null) };
  }
  if (observation.hold) return { nextState: previous.state, episodeId: previous.episodeId, actionFingerprint: previous.actionFingerprint, clearConfirmationCount: 0, transition: null, retainActiveEpisode: previous.state === "active" || (previous.state === "unknown" && previous.episodeId !== null) };
  if (observation.candidate) {
    const fingerprint = candidateActionFingerprint(observation.candidate);
    if (previous.state === "active" || (previous.state === "unknown" && previous.episodeId)) {
      return { nextState: "active", episodeId: previous.episodeId, actionFingerprint: fingerprint, clearConfirmationCount: 0, transition: previous.actionFingerprint && previous.actionFingerprint !== fingerprint ? "material_change" : null, retainActiveEpisode: true };
    }
    const episodeId = options.newEpisodeId?.() ?? crypto.randomUUID();
    return { nextState: "active", episodeId, actionFingerprint: fingerprint, clearConfirmationCount: 0, transition: previous.state === "resolved" || (previous.state === "clear" && previous.episodeId !== null) ? "renewed_warning" : "warning", retainActiveEpisode: true };
  }
  if (previous.state === "active" || (previous.state === "unknown" && previous.episodeId)) {
    const count = previous.clearConfirmationCount + 1;
    if (count < confirmations) return { nextState: "active", episodeId: previous.episodeId, actionFingerprint: previous.actionFingerprint, clearConfirmationCount: count, transition: null, retainActiveEpisode: true };
    return { nextState: "resolved", episodeId: previous.episodeId, actionFingerprint: previous.actionFingerprint, clearConfirmationCount: count, transition: "resolution", retainActiveEpisode: false };
  }
  return { nextState: "clear", episodeId: previous.episodeId, actionFingerprint: previous.actionFingerprint, clearConfirmationCount: 0, transition: null, retainActiveEpisode: false };
}

export function evaluateColdRisk(input: { intervals: readonly { start: string; end: string; temperatureCelsius: number }[]; thresholdCelsius: number; clearAboveCelsius?: number; action: string; affectedIds: readonly string[]; groupKey: string; evidenceFingerprint: string; now: Date; horizonThrough: Date }): RiskObservation {
  const usable = input.intervals.filter((interval) => new Date(interval.end) > input.now && new Date(interval.start) < input.horizonThrough);
  if (usable.length === 0) return { status: "insufficient_inputs" };
  const minimum = Math.min(...usable.map(({ temperatureCelsius }) => temperatureCelsius));
  if (minimum > input.thresholdCelsius) return minimum <= (input.clearAboveCelsius ?? input.thresholdCelsius) ? { status: "evaluated", hold: true } : { status: "evaluated" };
  return { status: "evaluated", candidate: { hazard: "cold", groupKey: input.groupKey, action: input.action, affectedIds: input.affectedIds, validFrom: usable[0]!.start, validThrough: usable.at(-1)!.end, evidenceFingerprint: input.evidenceFingerprint, minimumForecastCelsius: minimum, thresholdCelsius: input.thresholdCelsius } };
}
