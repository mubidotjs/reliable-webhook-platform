# M4 — v1 hardening acceptance

Verified locally on 2026-09-26 on branch `feature/m4-v1-hardening`. Local implementation and regression verification are complete. **M4/v1 final sign-off remains pending live deployment and QStash evidence.** No production deployment, remote CI run or live OAuth/provider smoke test is claimed.

## Implemented

- Structured, allowlisted lifecycle logs with timestamps, levels and operation IDs; terminal logs follow committed state. Authentication and receiver diagnostics omit raw request/error content.
- Durable hourly metrics using the existing aggregate table, with transactional acceptance/completion counters and a read-only operator report.
- Database/configuration readiness alongside existing dependency-free liveness.
- Runtime and hosted-build configuration validation, configurable payload/daily limits, stream-bounded management/replay JSON and consistent invalid-UTF-8 rejection.
- Atomic PostgreSQL workspace burst limiting and Better Auth custom limit storage; bounded cleanup of stale request counters.
- Deterministic recovery ordering, explicit shared attempt-limit use, cleared publication claims on budget deferral and an index for generation-scoped outbox lookup/consumption.
- Failure, concurrency, logging, configuration, health and transport regressions; a repeatable load harness and isolated CI load smoke step.
- Development-only, loopback-default failure receiver, including timeout sequences, bounded bodies and sequence count. Docker retains explicit development networking.

## Important files changed

| Area                 | Files                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Configuration        | `packages/config/src/index.ts`, `.env.example`, `apps/web/src/instrumentation.ts`                                                                      |
| Readiness and limits | `apps/web/src/lib/readiness.ts`, `apps/web/src/app/api/health/ready/route.ts`, `apps/web/src/lib/rate-limit.ts`, `apps/web/src/lib/auth-rate-limit.ts` |
| API boundaries       | `apps/web/src/lib/api-request.ts`, `apps/web/src/lib/bounded-body.ts`, event/replay/internal callback routes                                           |
| Lifecycle            | `apps/web/src/modules/events/service.ts`, delivery `processor.ts`, `outbox.ts`, `replay.ts`, `quotas.ts`                                               |
| Telemetry            | delivery `log.ts`, `metrics.ts`, `maintenance.ts`, `apps/web/scripts/metrics-report.ts`                                                                |
| Database             | Prisma schema and `20260926120000_v1_hardening/migration.sql`                                                                                          |
| Verification         | Delivery/limiter/migration integration tests, health browser test, transport/log/readiness/config unit tests, `apps/web/scripts/load-test.ts`          |
| Deployment           | `.github/workflows/ci.yml`, worker/build scripts, receiver app/server/Dockerfile and Compose binding                                                   |
| Documentation        | README, architecture/signing/OpenAPI, M4 operations, demo, load-testing and this evidence report                                                       |

## Reliability improvements

M2 already supplied leased claims, fencing, durable retry timing and stale-work recovery. M4 preserves those mechanisms and verifies concurrent recovery, stale-publisher failure after a new successful claim, duplicate acceptance/completion counting and persisted 429 Retry-After across processor instances. Existing tests cover publication failure/recovery, lost callbacks, worker subprocess exits after claim and after receipt, immutable attempt history, disabled endpoints and replay.

No exactly-once claim is made. A destination may receive a duplicate after a crash between HTTP receipt and local success persistence. Recovery still needs the application, database and scheduler to become available before retry policy expires.

## Security improvements

- Tenant context continues to come from authenticated server-side ownership; existing cross-tenant route/UI regressions pass.
- Preserve one-time secret disclosure at creation/rotation for consumer setup. Later reads, delivery APIs and logs exclude secrets; AES-GCM/HMAC contracts remain unchanged.
- Preserve HTTPS/public-address checks, connection-time DNS validation and QStash signature verification. New transport regression verifies no redirects, no response-body reading and protected content headers.
- Add distributed request limits, management-body bounds and encoding validation; retain existing session-Origin checks and cursor bounds.
- The receiver cannot run diagnostic fixtures in production mode; container exposure is bound to loopback on the host.
- Repository scan of 216 tracked/non-ignored files found no high-confidence private-key/access-token markers. Local `.env` files are untracked. This targeted scan is not a guarantee against every possible credential format.

## Database and performance

All six migrations applied successfully to a fresh isolated PostgreSQL 17 database. The populated M2 → M3/M4 upgrade test preserves history, permits replay and still rejects a second original delivery. No destructive schema change was introduced.

The new `outbox_aggregate_generation_status_idx` supports actual recovery/consumption predicates. Existing tenant cursor indexes and bounded relation projections were retained; no obvious per-row history lookup loop required rewriting.

| Load measurement                     |               Result |
| ------------------------------------ | -------------------: |
| Events / endpoints / concurrency     |        1,000 / 3 / 8 |
| Successful deliveries                |                1,000 |
| Attempts, including 100 initial 500s |                1,100 |
| Unique history rows                  |                1,000 |
| Ingestion elapsed / p95              | 43.752 s / 494.88 ms |
| Worker elapsed                       |             34.286 s |
| History-page p95                     |             22.01 ms |
| Sample indexed recovery lookup       |             0.086 ms |

Environment: Windows x64, Node 24.19.0, pnpm 11.19.0, Docker PostgreSQL 17, i7-6600U, four logical CPUs, 16 GiB RAM. Other local verification work was active. [Machine-readable evidence](m4-load-evidence.json) records the measurement limits.

The final 100-event / four-worker CI-sized smoke workload also passed: 100 successes, 110 attempts, 100 unique history rows. At that smaller size PostgreSQL chose a sequential scan for the sampled lookup; no planner preference is forced.

The benchmark measures service ingestion and real signed loopback HTTP through an injected test transport. It excludes ingress HTTP/auth overhead and live QStash/public TLS. Retries use an accelerated test clock. Global acceptance locks and hourly aggregate contention remain scaling trade-offs, not proven production bottleneck measurements.

## Observability

Counters cover acceptance, delivery creation/success/exhaustion/cancellation, failed attempts, retries, replay, publication failures and queue-handler failures. Timing count/sums cover attempts, acceptance-to-success, queue delay and confirmed outbox publication delay. Duplicate successful state transitions do not double-count.

`pnpm --filter @rwp/web metrics:report 24` executed successfully. Failure reporting and publication-delay samples are best effort when no domain transaction is available. The report does not divide unrelated time-window populations into misleading success rates.

Readiness uses bounded connectivity plus `SELECT 1`, not optional provider probes. Both health routes passed browser verification without exposing configuration details.

## Tests

| Check                            | Actual status                                                          |
| -------------------------------- | ---------------------------------------------------------------------- |
| Unit suite                       | PASS — 81 tests across receiver, config, contracts, domain and web     |
| Integration suite                | PASS — 44 tests; latest run includes populated M4 migration upgrade    |
| Failure-path and tenant security | PASS — included in unit/integration/browser suites                     |
| Playwright                       | PASS — all 21 tests, including M3 replay/history and M4 health         |
| Typecheck                        | PASS — entire workspace after final serializer correction              |
| Lint                             | PASS — zero warnings                                                   |
| Formatting                       | PASS                                                                   |
| Production build                 | PASS — full workspace; receiver rebuilt after its final sanitizer edit |
| Prisma schema validation         | PASS                                                                   |
| Fresh migration application      | PASS — six migrations                                                  |
| OpenAPI synchronization          | PASS                                                                   |
| Compose configuration            | PASS                                                                   |
| Load / CI-sized smoke            | PASS — 1,000 events and 100 events respectively                        |
| Metrics reporting                | PASS                                                                   |
| Git diff whitespace              | PASS                                                                   |

Intermediate failures were corrected: new health routes required updating the OpenAPI expectation, strict types required narrowing new result variants, and Fastify required safe placeholder message/stack fields in its error serializer. On resumption Docker was stopped; the database checks were rerun successfully after restarting the same disposable service. No test was skipped to hide a failure.

The browser run printed one Next.js early-closed-stream diagnostic during navigation; all browser assertions passed. Remote GitHub Actions and a full receiver Docker image build were not executed; Compose validation and receiver compilation were performed.

## Deployment

Keep Vercel, PostgreSQL/Neon and QStash. Production validates configuration before the existing migration preflight/deploy flow. Configure the actual stable HTTPS APP_URL, both QStash signing keys, token, database URLs, encryption keyring and GitHub OAuth callback. Establish the signed five-minute recovery schedule with the existing `queue:setup` command.

The additive index takes a normal table lock; use a low-traffic migration window for this small deployment. Do not edit applied migrations or assume failed application builds roll schema changes back.

[The operations runbook](../m4-operations.md) contains the remaining live verification steps: health, real OAuth, signed QStash callback, successful receiver verification, retry, exhaustion/replay and recovery after interruption. These remain manual hosted sign-off work.

## Documentation and repository quality

README now covers the current UI/replay behavior, guarantees, APIs and operational links. Architecture explains outbox/retry/replay trade-offs. Signing documentation links the tested raw-body verifier. Dedicated operations, demo and load runbooks describe reproducible commands and distinguish simulated/local evidence from live proof.

No dependencies were added or upgraded. Compatibility history columns and useful prior tests/docs were retained. The branch name is neutral; no history rewrite or remote branch deletion occurred. No tool branding or temporary implementation helpers were added. Generated build/test artifacts remain ignored.

## Remaining limitations and completion status

- Live deployment, real OAuth and QStash recovery-schedule proof remain unverified.
- Automated delivery-history retention remains future work; the old README claim that it already existed was corrected.
- Producer API-key authentication, a metrics dashboard/export stack and large-scale throughput tuning are outside this hardening work.
- The five-attempt, 24-hour retry window, fixed five-second transport deadline and conservative daily quotas remain deliberate product limits.
- One-time secret display is intentionally preserved; eliminating it would require a different consumer-provisioning workflow.

M0–M3 behavior passes regression coverage. M4 implementation passes local verification. **Do not mark M4 or Reliable Webhook Platform v1 COMPLETE until the hosted acceptance evidence is recorded.**
