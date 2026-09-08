import { expect, test } from "@playwright/test";

for (const pathname of ["/", "/sign-in"]) {
  test(`serves logo favicon metadata on ${pathname}`, async ({
    page,
    request,
  }) => {
    await page.goto(pathname);
    const svgIcon = page.locator('link[rel="icon"][type="image/svg+xml"]');
    await expect(svgIcon).toHaveCount(1);
    const href = await svgIcon.getAttribute("href");
    expect(href).toBeTruthy();
    const response = await request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(await response.text()).toContain('viewBox="0 0 32 32"');
    await expect(
      page.locator('link[rel="icon"][href^="/favicon.ico"]'),
    ).toHaveCount(1);
  });
}

test("serves a multi-size ICO fallback", async ({ request }) => {
  const response = await request.get("/favicon.ico");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(
    /image\/(?:x-icon|vnd.microsoft.icon)/,
  );
  const ico = await response.body();
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    expect(ico[entry]).toBe(size);
    expect(ico[entry + 1]).toBe(size);
    const offset = ico.readUInt32LE(entry + 12);
    expect(ico.readUInt32BE(offset + 16)).toBe(size);
    expect(ico.readUInt32BE(offset + 20)).toBe(size);
  }
});
