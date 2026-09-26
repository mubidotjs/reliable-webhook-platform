import { describe, it, expect } from "vitest";
import {
  duration,
  failureDescription,
  endpointLabel,
  deliveryLabels,
} from "./delivery-format";
describe("delivery presentation", () => {
  it("formats known failures without guessing network subtypes", () => {
    expect(failureDescription("NETWORK")).toBe(
      "Unable to connect to destination",
    );
    expect(failureDescription("TIMEOUT")).toContain("5 seconds");
    expect(failureDescription(null, 429)).toContain("rate limited");
    expect(failureDescription(null, 500)).toContain("server error");
    expect(failureDescription("UNCERTAIN")).toContain("may have received");
    expect(failureDescription("unsafe stack / credentials")).not.toContain(
      "credentials",
    );
  });
  it("formats durations, names and all authoritative statuses", () => {
    expect(duration(null)).toBe("—");
    expect(duration(128)).toBe("128 ms");
    expect(duration(1400)).toBe("1.4 s");
    expect(
      endpointLabel({ name: null, url: "https://example.com/hooks" }),
    ).toBe("example.com");
    expect(endpointLabel({ name: "CRM", url: "https://example.com" })).toBe(
      "CRM",
    );
    expect(Object.keys(deliveryLabels)).toHaveLength(6);
  });
});
