import { describe, expect, it } from "vitest";

import {
  createEndpointSchema,
  createOpenApiDocument,
  updateEndpointSchema,
} from "./index";

describe("endpoint contracts", () => {
  it("applies the endpoint timeout default and rejects unknown keys", () => {
    expect(
      createEndpointSchema.parse({ url: "https://example.com/hook" }),
    ).toEqual({ url: "https://example.com/hook", timeoutMs: 5_000 });
    expect(() =>
      createEndpointSchema.parse({
        url: "https://example.com/hook",
        extra: true,
      }),
    ).toThrow();
  });

  it("allows edits or one-way disablement but not re-enablement", () => {
    expect(updateEndpointSchema.parse({ timeoutMs: 3_000 })).toEqual({
      timeoutMs: 3_000,
    });
    expect(updateEndpointSchema.parse({ status: "DISABLED" })).toEqual({
      status: "DISABLED",
    });
    expect(() => updateEndpointSchema.parse({ status: "ENABLED" })).toThrow();
    expect(() => updateEndpointSchema.parse({})).toThrow();
  });

  it("generates the M1 and M2 paths from the shared schemas", () => {
    const document = createOpenApiDocument();
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths ?? {})).toEqual([
      "/v1/endpoints",
      "/v1/endpoints/{id}",
      "/v1/endpoints/{id}/rotate-secret",
      "/api/events",
    ]);
  });
});
