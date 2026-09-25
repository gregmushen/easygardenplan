import React from "react";
import type { EmailTemplate } from "../types.js";
import { EmailLayout } from "./layout.js";

export type GardenDigestProps = { gardenName: string; localDate: string; items: Array<{ action: string; cropNames: string[] }> };

export function gardenDigestTemplate(props: GardenDigestProps): EmailTemplate<GardenDigestProps> {
  return {
    name: "garden-digest",
    props,
    render: () => <EmailLayout preview={`Daily garden plan for ${props.gardenName}`}>
      <h1>Your garden plan for today</h1>
      <p><strong>{props.gardenName}</strong></p>
      <p>Here are the current actions gathered from {props.localDate}:</p>
      <ul>{props.items.map((item) => <li key={item.action}>{item.action}{item.cropNames.length ? ` — ${item.cropNames.join(", ")}` : ""}</li>)}</ul>
      <p>Forecasts and garden conditions can change. Open your plan before acting for the latest guidance.</p>
    </EmailLayout>,
  };
}
