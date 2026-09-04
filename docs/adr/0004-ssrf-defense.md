# ADR 0004: SSRF defense at resolution and connection time

- Status: Accepted
- Date: 2026-09-04

## Context

Users choose webhook destinations, making outbound delivery an SSRF boundary. URL-only validation cannot prevent DNS rebinding or mixed public/private DNS answers.

## Decision

M1 will centralize outbound HTTP behind a policy client. Production permits HTTPS, no URL credentials, and an approved port set. Every IPv4 and IPv6 DNS answer is validated, including mapped addresses. A custom connection lookup revalidates the selected address. Private, reserved, loopback, link-local, and metadata targets are rejected. Redirects are disabled.

## Consequences

No delivery code may use a general-purpose HTTP client directly. The policy requires adversarial DNS and connection-time tests and may reject unusual but technically reachable destinations.
