import { describe, expect, it } from "vitest";
import { affectedPlantingsComplete } from "./notification-repository.js";

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
