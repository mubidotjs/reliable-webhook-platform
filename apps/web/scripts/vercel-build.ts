import { spawnSync } from "node:child_process";
import { buildForVercel, checkDatabase } from "./deployment";

function run(script: string): void {
  const result = spawnSync("pnpm", ["run", script], {
    cwd: new URL("../", import.meta.url),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error || result.status !== 0)
    throw new Error(`${script} failed; deployment stopped.`);
}

try {
  await buildForVercel(process.env.VERCEL_ENV, run, () =>
    checkDatabase(process.env),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Deployment failed.");
  process.exitCode = 1;
}
