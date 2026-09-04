import { describe, expect, it } from "vitest";

import { createWorkspaceSchema, cursorPageSchema } from "./index";

describe("foundation contracts", () => {
  it("normalizes a valid workspace name", () => {
    expect(createWorkspaceSchema.parse({ name: "  Delivery Lab  " })).toEqual({
      name: "Delivery Lab",
    });
  });

  it("uses bounded pagination defaults", () => {
    expect(cursorPageSchema.parse({})).toEqual({ limit: 25 });
    expect(() => cursorPageSchema.parse({ limit: 101 })).toThrow();
  });
});
