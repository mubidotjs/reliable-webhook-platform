import https from "node:https";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendWebhook } from "./transport";
describe("outbound transport", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  it("rejects unsafe destinations before I/O", async () => {
    const request = vi.spyOn(https, "request");
    expect(
      await sendWebhook({ url: "https://127.0.0.1", body: "{}", headers: {} }),
    ).toMatchObject({ errorClass: "DESTINATION_POLICY" });
    expect(request).not.toHaveBeenCalled();
  });
  it("aborts after exactly five seconds even without socket activity", async () => {
    vi.useFakeTimers();
    const outgoing = Object.assign(new EventEmitter(), {
      end: vi.fn(),
      destroy: vi.fn(),
    });
    vi.spyOn(https, "request").mockReturnValue(
      outgoing as unknown as ReturnType<typeof https.request>,
    );
    const pending = sendWebhook({
      url: "https://example.com",
      body: "{}",
      headers: {},
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(outgoing.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({
      errorClass: "TIMEOUT",
      httpStatus: null,
    });
    expect(outgoing.destroy).toHaveBeenCalledOnce();
  });
});
