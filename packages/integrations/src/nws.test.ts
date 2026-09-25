import { describe, expect, it } from "vitest";
import { NwsAdapter } from "./nws.js";

const point = { properties: { forecastHourly: "https://api.weather.gov/gridpoints/MTR/85,105/forecast/hourly" } };
const hourly = { properties: { updateTime: "2026-09-25T03:00:00-07:00", generatedAt: "2026-09-25T03:05:00-07:00", periods: [{ startTime: "2026-09-25T04:00:00-07:00", endTime: "2026-09-25T05:00:00-07:00", temperature: 32, temperatureUnit: "F" }, { startTime: "2026-09-25T05:00:00-07:00", endTime: "2026-09-25T06:00:00-07:00", temperature: 2, temperatureUnit: "C" }] } };

describe("NWS adapter", () => {
  it("discovers the grid endpoint, normalizes units and sends the required identity", async () => {
    const requests: Request[] = [];
    let metered = 0;
    const adapter = new NwsAdapter({ userAgent: "easygardenplan.com, support@example.test", clock: { now: () => new Date("2026-09-25T10:10:00.000Z") }, onRequest: () => { metered += 1; }, fetch: async (input, init) => { requests.push(new Request(input, init)); return Response.json(requests.length === 1 ? point : hourly); } });
    const forecast = await adapter.forecast(37.7749, -122.4194);
    expect(forecast.intervals.map(({ temperatureCelsius }) => temperatureCelsius)).toEqual([0, 2]);
    expect(forecast.retrievedAt).toBe("2026-09-25T10:10:00.000Z");
    expect(requests[0]!.headers.get("user-agent")).toContain("easygardenplan.com");
    expect(metered).toBe(2);
  });

  it("normalizes active alerts and cancellation messages", async () => {
    const body = { features: [{ id: "https://api.weather.gov/alerts/alert-1", properties: { id: "alert-1", areaDesc: "Test County", sent: "2026-09-25T10:00:00.000Z", effective: "2026-09-25T10:00:00.000Z", onset: null, expires: "2026-09-25T12:00:00.000Z", ends: null, status: "Actual", messageType: "Cancel", event: "Freeze Warning", headline: "Warning canceled" } }] };
    const adapter = new NwsAdapter({ userAgent: "test", fetch: async () => Response.json(body) });
    expect((await adapter.alerts(1, 2))[0]).toMatchObject({ providerAlertId: "alert-1", cancelled: true, event: "Freeze Warning" });
  });

  it("classifies rate limits without fabricating a forecast", async () => {
    const adapter = new NwsAdapter({ userAgent: "test", fetch: async () => new Response(null, { status: 429 }) });
    await expect(adapter.forecast(1, 2)).rejects.toMatchObject({ reason: "rate_limited" });
  });

  it("rejects a forecast with no covered intervals", async () => {
    const adapter = new NwsAdapter({ userAgent: "test", fetch: async (input) => Response.json(String(input).includes("/points/") ? point : { properties: { ...hourly.properties, periods: [] } }) });
    await expect(adapter.forecast(1, 2)).rejects.toThrow();
  });
});
