# ADR 0001: Modular monolith

- Status: Accepted
- Date: 2026-09-04

## Context

V1 needs strong transactional boundaries, workspace isolation, and observable delivery processing while fitting a portfolio-scale, zero-cost hosting profile.

## Decision

Use one Next.js application for UI, REST adapters, application services, persistence adapters, and worker callbacks. Keep domain and transport contracts in workspace packages. Run the failure-injection receiver as a separate local process because it represents an external destination.

## Consequences

Event acceptance can commit its resource, quota reservation, audit event, and outbox message atomically. Module contracts remain explicit without distributed-system overhead. Independent service extraction remains possible if measured load later justifies it.
