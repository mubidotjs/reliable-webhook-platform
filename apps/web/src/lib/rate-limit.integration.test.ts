import { consumeAuthLimit } from "./auth-rate-limit";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { enforceMutationLimit } from "./rate-limit";
import { problemResponse, type ApiError } from "./api-errors";
const owners: string[] = [];
async function fixture() {
  const id = randomUUID();
  owners.push(id);
  const user = await db.user.create({
    data: {
      id,
      name: "M4 rate",
      email: id + "@test.invalid",
      workspace: { create: { name: "M4" } },
    },
    include: { workspace: true },
  });
  return user.workspace!.id;
}
describe.runIf(Boolean(process.env.DATABASE_URL))(
  "durable burst limiting",
  () => {
    afterEach(async () => {
      vi.unstubAllEnvs();
      await db.user.deleteMany({ where: { id: { in: owners.splice(0) } } });
    });
    afterAll(async () => db.$disconnect());
    it("enforces an exact concurrent limit, isolates tenants and resets next minute", async () => {
      vi.stubEnv("MUTATION_REQUESTS_PER_MINUTE", "3");
      const workspace = await fixture();
      const other = await fixture();
      const now = new Date("2026-09-26T12:00:10Z");
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          enforceMutationLimit(workspace, db, now),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
      const failure = results.find((r) => r.status === "rejected");
      if (failure?.status !== "rejected")
        throw new Error("Expected limit rejection");
      expect(failure.reason).toMatchObject({
        status: 429,
        retryAfterSeconds: 50,
      });
      expect(
        problemResponse(failure.reason as ApiError, "test").headers.get(
          "retry-after",
        ),
      ).toBe("50");
      await enforceMutationLimit(other, db, now);
      await enforceMutationLimit(workspace, db, new Date(+now + 60000));
    });
    it("shares auth limits across concurrent callers and resets after inactivity", async () => {
      const key = randomUUID();
      const now = new Date();
      const rule = { window: 10, max: 2 };
      const results = await Promise.all(
        Array.from({ length: 6 }, () => consumeAuthLimit(key, rule, db, now)),
      );
      expect(results.filter((result) => result.allowed)).toHaveLength(2);
      expect(
        await consumeAuthLimit(key, rule, db, new Date(+now + 10000)),
      ).toEqual({ allowed: true, retryAfter: null });
    });
  },
);
