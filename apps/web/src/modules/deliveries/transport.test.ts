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
  it("does not follow redirects or read destination bodies and bounds Retry-After", async () => {
    const outgoing = Object.assign(new EventEmitter(), {
      end: vi.fn(),
      destroy: vi.fn(),
    });
    const response = Object.assign(new EventEmitter(), {
      statusCode: 302,
      headers: {
        location: "http://127.0.0.1/",
        "retry-after": "9".repeat(10000),
      },
      destroy: vi.fn(),
    });
    const request = vi
      .spyOn(https, "request")
      .mockImplementation((...args: unknown[]) => {
        const callback = args.at(-1) as (response: unknown) => void;
        queueMicrotask(() => callback(response));
        return outgoing as unknown as ReturnType<typeof https.request>;
      });
    const result = await sendWebhook({
      url: "https://example.com",
      body: "{}",
      headers: { "content-length": "999", "content-type": "text/plain" },
    });
    expect(result.httpStatus).toBe(302);
    expect(result.retryAfter).toHaveLength(128);
    expect(request).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(response.listenerCount("data")).toBe(0);
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: { "content-length": 2, "content-type": "application/json" },
    });
  });
});
