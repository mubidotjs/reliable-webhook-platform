import { expect, it } from "vitest";
import { errorDiagnostic } from "./error-diagnostic";
it("logs only recognized error types and Prisma codes", () => {
  const error = Object.assign(new Error("postgres://secret@host/query"), {
    name: "PrismaClientKnownRequestError",
    code: "P2021",
    meta: { query: "sensitive" },
  });
  expect(errorDiagnostic(error)).toEqual({
    errorType: "PrismaClientKnownRequestError",
    errorCode: "P2021",
  });
  expect(
    JSON.stringify(
      errorDiagnostic(
        Object.assign(new Error("secret"), { name: "secret", code: "secret" }),
      ),
    ),
  ).toBe('{"errorType":"UnexpectedError"}');
  expect(errorDiagnostic(null).errorType).toBe("UnexpectedError");
});
