import { randomInt } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";

export async function checkDatabase(env: NodeJS.ProcessEnv): Promise<void> {
  for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
    if (!env[name])
      throw new Error(`${name} is required for production migrations.`);
    const url = new URL(env[name]!);
    if ((url.searchParams.get("schema") ?? "public") !== "public")
      throw new Error(`${name} must use the public schema.`);
  }
  const direct = new pg.Client({
    connectionString: env.DIRECT_URL,
    connectionTimeoutMillis: 15000,
  });
  const runtime = new pg.Client({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  try {
    await direct.connect();
    await runtime.connect();
    // Transaction-scoped locks also work through transaction-mode poolers.
    await direct.query("BEGIN");
    await runtime.query("BEGIN");
    const keys = [randomInt(2147483647), randomInt(2147483647)];
    await direct.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", keys);
    const identity = await runtime.query(
      "SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS acquired",
      keys,
    );
    if (identity.rows[0].acquired)
      throw new Error(
        "DATABASE_URL and DIRECT_URL do not reach the same database.",
      );
    const issuerColumn = await direct.query(
      "SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'accounts' AND column_name = 'issuer'",
    );
    if (
      issuerColumn.rows.some(
        (column: { is_nullable: string }) => column.is_nullable === "NO",
      )
    )
      throw new Error(
        "Legacy accounts.issuer is required, but Better Auth 1.7.3 does not write it. Apply a reviewed migration to DROP NOT NULL on this column before deploying; preserve existing account data.",
      );
    const historyExists = await direct.query(
      "SELECT to_regclass('public._prisma_migrations') AS relation",
    );
    if (historyExists.rows[0].relation) {
      const history = await direct.query(
        "SELECT migration_name FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
      );
      const applied = new Set(
        history.rows.map(
          (row: { migration_name: string }) => row.migration_name,
        ),
      );
      const migrations = new URL("../prisma/migrations/", import.meta.url);
      for (const entry of await readdir(migrations, { withFileTypes: true })) {
        if (!entry.isDirectory() || !applied.has(entry.name)) continue;
        const sql = await readFile(
          new URL(`${entry.name}/migration.sql`, migrations),
          "utf8",
        );
        for (const match of sql.matchAll(/CREATE TABLE "([^"]+)"/g)) {
          const table = match[1]!;
          const result = await direct.query(
            "SELECT to_regclass($1) AS relation",
            [`public."${table}"`],
          );
          if (!result.rows[0].relation)
            throw new Error(
              `Schema drift: applied migration ${entry.name} is missing table ${table}. Stop and recover the schema; do not reset or mark migrations applied.`,
            );
        }
      }
    }
  } finally {
    await Promise.allSettled([direct.end(), runtime.end()]);
  }
}

export async function buildForVercel(
  environment: string | undefined,
  run: (script: string) => void,
  preflight: () => Promise<void>,
): Promise<void> {
  run("db:generate");
  if (environment === "production") {
    await preflight();
    run("db:deploy");
    await preflight();
  }
  run("build");
}
