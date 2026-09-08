export const MAX_ATTEMPTS = 5;
export const RETRY_WINDOW_MS = 86_400_000;
export const LEASE_MS = 30_000;
export const RECOVERY_GRACE_MS = 300_000;

export type SendResult = {
  httpStatus: number | null;
  errorClass: string | null;
  durationMs: number;
  retryAfter?: string | undefined;
};

export function retryDecision(input: {
  result: SendResult;
  attemptCount: number;
  now: Date;
  deadline: Date;
  random: () => number;
}): {
  status: "SUCCEEDED" | "RETRY_SCHEDULED" | "EXHAUSTED";
  nextAttemptAt: Date | null;
  reason: string | null;
} {
  const { result, attemptCount, now, deadline, random } = input;
  const code = result.httpStatus;
  if (code !== null && code >= 200 && code < 300 && !result.errorClass) {
    return { status: "SUCCEEDED", nextAttemptAt: null, reason: null };
  }
  const reason = result.errorClass ?? `HTTP_${code}`;
  const transient =
    ["NETWORK", "TIMEOUT", "UNCERTAIN", "KEY_UNAVAILABLE"].includes(reason) ||
    (code !== null &&
      ([408, 425, 429].includes(code) ||
        (code >= 500 && code <= 599 && ![501, 505].includes(code))));
  if (!transient || attemptCount >= MAX_ATTEMPTS || now >= deadline) {
    return {
      status: "EXHAUSTED",
      nextAttemptAt: null,
      reason: !transient
        ? reason
        : now >= deadline
          ? "RETRY_WINDOW_EXPIRED"
          : "ATTEMPT_LIMIT",
    };
  }
  const cap = Math.min(3_600_000, 30_000 * 2 ** (attemptCount - 1));
  let delay = Math.floor(
    cap / 2 + (Math.max(0, Math.min(1, random())) * cap) / 2,
  );
  if ((code === 429 || code === 503) && result.retryAfter) {
    const value = result.retryAfter.trim();
    const parsed = /^\d+$/.test(value)
      ? Number(value) * 1000
      : Date.parse(value) - now.getTime();
    if (Number.isFinite(parsed) && parsed >= 0)
      delay = Math.max(delay, Math.min(3_600_000, parsed));
  }
  const nextAttemptAt = new Date(now.getTime() + delay);
  return nextAttemptAt >= deadline
    ? {
        status: "EXHAUSTED",
        nextAttemptAt: null,
        reason: "RETRY_WINDOW_EXPIRED",
      }
    : { status: "RETRY_SCHEDULED", nextAttemptAt, reason };
}
