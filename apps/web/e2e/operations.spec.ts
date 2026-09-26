import { Client } from "pg";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
const run = promisify(execFile);
type Demo = {
  id: string;
  status: string;
  type: string;
  eventId: string;
  endpointId: string;
};
let demos: Demo[] = [];
async function fixture(operation: string, id: string) {
  const result = await run(
    process.execPath,
    ["--import", "tsx", "scripts/m3-demo.ts", operation, id],
    {
      cwd: resolve("apps/web"),
      env: {
        ...process.env,
        NODE_ENV: "test",
        ENCRYPTION_KEY_VERSION: "v1",
        ENCRYPTION_KEY_V1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      },
      windowsHide: true,
      timeout: 30000,
    },
  );
  const line = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith("M3_RESULT="));
  if (!line) throw new Error("Fixture returned no result");
  return JSON.parse(line.slice(10));
}
test.describe.serial("M3 operations walkthrough", () => {
  test.beforeAll(async () => {
    demos = await fixture("seed", process.env.E2E_M3_USER_ID!);
  });
  test.beforeEach(async ({ context }) => {
    const cookie = process.env.E2E_M3_COOKIE!;
    const split = cookie.indexOf("=");
    await context.addCookies([
      {
        name: cookie.slice(0, split),
        value: cookie.slice(split + 1),
        url: "http://127.0.0.1:3101",
      },
    ]);
  });
  test("shows a stable loading state while history is pending", async ({
    page,
  }) => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await page.goto("/dashboard/guide");
      await client.query("BEGIN");
      await client.query("LOCK TABLE deliveries IN ACCESS EXCLUSIVE MODE");
      const navigation = page.goto("/dashboard/deliveries", {
        waitUntil: "commit",
      });
      await expect(
        page.getByRole("status", { name: "Loading deliveries" }),
      ).toBeVisible();
      await client.query("ROLLBACK");
      await navigation;
      await expect(page.getByRole("table")).toBeVisible();
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
  test("filters, searches, paginates and restores the history URL", async ({
    page,
  }) => {
    await page.goto("/dashboard/deliveries?limit=2");
    await expect(page.getByRole("table")).toBeVisible();
    await page.screenshot({
      path: "test-results/m3-history-desktop.png",
      fullPage: true,
    });
    await expect(page.getByRole("row")).toHaveCount(3);
    await page.getByRole("link", { name: "Older records" }).click();
    await expect(page.getByRole("row")).toHaveCount(2);
    await page.getByRole("link", { name: "Newest records" }).click();
    await expect(page).toHaveURL(/\/dashboard\/deliveries\?limit=2$/);
    await expect(page.getByRole("row")).toHaveCount(3);
    await page.getByLabel("Status", { exact: true }).selectOption("EXHAUSTED");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/status=EXHAUSTED/);
    await expect(page.getByRole("row")).toHaveCount(2);
    await page
      .getByRole("link", { name: "demo.m3.exhausted", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Attempt #5" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Back to deliveries" }).click();
    await expect(page).toHaveURL(/status=EXHAUSTED/);
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/dashboard\/deliveries$/);
    await expect(page.getByRole("row")).toHaveCount(4);
    await page
      .getByLabel("Endpoint", { exact: true })
      .fill(demos[0]!.endpointId);
    await page
      .getByLabel("Event type", { exact: true })
      .fill("demo.m3.timeout");
    const day = new Date(Date.now() - 3_600_000).toISOString().slice(0, 10);
    await page.getByLabel("From date (UTC)").fill(day);
    await page.getByLabel("Through date (UTC)").fill(day);
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.getByRole("row")).toHaveCount(2);
    await page.getByRole("link", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/\/dashboard\/deliveries$/);
    await expect(page.getByRole("row")).toHaveCount(4);
    for (const search of [demos[0]!.id, demos[0]!.eventId]) {
      await page.getByLabel("Delivery or event ID").fill(search);
      await page.getByRole("button", { name: "Apply filters" }).click();
      await expect(page).toHaveURL(new RegExp("search=" + search));
      await expect(page.getByRole("row")).toHaveCount(2);
    }
    await page.getByLabel("Delivery or event ID").fill("missing-delivery");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      page.getByText("No deliveries match these filters.", { exact: false }),
    ).toBeVisible();
    await page.goto("/dashboard/deliveries?from=invalid");
    await expect(
      page.getByRole("alert").filter({ hasText: "Invalid filters" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Reset filters" }).click();
    await expect(page.getByRole("table")).toBeVisible();
  });
  test("inspects failures, cancels replay, confirms once and observes successful new delivery", async ({
    page,
    request,
  }) => {
    const source = demos.find((d) => d.type === "exhausted")!;
    const headers = { cookie: process.env.E2E_M3_COOKIE! };
    const original = await (
      await request.get("/api/deliveries/" + source.id, { headers })
    ).json();
    await page.goto("/dashboard/deliveries?status=EXHAUSTED");
    await page
      .getByRole("link", { name: "demo.m3.exhausted", exact: true })
      .click();
    await expect(
      page.getByText("Destination did not respond within 5 seconds", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Maximum retry policy reached")).toBeVisible();
    await expect(page.getByLabel("Event JSON payload")).toContainText(
      "<script>",
    );
    expect(
      await page.evaluate(() =>
        Object.prototype.hasOwnProperty.call(window, "payloadExecuted"),
      ),
    ).toBe(false);
    await page
      .getByRole("button", { name: "Replay delivery", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    const before = await (
      await request.get("/api/deliveries", { headers })
    ).json();
    expect(before.data).toHaveLength(3);
    await page
      .getByRole("button", { name: "Replay delivery", exact: true })
      .click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page
      .getByRole("button", { name: "Replay delivery", exact: true })
      .click();
    const keys: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      "**/api/deliveries/" + source.id + "/replay",
      async (route) => {
        keys.push(route.request().headers()["idempotency-key"]!);
        if (keys.length === 1) {
          await route.fetch();
          await held;
          await route.abort("failed");
        } else await route.continue();
      },
    );
    await page
      .getByRole("button", { name: "Confirm replay", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Creating replay…" }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Creating replay…" })
      .evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
    release();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "response was not received",
    );
    await page
      .getByRole("button", { name: "Confirm replay", exact: true })
      .click();

    await expect(page).not.toHaveURL(new RegExp(source.id));
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    await expect(page.getByText("Replayed from delivery")).toBeVisible();
    await expect(page.getByText("Updates every 3 seconds")).toBeVisible();
    await fixture("succeed", id);
    await expect(
      page.getByText("HTTP delivery succeeded.", { exact: false }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Updates every 3 seconds")).toHaveCount(0);
    expect(
      await (
        await request.get("/api/deliveries/" + source.id, { headers })
      ).json(),
    ).toEqual(original);
    await page.screenshot({
      path: "test-results/m3-replay-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/m3-replay-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test("deduplicates API retries and rejects foreign access and invalid input", async ({
    request,
  }) => {
    const source = demos.find((d) => d.type === "retry")!;
    const headers = {
      cookie: process.env.E2E_M3_COOKIE!,
      origin: "http://127.0.0.1:3101",
      "idempotency-key": randomUUID(),
    };
    const detail = await (
      await request.get("/api/deliveries/" + source.id, { headers })
    ).json();
    const results = await Promise.all(
      [1, 2].map(() =>
        request.post("/api/deliveries/" + source.id + "/replay", {
          headers,
          data: { endpointRevision: detail.data.replay.endpointRevision },
        }),
      ),
    );
    expect(results.map((r) => r.status())).toEqual([202, 202]);
    expect(await results[0]!.json()).toEqual(await results[1]!.json());
    const outsider = {
      cookie: process.env.E2E_OUTSIDER_COOKIE!,
      origin: headers.origin,
      "idempotency-key": randomUUID(),
    };
    expect(
      (
        await request.get("/api/deliveries/" + source.id, { headers: outsider })
      ).status(),
    ).toBe(404);
    expect(
      (
        await request.post("/api/deliveries/" + source.id + "/replay", {
          headers: outsider,
          data: { endpointRevision: detail.data.replay.endpointRevision },
        })
      ).status(),
    ).toBe(404);
    expect(
      (await request.get("/api/deliveries?limit=101", { headers })).status(),
    ).toBe(400);
  });
});
