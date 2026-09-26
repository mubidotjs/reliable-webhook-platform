import { describe, it, expect } from "vitest";
import {
  deliveryQuerySchema,
  replayKeySchema,
  replayRequestSchema,
} from "./deliveries";
describe("delivery contracts", () => {
  it("bounds pages and validates filters", () => {
    expect(deliveryQuerySchema.parse({}).limit).toBe(25);
    for (const input of [
      { limit: 0 },
      { limit: 101 },
      { status: "FAILED" },
      { from: "yesterday" },
      { from: "2026-02-02T00:00:00Z", to: "2026-02-01T00:00:00Z" },
      { search: "x".repeat(129) },
      { cursor: "x".repeat(513) },
      { tenantId: "foreign" },
    ])
      expect(deliveryQuerySchema.safeParse(input).success).toBe(false);
    expect(
      deliveryQuerySchema.parse({
        status: "EXHAUSTED",
        limit: "2",
        search: " id ",
      }).search,
    ).toBe("id");
  });
  it("requires a bounded replay key and confirmed revision", () => {
    expect(replayKeySchema.safeParse("").success).toBe(false);
    expect(replayKeySchema.safeParse("x".repeat(129)).success).toBe(false);
    expect(replayRequestSchema.safeParse({}).success).toBe(false);
    expect(
      replayRequestSchema.safeParse({
        endpointRevision: "hash",
        workspaceId: "foreign",
      }).success,
    ).toBe(false);
  });
});
