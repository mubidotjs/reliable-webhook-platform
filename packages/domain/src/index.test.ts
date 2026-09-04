import { describe, expect, it } from "vitest";

import { assertDeliveryTransition, canTransitionDelivery } from "./index";

describe("delivery state transitions", () => {
  it("allows a pending delivery to be claimed", () => {
    expect(canTransitionDelivery("PENDING", "PROCESSING")).toBe(true);
  });

  it("prevents a completed delivery from being processed again", () => {
    expect(canTransitionDelivery("SUCCEEDED", "PROCESSING")).toBe(false);
    expect(() => assertDeliveryTransition("SUCCEEDED", "PROCESSING")).toThrow(
      "Invalid delivery transition",
    );
  });
});
