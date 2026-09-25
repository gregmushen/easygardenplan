import { describe, expect, it } from "vitest";

import { appLink, navigation, site } from "./site";

describe("Easy Garden Plan public configuration", () => {
  it("centralizes starter identity", () => {
    expect(site.name).toBe("Easy Garden Plan");
    expect(navigation.map(({ href }) => href)).toEqual(["/features", "/pricing", "/about"]);
  });

  it("hands authentication to the configured application origin", () => {
    expect(appLink("/sign-in")).toBe("http://localhost:42069/sign-in");
    expect(appLink("/sign-up?plan=pro", "https://app.example.com")).toBe("https://app.example.com/sign-up?plan=pro");
  });
});
