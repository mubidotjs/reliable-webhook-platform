import { describe, expect, it } from "vitest";
import { retryDecision, RETRY_WINDOW_MS } from "./retry-policy";
const now = new Date("2026-09-08T00:00:00Z");
const decide = (
  httpStatus: number | null,
  errorClass: string | null = null,
  count = 1,
  retryAfter?: string,
) =>
  retryDecision({
    result: { httpStatus, errorClass, durationMs: 1, retryAfter },
    attemptCount: count,
    now,
    deadline: new Date(+now + RETRY_WINDOW_MS),
    random: () => 0,
  });
describe("durable retry policy", () => {
  it("classifies success and terminal HTTP responses", () => {
    for (const status of [200, 201, 204, 299])
      expect(decide(status).status).toBe("SUCCEEDED");
    for (const status of [301, 400, 401, 403, 404, 410, 501, 505])
      expect(decide(status).status).toBe("EXHAUSTED");
  });
  it("retries transient failures and stops after five attempts", () => {
    for (const status of [408, 425, 429, 500, 502, 503, 504])
      expect(decide(status).status).toBe("RETRY_SCHEDULED");
    for (const failure of [
      "NETWORK",
      "TIMEOUT",
      "UNCERTAIN",
      "KEY_UNAVAILABLE",
    ])
      expect(decide(null, failure).status).toBe("RETRY_SCHEDULED");
    expect(decide(500, null, 5).reason).toBe("ATTEMPT_LIMIT");
  });
  it("persists bounded jitter and respects capped Retry-After", () => {
    expect(+decide(500).nextAttemptAt! - +now).toBe(15_000);
    expect(+decide(500, null, 2).nextAttemptAt! - +now).toBe(30_000);
    expect(+decide(429, null, 1, "120").nextAttemptAt! - +now).toBe(120_000);
    expect(+decide(503, null, 1, "999999").nextAttemptAt! - +now).toBe(
      3_600_000,
    );
    expect(
      +decide(429, null, 1, new Date(+now + 60_000).toUTCString())
        .nextAttemptAt! - +now,
    ).toBe(60_000);
    expect(+decide(429, null, 1, "invalid").nextAttemptAt! - +now).toBe(15_000);
  });
  it("does not schedule at or beyond the deadline", () => {
    expect(
      retryDecision({
        result: { httpStatus: 500, errorClass: null, durationMs: 0 },
        now,
        deadline: new Date(+now + 15_000),
        attemptCount: 1,
        random: () => 0,
      }).reason,
    ).toBe("RETRY_WINDOW_EXPIRED");
  });
});
