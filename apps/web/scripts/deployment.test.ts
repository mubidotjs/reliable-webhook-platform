import { describe, expect, it, vi } from "vitest";
import { buildForVercel } from "./deployment";

describe("Vercel deployment", () => {
  it.each(["preview", "development", undefined])(
    "does not migrate in %s",
    async (environment) => {
      const run = vi.fn();
      const preflight = vi.fn();
      await buildForVercel(environment, run, preflight);
      expect(run.mock.calls.flat()).toEqual(["db:generate", "build"]);
      expect(preflight).not.toHaveBeenCalled();
    },
  );
  it("checks and migrates before production build", async () => {
    const calls: string[] = [];
    await buildForVercel(
      "production",
      (script) => {
        calls.push(script);
      },
      async () => {
        calls.push("check");
      },
    );
    expect(calls).toEqual([
      "db:generate",
      "check",
      "db:deploy",
      "check",
      "build",
    ]);
  });
  it.each(["db:generate", "db:deploy"])(
    "stops on %s failure",
    async (failure) => {
      const run = vi.fn((script: string) => {
        if (script === failure) throw new Error("failed");
      });
      await expect(
        buildForVercel("production", run, async () => {}),
      ).rejects.toThrow("failed");
      expect(run).not.toHaveBeenCalledWith("build");
    },
  );
  it("stops on preflight failure", async () => {
    const run = vi.fn();
    await expect(
      buildForVercel("production", run, async () => {
        throw new Error("drift");
      }),
    ).rejects.toThrow("drift");
    expect(run.mock.calls.flat()).toEqual(["db:generate"]);
  });
});
