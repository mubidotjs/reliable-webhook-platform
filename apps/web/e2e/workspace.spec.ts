import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "../src/generated/prisma/client";
const database = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
let endpointId = "";
let deliveryId = "";
test.describe.serial("signed-in workspace", () => {
  test.beforeEach(async ({ context }) => {
    const cookie = process.env.E2E_UI_COOKIE!;
    const split = cookie.indexOf("=");
    await context.addCookies([
      {
        name: cookie.slice(0, split),
        value: cookie.slice(split + 1),
        url: "http://127.0.0.1:3101",
      },
    ]);
  });
  test.afterAll(async () => database.$disconnect());
  test("shows real empty states and persistent responsive navigation", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole("heading", { name: "Overview", exact: true }),
    ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Workspace" });
    for (const label of [
      "Overview",
      "Endpoints",
      "Events",
      "Deliveries",
      "Setup guide",
    ])
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await nav.getByRole("link", { name: "Events", exact: true }).click();
    await expect(page.getByText("You need an enabled endpoint")).toBeVisible();
    await page.screenshot({
      path: "test-results/workspace-mobile.png",
      fullPage: true,
    });
  });
  test("creates an endpoint, shows its secret once, and edits its URL", async ({
    page,
  }) => {
    await page.goto("/dashboard/endpoints");
    await page
      .getByLabel("Receiver URL")
      .fill("https://example.com/workspace-test");
    await page
      .getByRole("button", { name: "Create endpoint", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Save your signing secret" }),
    ).toBeVisible();
    const secret = await page.locator("code").innerText();
    expect(secret).toMatch(/^whsec_/);
    await page.getByRole("button", { name: "I saved the secret" }).click();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Open endpoint" }).click();
    await expect(page).toHaveURL(/\/dashboard\/endpoints\/[^/]+$/);
    endpointId = page.url().split("/").at(-1)!;
    await page.reload();
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);
    await page
      .getByLabel("Receiver URL")
      .fill("https://example.com/workspace-updated");
    await page.getByRole("button", { name: "Save URL" }).click();
    await expect(page.getByRole("status")).toContainText("updated");
  });
  test("preserves the event ID and payload after an uncertain submission", async ({
    page,
  }) => {
    await page.goto("/dashboard/events");
    await page.getByLabel("JSON payload").fill("{");
    await page.getByRole("button", { name: "Send event", exact: true }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "valid JSON" }),
    ).toContainText("valid JSON");
    await page.getByLabel("JSON payload").fill('{"synthetic":true}');
    let firstBody = "";
    await page.route("**/api/events", async (route) => {
      if (!firstBody) {
        firstBody = route.request().postData()!;
        await route.abort();
      } else {
        expect(route.request().postData()).toBe(firstBody);
        await route.continue();
      }
    });
    await page.getByRole("button", { name: "Send event", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Retry same event" }),
    ).toBeVisible();
    await expect(page.getByLabel("JSON payload")).toBeDisabled();
    await page.getByRole("button", { name: "Retry same event" }).click();
    await expect(page).toHaveURL(/\/dashboard\/deliveries\//);
    deliveryId = page.url().split("/").at(-1)!;
    await expect(
      page.getByRole("heading", { name: "Delivery details" }),
    ).toBeVisible();
    await expect(page.getByText("PENDING", { exact: true })).toBeVisible();
  });
  test("refreshes retry and success history and stops polling at terminal state", async ({
    page,
  }) => {
    const delivery = await database.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    await database.deliveryAttempt.create({
      data: {
        deliveryId,
        sequence: 1,
        requestTimestamp: new Date(),
        destinationUrl: delivery.destinationUrl,
        outcome: {
          create: {
            status: "FAILED",
            completedAt: new Date(),
            httpStatus: 500,
            durationMs: 12,
            responseMetadata: {},
            resultingState: "RETRY_SCHEDULED",
          },
        },
      },
    });
    await database.delivery.update({
      where: { id: deliveryId },
      data: {
        status: "RETRY_SCHEDULED",
        attemptCount: 1,
        nextAttemptAt: new Date(Date.now() + 30000),
      },
    });
    await page.goto(`/dashboard/deliveries/${deliveryId}`);
    await expect(page.getByText("500", { exact: true })).toBeVisible();
    await expect(page.getByText("Updates every 3 seconds")).toBeVisible();
    await database.deliveryAttempt.create({
      data: {
        deliveryId,
        sequence: 2,
        requestTimestamp: new Date(),
        destinationUrl: delivery.destinationUrl,
        outcome: {
          create: {
            status: "SUCCEEDED",
            completedAt: new Date(),
            httpStatus: 200,
            durationMs: 10,
            responseMetadata: {},
            resultingState: "SUCCEEDED",
          },
        },
      },
    });
    await database.delivery.update({
      where: { id: deliveryId },
      data: {
        status: "SUCCEEDED",
        attemptCount: 2,
        nextAttemptAt: null,
        terminalAt: new Date(),
      },
    });
    await expect(
      page.getByText("HTTP delivery succeeded.", { exact: false }),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("200", { exact: true })).toBeVisible();
    await expect(page.getByText("Updates every 3 seconds")).toHaveCount(0);
    await page.screenshot({
      path: "test-results/workspace-delivery.png",
      fullPage: true,
    });
  });
  test("renders uncertain attempts and terminal failure without claiming verification", async ({
    page,
  }) => {
    const delivery = await database.delivery.findUniqueOrThrow({
      where: { id: deliveryId },
    });
    await database.deliveryAttempt.create({
      data: {
        deliveryId,
        sequence: 3,
        requestTimestamp: new Date(),
        destinationUrl: delivery.destinationUrl,
        outcome: {
          create: {
            status: "UNCERTAIN",
            completedAt: new Date(),
            errorClass: "UNCERTAIN",
            responseMetadata: {},
            resultingState: "EXHAUSTED",
          },
        },
      },
    });
    await database.delivery.update({
      where: { id: deliveryId },
      data: {
        status: "EXHAUSTED",
        attemptCount: 3,
        lastError: "RETRY_WINDOW_EXPIRED",
      },
    });
    await page.goto(`/dashboard/deliveries/${deliveryId}`);
    await expect(
      page.getByText("The worker stopped before saving"),
    ).toBeVisible();
    await expect(
      page.getByText("RETRY_WINDOW_EXPIRED", { exact: true }),
    ).toBeVisible();
  });
  test("protects foreign records and handles secret rotation and disablement", async ({
    page,
    browser,
  }) => {
    const foreignContext = await browser.newContext({
      extraHTTPHeaders: { cookie: process.env.E2E_OUTSIDER_COOKIE! },
    });
    const outsider = await foreignContext.newPage();
    await outsider.goto(
      `http://127.0.0.1:3101/dashboard/deliveries/${deliveryId}`,
    );
    await expect(
      outsider.getByRole("heading", { name: "Record not found" }),
    ).toBeVisible();
    await foreignContext.close();
    await page.goto(`/dashboard/endpoints/${endpointId}`);
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Rotate secret" }).click();
    await expect(
      page.getByRole("heading", { name: "Save your signing secret" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "I saved the secret" }).click();
    await page.getByRole("button", { name: "Disable endpoint" }).click();
    await expect(page.getByText("DISABLED", { exact: true })).toBeVisible();
    await page.goto("/dashboard/guide");
    await expect(
      page.getByRole("heading", { name: "Add and verify a webhook" }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/workspace-guide.png",
      fullPage: true,
    });
  });
});
