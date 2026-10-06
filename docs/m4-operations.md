# M4 operations and deployment

## Environment loading

Use Node 24 / pnpm 11.19.0. Copy `.env.example` to ignored `.env` and replace placeholders. Export these settings in every shell used for app, worker, migrations or reporting; Next.js app-local `.env.local` does not configure the standalone scripts.

Bash, from repository root:

```sh
set -a
. ./.env
set +a
```

PowerShell, for the unquoted KEY=value format in the example:

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
```

Never print the resulting environment or give preview/test jobs production credentials. Runtime startup and the worker validate database URLs, auth/GitHub settings, encryption keys, queue configuration and limits. Hosted production (`VERCEL_ENV=production`) requires QStash and HTTPS application/provider URLs. Errors identify invalid fields without their values.

## Limits

| Variable / policy                 |      Default | Behavior                                                                   |
| --------------------------------- | -----------: | -------------------------------------------------------------------------- |
| EVENT_BODY_LIMIT_BYTES            |       262144 | UTF-8 request bytes; configurable up to 1 MiB; overflow returns 413        |
| Endpoint management / replay body |       16 KiB | Stream bounded; malformed UTF-8 returns 400                                |
| Signed worker/recovery body       |        4 KiB | Verified against exact bytes                                               |
| MUTATION_REQUESTS_PER_MINUTE      |          120 | All authenticated workspace mutations, including repeated/invalid requests |
| DAILY_TENANT_DELIVERY_LIMIT       |           25 | Newly accepted deliveries including replay                                 |
| DAILY_GLOBAL_DELIVERY_LIMIT       |          100 | All workspaces combined                                                    |
| DAILY_PUBLICATION_LIMIT           |          650 | QStash publication attempts, including uncertain publications              |
| Outbound deadline                 |    5 seconds | Connection through response headers                                        |
| Attempts / retry window           | 5 / 24 hours | Persisted M2 policy                                                        |

Burst limits use PostgreSQL transactions and per-workspace advisory locks. Fixed UTC minutes permit adjacent bursts; this is abuse protection, not smooth traffic shaping. Idempotent acceptance/replay does not spend daily quota twice, but each HTTP request spends burst quota. Application 429 responses include `Retry-After` seconds.

Better Auth keeps its built-in production rules and client-IP policy, using atomic PostgreSQL custom storage instead of per-process memory. Its 429 response uses `X-Retry-After`. Configure trustworthy proxy IP information; missing trusted identity can share a fallback bucket. No custom forwarded-header trust bypass is added.

Recovery removes at most 1,000 auth/mutation counters inactive for two days per tick. Delivery history is not automatically deleted. Raising hosted limits requires reviewing provider costs/capacity. Quota-blocked work stays durable but can exhaust its retry deadline.

## Logs and metrics

JSON lifecycle logs include timestamp, level and relevant IDs. `correlationId` is the existing request correlation contract; `eventId` is the producer ID. Fields are allowlisted. Payloads, destination response bodies, URLs, credentials, authorization headers and cookies are not lifecycle fields. `LOG_LEVEL` controls lifecycle output; exceptions use safe diagnostic classes/codes.

Events cover acceptance, delivery/attempt transitions, outbox creation/publication/failure, queue receipt/duplicate/signature rejection and replay. Terminal completion logs follow commit. Abrupt exits can lose logs: persisted state remains authoritative.

Existing `MetricAggregate` rows contain UTC hourly counters and timing count/sum pairs without per-resource dimensions. Domain metrics commit with state; duplicates do not increment acceptance or completion twice. Publication-delay and queue-handler-error metrics are best effort; database outages can prevent recording them.

```sh
pnpm --filter @rwp/web metrics:report 24
```

This read-only operator command requires database access and reports global data, never a public tenant API. Timing sums are milliseconds; total/count is the mean. Attempt latency excludes uncertain crash outcomes. Acceptance-to-success measures from original event acceptance, including replay. Queue delay measures time past persisted dueAt on claim. Outbox delay measures time past availableAt after confirmed publication; fast local consumption may omit it.

Metrics cover accepted events, created/succeeded/exhausted/cancelled deliveries, failed attempts, retries, replay, publication failures and queue processing failures. Window counters are transitions, not a common event cohort, so the report does not invent success-rate percentages. Aggregation begins at M4 deployment without historical backfill.

## Health and deployment

- `GET /api/health/live`: dependency-free process liveness.
- `GET /api/health/ready`: validates settings and executes `SELECT 1`, with 1.5-second connection and query deadlines. Returns 200 ready or generic 503 unavailable, never credentials. No QStash/GitHub probe.

Retain Vercel/Neon/QStash and `pnpm vercel-build`. The deployment sections below describe database identity/schema preflight and OAuth compatibility. Production validates configuration before committed migrations. M4 adds an outbox aggregate/topic/generation/status index for recovery and consumption. Original-delivery partial uniqueness and immutable history protections stay intact; blanket event/endpoint uniqueness would break replay.

The index uses a normal table lock. Apply during low traffic for this bounded-volume deployment; larger installations need a separately reviewed concurrent-index rollout. Back up first. Never reset production or edit applied migrations. A later application-build failure does not roll back committed migrations.

Set `APP_URL` to the stable public HTTPS origin. Worker and recovery callbacks are `/api/internal/deliveries/process` and `/api/internal/deliveries/recover`. Configure both signing keys and public reachability. After deployment, run `pnpm --filter @rwp/web queue:setup` from a correctly configured operator shell to establish the five-minute schedule. This changes QStash configuration and is not part of local tests.

## Vercel production deployment

Set the Vercel project Root Directory to `apps/web`, enable access to source files outside that directory for the workspace packages, and use the committed `vercel.json` build command: `pnpm vercel-build`. Remove any dashboard Build Command override that bypasses this command. Install from the workspace lockfile with development dependencies available for Prisma and tsx.

Configure production-scoped `DATABASE_URL` (pooled runtime connection) and `DIRECT_URL` (direct migration connection) for the **same database**, using the `public` schema. Configure `BETTER_AUTH_URL=https://webhooks.mubashirhussain.dev`, the auth secret and GitHub credentials, and register `https://webhooks.mubashirhussain.dev/api/auth/callback/github` in the GitHub OAuth app.

The build generates Prisma Client first. Only when `VERCEL_ENV=production`, it checks database identity using a temporary transaction-scoped advisory lock, checks tables against completed migration history, applies committed migrations, and checks again before building Next.js. Different pooled/direct hostnames are supported. Both connections need access to PostgreSQL advisory locks; connection failure or any migration/preflight failure stops deployment. Migrations are additive but are not rolled back if the later application build fails.

Preview and ordinary local builds never apply migrations automatically. Provision preview databases separately and do not give previews production database credentials. Do not promote a preview built without this production migration step directly to production; trigger a production build.

### Missing auth tables / P2021

If GitHub sign-in reports that `public.verifications` does not exist, inspect the production database URLs and migration status with `pnpm --filter @rwp/web exec prisma migrate status` using production-scoped `DIRECT_URL`. Deploy using the production build above to apply the existing foundation migration. Prisma CLI reads `DIRECT_URL`; the running app reads `DATABASE_URL`. Never paste credentials into logs or issue reports.

If completed migration history references missing tables, the build reports schema drift and stops. Recover from the appropriate backup or prepare a reviewed, targeted repair based on the actual database state. Do not run `migrate reset`, edit applied migration files, or mark missing migrations as applied. An SSL-mode warning is separate from a missing-table error.

After release, click Continue with GitHub and confirm the social endpoint no longer returns 500. Complete OAuth and verify the session and dashboard/onboarding flow. A local test cannot validate production GitHub credentials or the live callback configuration.

### Better Auth callback compatibility

Better Auth and its Prisma adapter are pinned together at 1.7.3. Versions 1.7.0–1.7.2 queried an account `issuer` field; 1.7.3 uses the existing `(providerId, accountId)` key again. Keep the committed schema and regenerate Prisma Client during deployment. See the [official upgrade guide](https://better-auth.com/docs/guides/1-7-upgrade-guide).

The production preflight inspects `public.accounts` for a manually added required `issuer` column. If found, it stops the release with a repair instruction. After confirming the live column and reviewing the database state, commit a migration containing `ALTER TABLE public.accounts ALTER COLUMN issuer DROP NOT NULL;` and apply it with the existing `pnpm db:deploy` command before retrying the production build. Preserve the column's data and the existing `(providerId, accountId)` unique constraint. No issuer migration is needed for the repository's current schema.

## Production smoke checklist

1. Confirm migration status and both health routes.
2. Complete real GitHub sign-in and workspace onboarding.
3. Create a controlled public HTTPS endpoint and save its show-once secret.
4. Submit a synthetic event; observe persisted delivery history.
5. Verify QStash callback delivery and consumer HMAC validation.
6. Exercise 500 → 200; inspect immutable attempts and timings.
7. Exhaust an event, fix the receiver, replay, and inspect the linked new delivery.
8. Restart processes; verify accepted work resumes. In an isolated hosted test, interrupt publication and confirm scheduled recovery.
9. Reject unsigned callbacks and cross-workspace access.
10. Inspect sanitized logs/metrics and save deployment revision plus evidence in the acceptance report.

Local tests do not verify real OAuth credentials, public DNS/TLS, provider reachability or a live recovery schedule. Keep hosted sign-off pending until observed.
