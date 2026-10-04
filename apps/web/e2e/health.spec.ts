import { expect, test } from "@playwright/test";
test("exposes process and database health without configuration details", async ({
  request,
}) => {
  const live = await request.get("/api/health/live");
  expect(live.status()).toBe(200);
  expect(await live.json()).toEqual({
    service: "reliable-webhook-platform",
    status: "ok",
  });
  const ready = await request.get("/api/health/ready");
  expect(ready.status()).toBe(200);
  expect(ready.headers()["cache-control"]).toBe("no-store");
  expect(await ready.json()).toEqual({
    service: "reliable-webhook-platform",
    status: "ready",
  });
});
