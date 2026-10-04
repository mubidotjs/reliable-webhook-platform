import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { describe, it, expect } from "vitest";
describe.runIf(Boolean(process.env.DATABASE_URL))(
  "M3/M4 migration upgrade",
  () => {
    it("preserves populated M2 history and permits replay without permitting a second original", async () => {
      const client = new Client({ connectionString: process.env.DATABASE_URL });
      const schema = "m3_upgrade_" + randomUUID().replaceAll("-", "");
      await client.connect();
      try {
        await client.query('CREATE SCHEMA "' + schema + '"');
        await client.query('SET search_path TO "' + schema + '"');
        for (const migration of [
          "20260904043759_foundation",
          "20260904044500_foundation_invariants",
          "20260904150000_secure_endpoints",
          "20260908120000_durable_delivery",
        ]) {
          await client.query(
            await readFile(
              new URL(
                "../../.." +
                  "/prisma/migrations/" +
                  migration +
                  "/migration.sql",
                import.meta.url,
              ),
              "utf8",
            ),
          );
        }
        await client.query(`
    INSERT INTO users (id,name,email,"updatedAt") VALUES ('owner','Migration','migration@example.test',now());
    INSERT INTO workspaces (id,name,"ownerId","updatedAt") VALUES ('workspace','Migration','owner',now());
    INSERT INTO webhook_endpoints (id,"workspaceId",url,"updatedAt") VALUES ('endpoint','workspace','https://example.com/hooks',now());
    INSERT INTO endpoint_secrets (id,"endpointId",version,"encryptedSecret","encryptionKeyVersion") VALUES ('secret','endpoint',1,'synthetic','v1');
    INSERT INTO events (id,"workspaceId","endpointId",type,payload,"deliveryBody","creationSource","correlationId","producerEventId","requestHash") VALUES ('event','workspace','endpoint','test','{"value":1}','{"value":1}','test','correlation','producer','hash');
    INSERT INTO deliveries (id,"workspaceId","eventId","endpointId","endpointSecretId","destinationUrl","timeoutMs",status,"retryDeadline","correlationId","updatedAt") VALUES ('original','workspace','event','endpoint','secret','https://example.com/hooks',5000,'EXHAUSTED',now(),'correlation',now());
    INSERT INTO delivery_attempts (id,"deliveryId",sequence,"requestTimestamp","destinationUrl") VALUES ('attempt','original',1,now(),'https://example.com/hooks');
    INSERT INTO delivery_attempt_outcomes ("attemptId",status,"completedAt","httpStatus","durationMs","responseMetadata","resultingState") VALUES ('attempt','FAILED',now(),500,123,'{}','EXHAUSTED');
   `);
        const snapshot = async () => {
          const rows = [];
          for (const table of [
            "events",
            "deliveries",
            "delivery_attempts",
            "delivery_attempt_outcomes",
          ]) {
            rows.push((await client.query("SELECT * FROM " + table)).rows);
          }
          return rows;
        };
        const before = await snapshot();
        await client.query(
          await readFile(
            new URL(
              "../../../prisma/migrations/20260916120000_operations_ui/migration.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        await client.query(
          await readFile(
            new URL(
              "../../../prisma/migrations/20260926120000_v1_hardening/migration.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        expect(await snapshot()).toEqual(before);
        expect(
          (await client.query("SELECT name FROM webhook_endpoints")).rows[0],
        ).toEqual({ name: null });
        await client.query(
          `INSERT INTO deliveries (id,"workspaceId","eventId","endpointId","endpointSecretId","destinationUrl","timeoutMs","retryDeadline","correlationId","updatedAt","replayOfId") VALUES ('replay','workspace','event','endpoint','secret','https://example.com/hooks',5000,now(),'correlation',now(),'original')`,
        );
        await expect(
          client.query(
            `INSERT INTO deliveries (id,"workspaceId","eventId","endpointId","endpointSecretId","destinationUrl","timeoutMs","retryDeadline","correlationId","updatedAt") VALUES ('duplicate','workspace','event','endpoint','secret','https://example.com/hooks',5000,now(),'correlation',now())`,
          ),
        ).rejects.toMatchObject({ code: "23505" });
        await expect(
          client.query('UPDATE delivery_attempt_outcomes SET "httpStatus"=200'),
        ).rejects.toThrow("append-only");
      } finally {
        await client.query("SET search_path TO public");
        await client.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
        await client.end();
      }
    }, 15000);
  },
);
