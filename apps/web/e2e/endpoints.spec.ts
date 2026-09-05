import { expect, test } from "@playwright/test";

const origin = "http://127.0.0.1:3101";
const correlationId = "123e4567-e89b-42d3-a456-426614174000";

function primaryHeaders(mutating = false): Record<string, string> {
  const cookie = process.env.E2E_PRIMARY_COOKIE;
  if (!cookie) throw new Error("Primary E2E session was not initialized.");
  return { cookie, ...(mutating ? { origin } : {}) };
}

function outsiderHeaders(): Record<string, string> {
  const cookie = process.env.E2E_OUTSIDER_COOKIE;
  if (!cookie) throw new Error("Outsider E2E session was not initialized.");
  return { cookie };
}

test.describe.serial("M1 endpoint API", () => {
  test("requires authentication and a trusted mutation origin", async ({
    request,
  }) => {
    const unauthenticated = await request.get("/v1/endpoints");
    expect(unauthenticated.status()).toBe(401);
    expect(unauthenticated.headers()["content-type"]).toContain(
      "application/problem+json",
    );

    const forbiddenOrigin = await request.post("/v1/endpoints", {
      headers: primaryHeaders(),
      data: { url: "https://example.com/hooks" },
    });
    expect(forbiddenOrigin.status()).toBe(403);
    await expect(forbiddenOrigin.json()).resolves.toMatchObject({
      code: "FORBIDDEN_ORIGIN",
    });
  });

  test("creates, reads, updates, rotates, isolates, and disables", async ({
    request,
  }) => {
    const createdResponse = await request.post("/v1/endpoints", {
      headers: { ...primaryHeaders(true), "x-correlation-id": correlationId },
      data: {
        url: "https://EXAMPLE.com:443/hooks?token=synthetic",
        timeoutMs: 4_000,
      },
    });
    expect(createdResponse.status()).toBe(201);
    expect(createdResponse.headers()["cache-control"]).toBe("no-store");
    expect(createdResponse.headers()["x-correlation-id"]).toBe(correlationId);
    const created = (await createdResponse.json()) as {
      data: { id: string; url: string; secretVersion: number; status: string };
      signingSecret: string;
    };
    expect(created.signingSecret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(created.data).toMatchObject({
      url: "https://example.com/hooks?token=synthetic",
      secretVersion: 1,
      status: "ENABLED",
    });

    const read = await request.get(`/v1/endpoints/${created.data.id}`, {
      headers: primaryHeaders(),
    });
    expect(read.status()).toBe(200);
    expect(await read.text()).not.toContain(created.signingSecret);

    const outsiderRead = await request.get(`/v1/endpoints/${created.data.id}`, {
      headers: outsiderHeaders(),
    });
    expect(outsiderRead.status()).toBe(404);

    const updated = await request.patch(`/v1/endpoints/${created.data.id}`, {
      headers: primaryHeaders(true),
      data: { timeoutMs: 7_000 },
    });
    expect(updated.status()).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      data: { timeoutMs: 7_000 },
    });

    const rotated = await request.post(
      `/v1/endpoints/${created.data.id}/rotate-secret`,
      { headers: primaryHeaders(true) },
    );
    expect(rotated.status()).toBe(201);
    const rotation = (await rotated.json()) as {
      data: { signingSecret: string; secretVersion: number };
    };
    expect(rotation.data.secretVersion).toBe(2);
    expect(rotation.data.signingSecret).not.toBe(created.signingSecret);

    const disabled = await request.patch(`/v1/endpoints/${created.data.id}`, {
      headers: primaryHeaders(true),
      data: { status: "DISABLED" },
    });
    expect(disabled.status()).toBe(200);
    const disabledAgain = await request.patch(
      `/v1/endpoints/${created.data.id}`,
      { headers: primaryHeaders(true), data: { status: "DISABLED" } },
    );
    expect(disabledAgain.status()).toBe(200);
    const editDisabled = await request.patch(
      `/v1/endpoints/${created.data.id}`,
      { headers: primaryHeaders(true), data: { timeoutMs: 8_000 } },
    );
    expect(editDisabled.status()).toBe(409);
  });

  test("rejects unsafe destinations and malformed bodies", async ({
    request,
  }) => {
    const unsafe = await request.post("/v1/endpoints", {
      headers: primaryHeaders(true),
      data: { url: "https://169.254.169.254/latest/meta-data" },
    });
    expect(unsafe.status()).toBe(422);
    await expect(unsafe.json()).resolves.toMatchObject({
      code: "DESTINATION_URL_REJECTED",
    });

    const malformed = await request.post("/v1/endpoints", {
      headers: {
        ...primaryHeaders(true),
        "content-type": "application/json",
      },
      data: Buffer.from("{not-json", "utf8"),
    });
    expect(malformed.status()).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      code: "MALFORMED_JSON",
    });
  });

  test("paginates and fails closed at five enabled endpoints", async ({
    request,
  }) => {
    for (let index = 0; index < 5; index += 1) {
      const response = await request.post("/v1/endpoints", {
        headers: primaryHeaders(true),
        data: { url: `https://example.com/m1/${index}` },
      });
      expect(response.status()).toBe(201);
    }
    const limited = await request.post("/v1/endpoints", {
      headers: primaryHeaders(true),
      data: { url: "https://example.com/m1/limited" },
    });
    expect(limited.status()).toBe(409);
    await expect(limited.json()).resolves.toMatchObject({
      code: "ENDPOINT_LIMIT_REACHED",
    });

    const first = await request.get("/v1/endpoints?limit=2", {
      headers: primaryHeaders(),
    });
    const firstPage = (await first.json()) as {
      data: Array<{ id: string }>;
      page: { nextCursor: string };
    };
    expect(firstPage.data).toHaveLength(2);
    const second = await request.get(
      `/v1/endpoints?limit=2&cursor=${encodeURIComponent(firstPage.page.nextCursor)}`,
      { headers: primaryHeaders() },
    );
    const secondPage = (await second.json()) as { data: Array<{ id: string }> };
    expect(secondPage.data).toHaveLength(2);
    expect(
      new Set([...firstPage.data, ...secondPage.data].map(({ id }) => id)).size,
    ).toBe(4);
  });
});
