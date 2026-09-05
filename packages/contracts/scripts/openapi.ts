import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createOpenApiDocument } from "../src/openapi";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const target = resolve(currentDirectory, "../../../docs/openapi.json");
const serialized = `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const existing = await readFile(target, "utf8").catch(() => "");
  if (existing !== serialized) {
    throw new Error(
      "docs/openapi.json is stale. Run pnpm openapi:generate and commit the result.",
    );
  }
} else {
  await writeFile(target, serialized, "utf8");
}
