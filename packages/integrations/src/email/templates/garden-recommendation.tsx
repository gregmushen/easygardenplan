import React from "react";
import type { EmailTemplate } from "../types.js";
import { EmailLayout } from "./layout.js";

export type GardenRecommendationProps = { gardenName: string; kind: string; action: string; cropNames?: string[]; validFrom?: Date | null; validThrough?: Date | null };

export function gardenRecommendationTemplate(props: GardenRecommendationProps): EmailTemplate<GardenRecommendationProps> {
  const resolved = props.kind === "resolution";
  return {
    name: "garden-recommendation",
    props,
    render: () => <EmailLayout preview={resolved ? `Weather risk cleared for ${props.gardenName}` : `Garden weather update for ${props.gardenName}`}>
      <h1>{resolved ? "The weather risk has passed" : "Your garden may need attention"}</h1>
      <p><strong>{props.gardenName}</strong></p>
      {props.cropNames?.length ? <p>Affected crops: {props.cropNames.join(", ")}</p> : null}
      <p>{props.action}</p>
      {props.validFrom && props.validThrough ? <p>This guidance applies from {props.validFrom.toLocaleString()} through {props.validThrough.toLocaleString()}.</p> : null}
      <p>Forecasts can change. Check your latest local forecast before acting.</p>
    </EmailLayout>,
  };
}
