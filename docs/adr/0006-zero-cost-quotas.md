# ADR 0006: Fail-closed zero-cost quotas

- Status: Accepted
- Date: 2026-09-04

## Context

The hosted profile targets Vercel Hobby, Neon Free, and QStash Free. Queue recovery invokes 288 scheduled messages each day before delivery traffic.

## Decision

Reserve a 650-message application budget within QStash's daily free allowance. Accept at most 100 new delivery operations globally and 25 per workspace per UTC day, with replays included. Reserve quota in the same transaction as accepted work and fail closed when it cannot be proven available.

## Consequences

Public-demo cost is bounded and concurrency cannot oversubscribe counters. Limits are intentionally conservative and require revisiting if provider allowances or deployment assumptions change.
