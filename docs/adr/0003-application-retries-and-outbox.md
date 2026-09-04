# ADR 0003: Application-owned retries with outbox and QStash

- Status: Accepted
- Date: 2026-09-04

## Context

Webhook retry policy is part of product behavior and must be auditable, deterministic at state boundaries, and consistent between local and hosted operation.

## Decision

Persist delivery work in a transactional PostgreSQL outbox. Implement one queue interface with a local poller and a QStash adapter. Disable provider retries; signed internal callbacks invoke application processing. A signed five-minute recovery schedule reclaims stale publications.

## Consequences

Business state, not provider state, is authoritative. Local and hosted paths exercise the same outbox. Delivery remains at least once, including the documented crash-after-send ambiguity.
