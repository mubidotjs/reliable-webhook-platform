import { betterAuth } from "better-auth/minimal";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { db } from "@/lib/db";

const developmentSecret = "development-only-secret-change-before-deploying";

function runtimeValue(name: string, developmentFallback: string): string {
  const value = process.env[name];
  if (value) {
    return value;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be configured in production.`);
  }
  return developmentFallback;
}

export const auth = betterAuth({
  appName: "Reliable Webhook Platform",
  baseURL: runtimeValue("BETTER_AUTH_URL", "http://localhost:3000"),
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  secret: runtimeValue("BETTER_AUTH_SECRET", developmentSecret),
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  socialProviders: {
    github: {
      clientId: runtimeValue(
        "GITHUB_CLIENT_ID",
        "github-client-not-configured",
      ),
      clientSecret: runtimeValue(
        "GITHUB_CLIENT_SECRET",
        "github-secret-not-configured",
      ),
    },
  },
});
