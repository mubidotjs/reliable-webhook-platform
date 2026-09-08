# M2 implementation verification

Date: 2026-09-08

## Result

The local M2 implementation is verified. Hosted milestone sign-off remains
pending a live QStash run against the deployed M2 application and a controlled
public HTTPS receiver.

Implemented: session event ingestion, tenant-scoped producer idempotency,
immutable delivery bytes, atomic event/delivery/outbox acceptance, fenced claims,
append-only attempt starts and outcomes, signed outbound requests, five-second
deadlines, bounded durable retries, local and QStash adapters, signed callbacks,
and scheduled recovery of unpublished, unconsumed, and crashed work.

M1's eventId.timestamp.rawBody signature contract is preserved. PostgreSQL
remains authoritative. Delivery is at least once.

## Verification performed

All checks passed on Node.js 24 with an isolated PostgreSQL 17 instance.

| Check                      | Result                                                          |
| -------------------------- | --------------------------------------------------------------- |
| Fresh migration deployment | All four migrations applied                                     |
| pnpm check                 | Formatting, lint, types, 63 unit tests, production build passed |
| pnpm openapi:check         | Passed                                                          |
| pnpm test:integration      | 27 passed                                                       |
| pnpm test:e2e              | 10 passed                                                       |
| Local subprocess demo      | Passed                                                          |

The local proof saved in [m2-local-evidence.json](m2-local-evidence.json) shows
500 followed by 200 from a fresh worker process, simulated publication failure
and recovery, duplicate producer submission returning the same delivery, and
a duplicate terminal invocation producing no extra receiver request.
The demo uses real elapsed time and an explicitly injected local HTTP transport;
production destination validation is unchanged.

Integration tests additionally cover process exit after claiming and after
destination receipt, stale-worker fencing, exact HMAC bytes, timeout/retry,
attempt exhaustion, invalid QStash signatures, publication lease expiry,
missing callbacks, missing outbox work, immutable history, endpoint disablement,
secret rotation, cross-workspace rejection, and transactional rollback.

## Deployment status

No production migration, deployment, or QStash schedule mutation was performed.
The supplied public app origin is https://webhooks.mubashirhussain.dev.
The regional QStash API URL is https://qstash-eu-central-1.upstash.io.
A controlled public HTTPS receiver is still needed for the hosted proof.

Follow [the runbook](../m2-delivery.md) to apply the migration, configure the
queue environment, deploy, create the recovery schedule, and gather live proof.
Do not mark the portfolio milestone complete from the local harness alone.
