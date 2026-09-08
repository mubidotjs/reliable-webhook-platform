import { expect, test } from "@playwright/test";

for (const failure of ["server", "network"]) {
  test(`GitHub sign-in shows a safe error and supports retry after ${failure} failure`, async ({
    page,
  }) => {
    let attempts = 0;
    await page.route("**/api/auth/sign-in/social", async (route) => {
      attempts++;
      if (attempts === 1) {
        if (failure === "network") return route.abort("failed");
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ message: "sensitive database detail" }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ redirect: false, url: "/dashboard" }),
      });
    });
    await page.goto("/sign-in");
    const button = page.getByRole("button", { name: "Continue with GitHub" });
    await button.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Unable to sign in with GitHub" }),
    ).toHaveText("Unable to sign in with GitHub. Please try again.");
    await expect(page.getByText("sensitive database detail")).toHaveCount(0);
    await expect(button).toBeEnabled();
    await button.click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Unable to sign in with GitHub" }),
    ).toHaveCount(0);
    await expect(button).toBeEnabled();
    expect(attempts).toBe(2);
  });
}

test("GitHub OAuth initiation persists state and returns an authorization URL", async ({
  request,
}) => {
  const response = await request.post("/api/auth/sign-in/social", {
    headers: { origin: "http://127.0.0.1:3101" },
    data: { provider: "github", callbackURL: "/dashboard" },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  const destination = new URL(body.url);
  expect(destination.origin).toBe("https://github.com");
  expect(destination.pathname).toBe("/login/oauth/authorize");
  expect(destination.searchParams.get("state")).toBeTruthy();
});
