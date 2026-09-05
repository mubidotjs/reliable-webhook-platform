# ADR 0007: M1 endpoint lifecycle and authentication boundary

- Status: Accepted
- Date: 2026-09-04

## Context

M1 needs a reviewable endpoint-management contract without pulling API-key administration, delivery processing, or the M3 management UI forward. Endpoint disablement must be unambiguous and must not create an unsupported re-enable path.

## Decision

Expose endpoint creation, listing, reading, editing, one-way disablement, and secret rotation through `/v1/endpoints`. `PATCH` accepts either URL/timeout edits or the status-only command `{ "status": "DISABLED" }`. Repeated disablement is idempotent; edits and rotation on a disabled endpoint return a conflict. A workspace may have at most five enabled endpoints.

M1 accepts Better Auth browser sessions only. Unsafe methods require an exact application `Origin`. Every lookup and mutation derives `workspaceId` from the session owner and includes it in persistence predicates; missing and cross-workspace endpoint IDs both return not found. API-key authentication is deferred.

## Consequences

The M1 surface is testable end to end without GitHub OAuth or a browser UI. Disabled endpoints remain readable for auditability and do not consume the enabled-endpoint limit. Re-enable, permanent deletion, API-key access, delivery cancellation, and endpoint screens require later explicit decisions or milestones.
