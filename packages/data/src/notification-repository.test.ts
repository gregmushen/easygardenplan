import { describe, expect, it } from "vitest";
import { affectedPlantingsComplete, affectedTasksComplete, coalesceDigestItems, digestDueAt, isWithinQuietHours, localDateAt, selectDigestRecommendationIds } from "./notification-repository.js";

const first = "11111111-1111-4111-8111-111111111111";
const second = "22222222-2222-4222-8222-222222222222";

function event(id: string, selectionId: string, eventType: string, supersedesEventId: string | null = null) {
  return { id, selectionId, eventType, supersedesEventId };
}

describe("affectedPlantingsComplete", () => {
  it("requires every affected planting to have a terminal effective event", () => {
    expect(affectedPlantingsComplete([first, second], [
      event("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", first, "removed"),
      event("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", second, "harvested"),
    ])).toBe(true);
    expect(affectedPlantingsComplete([first, second], [
      event("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", first, "removed"),
      event("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", second, "transplanted"),
    ])).toBe(false);
  });

  it("uses the latest event supplied for a planting", () => {
    expect(affectedPlantingsComplete([first], [
      event("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", first, "transplanted"),
      event("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", first, "removed"),
    ])).toBe(false);
  });

  it("ignores a terminal event invalidated by a correction", () => {
    const removed = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(affectedPlantingsComplete([first], [
      event("cccccccc-cccc-4ccc-8ccc-cccccccccccc", first, "correction", removed),
      event(removed, first, "removed"),
      event("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", first, "transplanted"),
    ])).toBe(false);
  });

  it("does not suppress when affected identities are absent or are not selection UUIDs", () => {
    expect(affectedPlantingsComplete([], [])).toBe(false);
    expect(affectedPlantingsComplete(["selection-1"], [])).toBe(false);
  });
});

describe("isWithinQuietHours", () => {
  it("handles overnight windows in the garden timezone", () => {
    expect(isWithinQuietHours(new Date("2026-07-01T06:30:00.000Z"), "America/Los_Angeles", "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(new Date("2026-07-01T15:00:00.000Z"), "America/Los_Angeles", "22:00", "07:00")).toBe(false);
  });

  it("uses the actual offset on both sides of daylight-saving changes", () => {
    expect(isWithinQuietHours(new Date("2026-03-08T09:30:00.000Z"), "America/Los_Angeles", "22:00", "07:00")).toBe(true);
    expect(isWithinQuietHours(new Date("2026-03-08T14:30:00.000Z"), "America/Los_Angeles", "22:00", "07:00")).toBe(false);
    expect(isWithinQuietHours(new Date("2026-11-01T09:30:00.000Z"), "America/Los_Angeles", "22:00", "07:00")).toBe(true);
  });

  it("treats matching boundaries as an all-day quiet preference", () => {
    expect(isWithinQuietHours(new Date("2026-07-01T15:00:00.000Z"), "America/Los_Angeles", "08:00", "08:00")).toBe(true);
    expect(isWithinQuietHours(new Date(), "Etc/UTC", null, null)).toBe(false);
  });
});

describe("affectedTasksComplete", () => {
  it("requires every identified task's latest status to be terminal", () => {
    expect(affectedTasksComplete([first, second], [{ id: first }, { id: second }], [
      { taskId: first, revision: 2, state: "completed" }, { taskId: first, revision: 1, state: "planned" }, { taskId: second, revision: 1, state: "skipped" },
    ])).toBe(true);
    expect(affectedTasksComplete([first, second], [{ id: first }, { id: second }], [
      { taskId: first, revision: 1, state: "completed" }, { taskId: second, revision: 2, state: "postponed" },
    ])).toBe(false);
  });

  it("fails open for missing, malformed or cross-garden task identities", () => {
    expect(affectedTasksComplete([], [], [])).toBe(false);
    expect(affectedTasksComplete(["task-one"], [], [])).toBe(false);
    expect(affectedTasksComplete([first], [], [{ taskId: first, revision: 1, state: "completed" }])).toBe(false);
  });
});

describe("selectDigestRecommendationIds", () => {
  it("uses the garden-local date and excludes immediately sent versions", () => {
    const entries = [
      { recommendationVersionId: first, createdAt: new Date("2026-10-02T06:30:00.000Z") },
      { recommendationVersionId: second, createdAt: new Date("2026-10-02T07:30:00.000Z") },
    ];
    expect(selectDigestRecommendationIds(entries, new Set([first]), "America/Los_Angeles", "2026-10-02")).toEqual([second]);
    expect(selectDigestRecommendationIds(entries, new Set(), "America/Los_Angeles", "2026-10-01")).toEqual([first]);
  });
});

describe("daily digest clock", () => {
  it("schedules seven in the garden timezone across both DST boundaries", () => {
    const spring = digestDueAt("2026-03-07", "America/Los_Angeles");
    const autumn = digestDueAt("2026-10-31", "America/Los_Angeles");
    expect(spring.toISOString()).toBe("2026-03-08T14:00:00.000Z");
    expect(autumn.toISOString()).toBe("2026-11-01T15:00:00.000Z");
    expect(localDateAt(spring, "America/Los_Angeles")).toBe("2026-03-08");
    expect(localDateAt(autumn, "America/Los_Angeles")).toBe("2026-11-01");
  });
});

describe("coalesceDigestItems", () => {
  it("combines crop names for a shared action and removes duplicate names", () => {
    expect(coalesceDigestItems([
      { action: "Cover before sunset.", affectedCropNames: ["Tomato", "Pepper"] },
      { action: "Cover before sunset.", affectedCropNames: ["Pepper", "Basil"] },
      { action: "Move indoors.", affectedCropNames: ["Citrus"] },
    ])).toEqual([
      { action: "Cover before sunset.", cropNames: ["Basil", "Pepper", "Tomato"] },
      { action: "Move indoors.", cropNames: ["Citrus"] },
    ]);
  });
});
