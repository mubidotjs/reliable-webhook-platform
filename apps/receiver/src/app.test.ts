import { afterEach, describe, expect, it } from "vitest";

import { buildReceiver } from "./app";

const receivers: ReturnType<typeof buildReceiver>[] = [];

afterEach(async () => {
  await Promise.all(receivers.splice(0).map((receiver) => receiver.close()));
});

describe("failure-injection receiver", () => {
  it("accepts a successful delivery", async () => {
    const receiver = buildReceiver();
    receivers.push(receiver);
    const response = await receiver.inject({
      method: "POST",
      url: "/receive/success",
      headers: { "webhook-id": "evt_123" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accepted: true,
      webhookId: "evt_123",
    });
  });

  it("advances through a deterministic status sequence", async () => {
    const receiver = buildReceiver();
    receivers.push(receiver);
    const first = await receiver.inject({
      method: "POST",
      url: "/receive/sequence/demo?statuses=503,200",
    });
    const second = await receiver.inject({
      method: "POST",
      url: "/receive/sequence/demo?statuses=503,200",
    });

    expect(first.statusCode).toBe(503);
    expect(second.statusCode).toBe(200);
  });
});
