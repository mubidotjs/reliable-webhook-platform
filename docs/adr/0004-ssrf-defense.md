# ADR 0004: SSRF defense at resolution and connection time

- Status: Accepted
- Date: 2026-09-04

## Context

Users choose webhook destinations, making outbound delivery an SSRF boundary. URL-only validation cannot prevent DNS rebinding or mixed public/private DNS answers.

## Decision

M1 centralizes destination acceptance behind one policy. All environments require HTTPS, forbid URL credentials and fragments, and permit only port 443. Endpoint creation and URL edits resolve every A/AAAA answer and reject the entire destination when any address is not public unicast. IPv4-mapped IPv6 is classified as IPv4 before policy evaluation.

M1 also exposes a Node-compatible connection lookup that resolves again, validates every answer, and only then selects an address. M2 must use that lookup and disable redirects when it introduces outbound HTTP. M1 itself sends no outbound webhook request.

## Consequences

No delivery code may use a general-purpose HTTP client directly. The policy deliberately rejects private, reserved, loopback, link-local, multicast, unspecified, carrier-grade NAT, documentation, metadata, transition, and other non-unicast ranges. This may reject unusual but technically reachable destinations. DNS availability is part of endpoint acceptance, while connection-time revalidation remains mandatory because acceptance-time DNS results are not pinned.
