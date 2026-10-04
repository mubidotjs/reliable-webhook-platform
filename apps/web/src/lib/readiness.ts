import { validateRuntimeEnvironment } from "@rwp/config";
import pg from "pg";

export async function readiness(
  source: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  let client: pg.Client | undefined;
  try {
    validateRuntimeEnvironment(source);
    client = new pg.Client({
      connectionString: source.DATABASE_URL,
      connectionTimeoutMillis: 1500,
      query_timeout: 1500,
      statement_timeout: 1500,
    });
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } catch {
    return false;
  } finally {
    await client?.end().catch(() => undefined);
  }
}
