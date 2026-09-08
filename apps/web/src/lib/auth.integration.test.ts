import { randomInt, randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const providerAccountId = randomInt(100_000_000, 2_000_000_000);
const email = `callback-${randomUUID()}@example.test`;
const states: string[] = [];

function cookies(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function initiate() {
  const response = await auth.handler(
    new Request(`${baseURL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseURL },
      body: JSON.stringify({
        provider: "github",
        callbackURL: `${baseURL}/dashboard`,
      }),
    }),
  );
  expect(response.status).toBe(200);
  const body = await response.json();
  const state = new URL(body.url).searchParams.get("state")!;
  expect(state).toBeTruthy();
  states.push(state);
  return { state, cookie: cookies(response) };
}

async function callback(state: string, cookie: string) {
  return auth.handler(
    new Request(
      `${baseURL}/api/auth/callback/github?code=synthetic-code&state=${encodeURIComponent(state)}`,
      {
        headers: { cookie },
      },
    ),
  );
}

describe.runIf(Boolean(process.env.DATABASE_URL))(
  "GitHub OAuth callback",
  () => {
    beforeEach(() => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === "https://github.com/login/oauth/access_token")
          return Response.json({
            access_token: "synthetic-token",
            token_type: "bearer",
            scope: "read:user,user:email",
          });
        if (url === "https://api.github.com/user")
          return Response.json({
            id: providerAccountId,
            login: "callback-test",
            name: "Callback Test",
            email,
            avatar_url: null,
          });
        if (url === "https://api.github.com/user/emails")
          return Response.json([{ email, primary: true, verified: true }]);
        throw new Error(`Unexpected external request: ${url}`);
      });
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await db.user.deleteMany({ where: { email } });
      await db.verification.deleteMany({
        where: { identifier: { in: states.splice(0) } },
      });
    });

    afterAll(async () => {
      await db.$disconnect();
    });

    it("creates an account/session, then reuses the account and preserves its workspace", async () => {
      const first = await initiate();
      const response = await callback(first.state, first.cookie);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`${baseURL}/dashboard`);
      const sessionResponse = await auth.handler(
        new Request(`${baseURL}/api/auth/get-session`, {
          headers: { cookie: cookies(response) },
        }),
      );
      expect(sessionResponse.status).toBe(200);
      const session = await sessionResponse.json();
      expect(session.user.email).toBe(email);
      const userId = session.user.id as string;
      const account = await db.account.findFirstOrThrow({
        where: { providerId: "github", accountId: String(providerAccountId) },
      });
      expect(account.userId).toBe(userId);
      expect(await db.session.count({ where: { userId } })).toBe(1);
      const workspace = await db.workspace.create({
        data: { ownerId: userId, name: "Preserved workspace" },
      });

      const second = await initiate();
      const secondResponse = await callback(second.state, second.cookie);
      expect(secondResponse.status).toBe(302);
      expect(secondResponse.headers.get("location")).toBe(
        `${baseURL}/dashboard`,
      );
      const secondSessionResponse = await auth.handler(
        new Request(`${baseURL}/api/auth/get-session`, {
          headers: { cookie: cookies(secondResponse) },
        }),
      );
      const secondSession = await secondSessionResponse.json();
      expect(secondSession.user.id).toBe(userId);
      expect(await db.user.count({ where: { email } })).toBe(1);
      expect(
        await db.account.findMany({
          where: { providerId: "github", accountId: String(providerAccountId) },
        }),
      ).toMatchObject([{ id: account.id, userId }]);
      expect(
        await db.workspace.findUnique({ where: { ownerId: userId } }),
      ).toMatchObject({ id: workspace.id });
      expect(await db.session.count({ where: { userId } })).toBe(2);
    });

    it("rejects invalid state before contacting GitHub or creating an account/session", async () => {
      const beforeSessions = await db.session.count();
      const flow = await initiate();
      const response = await callback(`${flow.state}-invalid`, flow.cookie);
      expect(response.status).toBe(302);
      const destination = new URL(response.headers.get("location")!, baseURL);
      expect(destination.searchParams.get("error")).toBe("state_mismatch");
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(await db.user.count({ where: { email } })).toBe(0);
      expect(
        await db.account.count({
          where: { providerId: "github", accountId: String(providerAccountId) },
        }),
      ).toBe(0);
      expect(await db.session.count()).toBe(beforeSessions);
    });
  },
);
