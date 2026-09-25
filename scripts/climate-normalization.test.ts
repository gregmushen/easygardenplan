import { describe, expect, it } from "vitest";
import { hardinessZoneForFahrenheit, normalizeNoaaStation, parseCsvLine, wrapLongitude } from "./climate-normalization.js";

describe("official climate source normalization", () => {
  it("parses quoted CSV and normalizes NOAA P50 32F anchors", () => {
    expect(parseCsvLine('"id","name, place","quoted ""value"""')).toEqual(["id", "name, place", 'quoted "value"']);
    const header = '"STATION","NAME","LATITUDE","LONGITUDE","ELEVATION","ANN-TMIN-PRBFST-T32FP50","ANN-TMIN-PRBLST-T32FP50","ANN-TMIN-PRBOCC-LSTH032"';
    const row = '"USW0001","Example, OR US","45.5000","-122.6000","30.5","11/19","03/16","99.0"';
    expect(normalizeNoaaStation(header, row)).toEqual({ externalId: "USW0001", coordinate: { latitude: 45.5, longitude: -122.6 }, elevationMeters: 30.5, hardinessZone: null, frostState: "known", springFrostLocalDate: "03-16", autumnFrostLocalDate: "11-19", referencePeriod: "1991-2020 NOAA Climate Normals v1.0.1", probabilityPercent: 50 });
  });

  it("labels only explicit zero occurrence as frost free and rejects ambiguous missing anchors", () => {
    const header = "STATION,NAME,LATITUDE,LONGITUDE,ELEVATION,ANN-TMIN-PRBFST-T32FP50,ANN-TMIN-PRBLST-T32FP50,ANN-TMIN-PRBOCC-LSTH032";
    expect(normalizeNoaaStation(header, "warm,Warm,25,-80,2,,,0")).toMatchObject({ frostState: "frost_free", springFrostLocalDate: null, autumnFrostLocalDate: null });
    expect(normalizeNoaaStation(header, "ambiguous,Ambiguous,25,-80,2,,,")).toBeNull();
    expect(normalizeNoaaStation(header, "cold,Cold,60,-150,2,V,V,100")).toBeNull();
  });

  it("maps the official five-degree half-zone bands", () => {
    expect([hardinessZoneForFahrenheit(-60), hardinessZoneForFahrenheit(-55), hardinessZoneForFahrenheit(0), hardinessZoneForFahrenheit(5), hardinessZoneForFahrenheit(69.9)]).toEqual(["1a", "1b", "7a", "7b", "13b"]);
    expect(hardinessZoneForFahrenheit(-9999)).toBeNull();
    expect([wrapLongitude(-187), wrapLongitude(181), wrapLongitude(-180)]).toEqual([173, -179, -180]);
  });
});
