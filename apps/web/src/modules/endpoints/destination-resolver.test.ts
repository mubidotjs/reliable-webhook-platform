import type { LookupFunction } from "node:net";

import { describe, expect, it } from "vitest";

import { createSafeConnectionLookup } from "./destination-resolver";

function runLookup(
  lookup: LookupFunction,
): Promise<{ address: string; family: number }> {
  return new Promise((resolve, reject) => {
    lookup(
      "example.com",
      { family: 0, all: false },
      (error, address, family) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof address !== "string" || family === undefined) {
          reject(new Error("Unexpected lookup response."));
          return;
        }
        resolve({ address, family });
      },
    );
  });
}

describe("connection-time destination lookup", () => {
  it("validates every answer before selecting one", async () => {
    const lookup = createSafeConnectionLookup(async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]);
    await expect(runLookup(lookup)).rejects.toMatchObject({ code: "EACCES" });
  });

  it("re-resolves and rejects a rebinding result", async () => {
    let calls = 0;
    const lookup = createSafeConnectionLookup(async () => {
      calls += 1;
      return calls === 1
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "169.254.169.254", family: 4 }];
    });
    await expect(runLookup(lookup)).resolves.toEqual({
      address: "93.184.216.34",
      family: 4,
    });
    await expect(runLookup(lookup)).rejects.toMatchObject({ code: "EACCES" });
  });
});
