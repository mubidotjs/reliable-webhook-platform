import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  validate: vi.fn(),
}));
vi.mock("@rwp/config", () => ({ validateRuntimeEnvironment: mocks.validate }));
vi.mock("pg", () => ({
  default: {
    Client: class {
      connect = mocks.connect;
      query = mocks.query;
      end = mocks.end;
    },
  },
}));
import { readiness } from "./readiness";
import { GET } from "@/app/api/health/ready/route";
afterEach(() => vi.resetAllMocks());
it("uses a trivial query and closes the connection", async () => {
  mocks.end.mockResolvedValue(undefined);
  expect(await readiness({ NODE_ENV: "test" })).toBe(true);
  expect(mocks.query).toHaveBeenCalledWith("SELECT 1");
  expect(mocks.end).toHaveBeenCalledOnce();
});
it("returns a generic 503 on dependency failure without disclosing credentials", async () => {
  mocks.end.mockResolvedValue(undefined);
  mocks.connect.mockRejectedValue(
    new Error("postgresql://secret:password@host"),
  );
  const response = await GET();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("password");
  expect(mocks.end).toHaveBeenCalledOnce();
});
it("fails closed before connecting on invalid configuration", async () => {
  mocks.validate.mockImplementation(() => {
    throw new Error("invalid");
  });
  expect(await readiness({ NODE_ENV: "test" })).toBe(false);
  expect(mocks.connect).not.toHaveBeenCalled();
});
