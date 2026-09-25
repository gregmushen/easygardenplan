import { normalizedForecastSchema, normalizedOfficialAlertSchema, type NormalizedForecast, type NormalizedOfficialAlert } from "@easygardenplan/contracts";
import { z } from "zod";

const pointSchema = z.object({ properties: z.object({ forecastHourly: z.url(), forecastGridData: z.url().optional(), forecastZone: z.url().optional() }).passthrough() }).passthrough();
const providerTime = z.iso.datetime({ offset: true });
const hourlySchema = z.object({ properties: z.object({ updateTime: providerTime, generatedAt: providerTime, periods: z.array(z.object({ startTime: providerTime, endTime: providerTime, temperature: z.number(), temperatureUnit: z.enum(["F", "C"]) }).passthrough()).min(1) }).passthrough() }).passthrough();
const alertsSchema = z.object({ features: z.array(z.object({ id: z.url(), properties: z.object({ id: z.string().min(1), areaDesc: z.string().default(""), sent: providerTime, effective: providerTime, onset: providerTime.nullable().optional(), expires: providerTime, ends: providerTime.nullable().optional(), status: z.string().min(1), messageType: z.string().min(1), event: z.string().min(1), headline: z.string().nullable().optional(), references: z.array(z.unknown()).optional() }).passthrough() }).passthrough()) }).passthrough();

function celsius(value: number, unit: "F" | "C"): number { return unit === "C" ? value : (value - 32) * 5 / 9; }
async function fingerprint(value: unknown): Promise<string> { const bytes = new TextEncoder().encode(JSON.stringify(value)); return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }

export class NwsAdapterError extends Error {
  constructor(readonly reason: "unavailable" | "invalid_response" | "rate_limited", message: string) { super(message); }
}

export class NwsAdapter {
  constructor(private readonly options: { userAgent: string; fetch?: typeof fetch; clock?: { now(): Date }; baseUrl?: string; onRequest?: () => void | Promise<void> }) {
    if (!options.userAgent.trim()) throw new Error("NWS User-Agent is required");
  }
  private async get(url: string): Promise<unknown> {
    await this.options.onRequest?.();
    const response = await (this.options.fetch ?? fetch)(url, { headers: { Accept: "application/geo+json", "User-Agent": this.options.userAgent } });
    if (response.status === 429) throw new NwsAdapterError("rate_limited", "NWS request was rate limited");
    if (!response.ok) throw new NwsAdapterError("unavailable", `NWS request failed with ${response.status}`);
    try { return await response.json(); } catch { throw new NwsAdapterError("invalid_response", "NWS returned invalid JSON"); }
  }
  async forecast(latitude: number, longitude: number): Promise<NormalizedForecast> {
    const base = this.options.baseUrl ?? "https://api.weather.gov";
    const point = pointSchema.parse(await this.get(`${base}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`));
    const raw = hourlySchema.parse(await this.get(point.properties.forecastHourly));
    const intervals = raw.properties.periods.map((period) => ({ start: new Date(period.startTime).toISOString(), end: new Date(period.endTime).toISOString(), temperatureCelsius: Math.round(celsius(period.temperature, period.temperatureUnit) * 10) / 10 }));
    return normalizedForecastSchema.parse({ provider: "nws", sourceKey: point.properties.forecastHourly, sourceUpdatedAt: new Date(raw.properties.updateTime).toISOString(), retrievedAt: (this.options.clock?.now() ?? new Date()).toISOString(), validFrom: intervals[0]!.start, validThrough: intervals.at(-1)!.end, fingerprint: await fingerprint(intervals), normalizationVersion: 1, intervals });
  }
  async alerts(latitude: number, longitude: number): Promise<NormalizedOfficialAlert[]> {
    const base = this.options.baseUrl ?? "https://api.weather.gov";
    const raw = alertsSchema.parse(await this.get(`${base}/alerts/active?point=${latitude.toFixed(4)},${longitude.toFixed(4)}`));
    return raw.features.map(({ id, properties }) => normalizedOfficialAlertSchema.parse({ provider: "nws", providerAlertId: properties.id, event: properties.event, status: properties.status, messageType: properties.messageType, sentAt: new Date(properties.sent).toISOString(), effectiveAt: new Date(properties.effective).toISOString(), onsetAt: properties.onset ? new Date(properties.onset).toISOString() : null, expiresAt: new Date(properties.expires).toISOString(), endsAt: properties.ends ? new Date(properties.ends).toISOString() : null, cancelled: properties.messageType.toLowerCase() === "cancel", headline: properties.headline ?? null, sourceUrl: id, areaDescription: properties.areaDesc }));
  }
}
