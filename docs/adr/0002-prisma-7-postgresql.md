# ADR 0002: Prisma 7 and PostgreSQL

- Status: Accepted
- Date: 2026-09-04

## Context

The platform needs transactions, relational constraints, worker-claim indexes, JSON payload storage, and compatibility with Better Auth.

## Decision

Use PostgreSQL 17 locally and Prisma 7 with the PostgreSQL driver adapter. Commit and review generated SQL migrations. Keep database access behind application modules in `apps/web`.

## Consequences

The conventional Prisma client API works with Better Auth. PostgreSQL provides the locking and partial indexes needed by later outbox and quota work. Deployments require a pooled runtime URL and a direct migration URL.
