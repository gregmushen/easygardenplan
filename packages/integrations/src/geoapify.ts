import { geocodeCandidateSchema, geocodeRequestSchema, type GeocodeCandidate } from "@easygardenplan/contracts";
import { z } from "zod";

const responseSchema = z.object({
  results: z.array(z.object({
    place_id: z.string(),
    formatted: z.string(),
    lat: z.number(),
    lon: z.number(),
    result_type: z.string().nullish(),
    rank: z.object({ confidence: z.number().min(0).max(1).nullish() }).nullish(),
    timezone: z.object({ name: z.string().min(1) }).nullish(),
  })),
});

export interface Geocoder {
  forward(input: unknown): Promise<GeocodeCandidate[]>;
}

export class GeoapifyError extends Error {
  constructor(readonly code: "configuration" | "rate_limited" | "provider" | "invalid_response", message: string, readonly retryable: boolean) { super(message); }
}

export class GeoapifyGeocoder implements Geocoder {
  constructor(private readonly options: { apiKey: string; fetch?: typeof fetch; endpoint?: string }) {}

  async forward(input: unknown): Promise<GeocodeCandidate[]> {
    const request = geocodeRequestSchema.parse(input);
    if (!this.options.apiKey) throw new GeoapifyError("configuration", "Geoapify is not configured", false);
    const url = new URL(this.options.endpoint ?? "https://api.geoapify.com/v1/geocode/search");
    url.searchParams.set("text", request.text);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(request.limit));
    url.searchParams.set("filter", "countrycode:us");
    url.searchParams.set("lang", "en");
    url.searchParams.set("apiKey", this.options.apiKey);
    const response = await (this.options.fetch ?? fetch)(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8_000) });
    if (response.status === 429) throw new GeoapifyError("rate_limited", "Geocoding is temporarily busy", true);
    if (!response.ok) throw new GeoapifyError("provider", `Geocoding provider returned ${response.status}`, response.status >= 500);
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw new GeoapifyError("invalid_response", "Geocoding provider returned an invalid response", false);
    return parsed.data.results.map((result) => geocodeCandidateSchema.parse({
      provider: "geoapify",
      providerPlaceId: result.place_id,
      formattedAddress: result.formatted,
      coordinate: { latitude: result.lat, longitude: result.lon },
      timezone: result.timezone?.name,
      confidence: result.rank?.confidence ?? null,
      resultType: result.result_type ?? null,
      attribution: "Geocoding by Geoapify; data © OpenStreetMap contributors",
    }));
  }
}

export class FixtureGeocoder implements Geocoder {
  constructor(private readonly candidates: readonly GeocodeCandidate[]) {}
  async forward(input: unknown): Promise<GeocodeCandidate[]> {
    geocodeRequestSchema.parse(input);
    return this.candidates.map((candidate) => geocodeCandidateSchema.parse(candidate));
  }
}
