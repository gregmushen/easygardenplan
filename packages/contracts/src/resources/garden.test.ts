import { describe, expect, it } from "vitest";
import { gardenCreateSchema, gardenUpdateSchema } from "./garden.js";

describe("Garden contracts", () => {
  it("validates create and update boundaries", () => {
    const valid = { name: "Example" };
    expect(gardenCreateSchema.parse(valid)).toMatchObject(valid);
    expect(() => gardenCreateSchema.parse({ name: "" })).toThrow();
    expect(() => gardenUpdateSchema.parse({})).toThrow();
  });
});
