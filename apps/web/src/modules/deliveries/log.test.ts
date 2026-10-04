import { afterEach, expect, it, vi } from "vitest";
import { deliveryLog, type DeliveryLog } from "./log";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("allowlists metadata and never serializes arbitrary secrets or nested payloads", () => {
  vi.stubEnv("LOG_LEVEL", "info");
  const sink = vi.spyOn(console, "info").mockImplementation(() => {});
  deliveryLog("attempt.failed", {
    deliveryId: "delivery",
    reason: "TIMEOUT",
    authorization: "Bearer secret",
    encryptedSecret: "ciphertext",
    payload: { cookie: "secret" },
  } as DeliveryLog);
  const value = JSON.parse(String(sink.mock.calls[0]?.[0]));
  expect(value).toMatchObject({
    event: "attempt.failed",
    deliveryId: "delivery",
    level: "warn",
  });
  expect(JSON.stringify(value)).not.toMatch(
    /secret|ciphertext|authorization|payload/,
  );
});
it("honors the configured log threshold", () => {
  vi.stubEnv("LOG_LEVEL", "error");
  const sink = vi.spyOn(console, "info").mockImplementation(() => {});
  deliveryLog("delivery.created", {});
  expect(sink).not.toHaveBeenCalled();
});
