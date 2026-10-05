import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";

const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const states = [
  "PENDING",
  "PROCESSING",
  "RETRY_SCHEDULED",
  "SUCCEEDED",
  "EXHAUSTED",
  "CANCELLED",
] as const;
const labels = [
  "Pending",
  "Processing",
  "Retry scheduled",
  "Succeeded",
  "Exhausted",
  "Cancelled",
];
const ids: Partial<Record<(typeof states)[number], string>> = {};
let endpointId = "";
let eventRecordId = "";
const payload = {
  message: "<script>window.payloadExecuted=true</script>",
  nested: { text: "long-value-".repeat(150) },
};

test.describe("UI refresh", () => {
  test.setTimeout(60_000);
  test.beforeAll(async ({ request }) => {
    const headers = {
      cookie: process.env.E2E_REFRESH_COOKIE!,
      origin: "http://127.0.0.1:3101",
    };
    const endpointResponse = await request.post("/v1/endpoints", {
      headers,
      data: {
        name: "Billing receiver",
        url: "https://example.com/webhooks/billing",
      },
    });
    expect(endpointResponse.status()).toBe(201);
    endpointId = (await endpointResponse.json()).data.id;
    // Persisted, isolated presentation fixtures; the application has no synthetic-data branch.
    for (const [index, status] of [
      ...states,
      "SUCCEEDED",
      "SUCCEEDED",
    ].entries()) {
      const accepted = await request.post("/api/events", {
        headers,
        data: {
          endpointId,
          eventId: randomUUID(),
          type: "refresh." + status.toLowerCase() + "." + index,
          payload,
        },
      });
      expect(accepted.status()).toBe(202);
      const id = (await accepted.json()).data.deliveryId as string;
      const delivery = await database.delivery.findUniqueOrThrow({
        where: { id },
      });
      if (status === "SUCCEEDED") eventRecordId = delivery.eventId;
      ids[status as (typeof states)[number]] ??= id;
      const startedAt = new Date(Date.now() - 60_000);
      const count =
        status === "PENDING" || status === "CANCELLED"
          ? 0
          : status === "SUCCEEDED"
            ? 3
            : status === "EXHAUSTED"
              ? 5
              : 1;
      for (let sequence = 1; sequence <= count; sequence++) {
        const final = sequence === count;
        const success = status === "SUCCEEDED" && final;
        const uncertain = status === "EXHAUSTED" && final;
        await database.deliveryAttempt.create({
          data: {
            deliveryId: id,
            sequence,
            requestTimestamp: startedAt,
            startedAt: new Date(startedAt.getTime() + sequence * 6000),
            destinationUrl: delivery.destinationUrl,
            ...(status === "PROCESSING"
              ? {}
              : {
                  outcome: {
                    create: {
                      status: success
                        ? "SUCCEEDED"
                        : uncertain
                          ? "UNCERTAIN"
                          : "FAILED",
                      completedAt: new Date(
                        startedAt.getTime() +
                          sequence * 6000 +
                          (status === "RETRY_SCHEDULED" ? 5000 : 128),
                      ),
                      httpStatus: success
                        ? 200
                        : uncertain || status === "RETRY_SCHEDULED"
                          ? null
                          : 500,
                      durationMs: uncertain
                        ? null
                        : status === "RETRY_SCHEDULED"
                          ? 5000
                          : 128,
                      errorClass: uncertain
                        ? "UNCERTAIN"
                        : status === "RETRY_SCHEDULED"
                          ? "TIMEOUT"
                          : null,
                      responseMetadata: {},
                      resultingState: final
                        ? (status as (typeof states)[number])
                        : "RETRY_SCHEDULED",
                    },
                  },
                }),
          },
        });
      }
      await database.delivery.update({
        where: { id },
        data: {
          status: status as (typeof states)[number],
          attemptCount: count,
          nextAttemptAt:
            status === "RETRY_SCHEDULED"
              ? new Date(Date.now() + 600_000)
              : null,
          terminalAt: ["SUCCEEDED", "EXHAUSTED", "CANCELLED"].includes(status)
            ? new Date()
            : null,
          exhaustedReason:
            status === "EXHAUSTED" ? "RETRY_WINDOW_EXPIRED" : null,
          lastError: status === "CANCELLED" ? "ENDPOINT_DISABLED" : null,
        },
      });
    }
  });
  test.beforeEach(async ({ context }) => {
    const cookie = process.env.E2E_REFRESH_COOKIE!;
    const split = cookie.indexOf("=");
    await context.addCookies([
      {
        name: cookie.slice(0, split),
        value: cookie.slice(split + 1),
        url: "http://127.0.0.1:3101",
      },
    ]);
  });
  test.afterAll(async () => {
    await database.$disconnect();
  });

  test("keeps status scanning dense and contains overflow at every target width", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard/deliveries");
    await expect(page.getByRole("row")).toHaveCount(9);
    const sixth = await page.getByRole("row").nth(6).boundingBox();
    expect(sixth!.y + sixth!.height).toBeLessThan(900);
    for (const label of labels)
      await expect(
        page.getByRole("table").getByText(label, { exact: true }).first(),
      ).toBeVisible();
    await page.screenshot({
      path: "test-results/refresh-history-desktop.png",
      fullPage: true,
    });
    for (const width of [320, 390, 768, 1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({
        path: "test-results/refresh-history-" + width + ".png",
        fullPage: true,
      });
      const geometry = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        outside: [...document.querySelectorAll("body *")]
          .filter(
            (el) =>
              el.getBoundingClientRect().right > innerWidth &&
              !el.closest(".table-region"),
          )
          .map((el) => ({
            tag: el.tagName,
            classes: el.className,
            right: el.getBoundingClientRect().right,
          }))
          .slice(0, 20),
      }));
      expect(
        geometry.scrollWidth,
        JSON.stringify(geometry),
      ).toBeLessThanOrEqual(width);
      const nav = page.getByRole("navigation", { name: "Workspace" });
      for (const label of [
        "Overview",
        "Deliveries",
        "Endpoints",
        "Events",
        "Setup guide",
      ])
        await expect(
          nav.getByRole("link", { name: label, exact: true }),
        ).toBeVisible();
      if (width >= 1280)
        expect(
          await page
            .getByRole("region", { name: "Delivery records" })
            .evaluate((el) => el.scrollWidth <= el.clientWidth),
        ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/refresh-history-mobile.png",
      fullPage: true,
    });
  });

  test("preserves filter limits and exact date boundaries through refresh and removal", async ({
    page,
  }) => {
    const from = "2020-01-01T12:34:56.000Z";
    await page.goto(
      "/dashboard/deliveries?" +
        new URLSearchParams({ limit: "2", endpointId, from }),
    );
    await expect(page.getByLabel("Endpoint", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page).toHaveURL(/limit=2/);
    expect(new URL(page.url()).searchParams.get("from")).toBe(from);
    await page
      .getByRole("link", { name: "Remove From filter", exact: true })
      .click();
    await expect(page).not.toHaveURL(/from=/);
    expect(new URL(page.url()).searchParams.get("endpointId")).toBe(endpointId);
    expect(new URL(page.url()).searchParams.get("limit")).toBe("2");
    await page.getByText("More filters", { exact: true }).click();
    await expect(
      page.getByLabel("Endpoint", { exact: true }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Refresh", exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByLabel("Endpoint", { exact: true }),
    ).not.toBeVisible();
  });

  test("presents every persisted outcome before payload with accessible replay", async ({
    page,
  }) => {
    for (const [index, status] of states.entries()) {
      await page.goto("/dashboard/deliveries/" + ids[status]);
      await expect(
        page
          .getByRole("region", { name: "Delivery outcome" })
          .getByText(labels[index]!, { exact: true }),
      ).toBeVisible();
      const attempt = await page
        .getByRole("heading", { name: "Attempt history", exact: true })
        .boundingBox();
      const payloadHeading = await page
        .getByRole("heading", { name: "Event payload", exact: true })
        .boundingBox();
      expect(attempt!.y).toBeLessThan(payloadHeading!.y);
      await expect(
        page.getByRole("button", { name: "Replay delivery", exact: true }),
      ).toBeEnabled({
        enabled: ["SUCCEEDED", "EXHAUSTED", "CANCELLED"].includes(status),
      });
      await page.screenshot({
        path: "test-results/refresh-" + status.toLowerCase() + ".png",
        fullPage: true,
      });
    }
    await page.goto("/dashboard/deliveries/" + ids.EXHAUSTED);
    await expect(
      page.getByText("The worker stopped before saving", { exact: false }),
    ).toBeVisible();
    const replay = page.getByRole("button", {
      name: "Replay delivery",
      exact: true,
    });
    await replay.click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Confirm replay", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page
      .getByRole("link", { name: "Back to deliveries" })
      .evaluate((el) => (el as HTMLElement).focus());
    await expect(
      dialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await page.screenshot({ path: "test-results/refresh-replay-dialog.png" });
    await page.keyboard.press("Escape");
    await expect(replay).toBeFocused();
    for (const width of [320, 390, 768, 1024, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "test-results/refresh-detail-mobile.png",
      fullPage: true,
    });
  });

  test("copies exact event bytes, keeps payload inert, and handles clipboard failure", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const record = await database.webhookEvent.findUniqueOrThrow({
      where: { id: eventRecordId },
    });
    await page.goto("/dashboard/events/" + eventRecordId);
    await page
      .getByRole("button", { name: "Copy Exact delivery body", exact: true })
      .click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      record.deliveryBody,
    );
    const code = page.getByLabel("Exact delivery body", { exact: true });
    await expect(code).toHaveText(record.deliveryBody);
    await page.getByRole("button", { name: "Wrap lines", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Wrap lines", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      await page.evaluate(() =>
        Object.prototype.hasOwnProperty.call(window, "payloadExecuted"),
      ),
    ).toBe(false);
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        configurable: true,
        value: () => Promise.reject(new Error("denied")),
      });
    });
    await page
      .getByRole("button", { name: "Copy Exact delivery body", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Clipboard unavailable" }),
    ).toBeVisible();
  });

  test("keeps overview, supporting routes and reduced-motion layouts usable", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [path, label] of [
      ["/dashboard", "overview"],
      ["/dashboard/endpoints", "endpoints"],
      ["/dashboard/events", "events"],
      ["/dashboard/guide", "guide"],
    ]) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path!);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.screenshot({
        path: "test-results/refresh-" + label + ".png",
        fullPage: true,
      });
      await page.setViewportSize({ width: 320, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto("/dashboard/deliveries?search=missing");
    await expect(
      page.getByText("No deliveries match these filters.", { exact: false }),
    ).toBeVisible();
    await page.goto("/dashboard/deliveries?cursor=invalid");
    await expect(
      page.getByRole("alert").filter({ hasText: "cursor is invalid" }),
    ).toContainText("cursor is invalid");
    await page.goto("/dashboard/deliveries/not-a-record");
    await expect(
      page.getByRole("heading", { name: "Record not found" }),
    ).toBeVisible();
  });
});

test("public entry points show factual content and preserve keyboard access", async ({
  page,
}) => {
  for (const path of ["/", "/sign-in"]) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Illustrative sample")).toHaveCount(0);
    await page.screenshot({
      path:
        "test-results/refresh-" + (path === "/" ? "public" : "signin") + ".png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
