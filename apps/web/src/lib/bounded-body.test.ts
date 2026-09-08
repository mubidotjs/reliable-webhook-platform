import { describe, expect, it } from "vitest";
import { readBoundedBody } from "./bounded-body";
describe("bounded request body", () => {
  it("preserves UTF-8 bytes and rejects chunked oversize bodies", async () => {
    expect(
      await readBoundedBody(
        new Request("https://example.test", {
          method: "POST",
          body: '{"x":"é"}',
        }),
      ),
    ).toBe('{"x":"é"}');
    await expect(
      readBoundedBody(
        new Request("https://example.test", { method: "POST", body: "12345" }),
        4,
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
});
