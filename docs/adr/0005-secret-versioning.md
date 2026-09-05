# ADR 0005: Versioned encrypted endpoint secrets

- Status: Accepted
- Date: 2026-09-04

## Context

Signing secrets must be recoverable for delivery but unavailable in plaintext storage. In-flight deliveries must remain stable across endpoint edits and rotations.

## Decision

Generate 32 random bytes per endpoint secret and display them once as `whsec_` plus canonical, unpadded base64url. Consumers decode that representation to obtain the HMAC key bytes.

Encrypt the bytes with AES-256-GCM under the active version of an environment keyring. Each envelope uses a random 12-byte nonce, a 16-byte authentication tag, and additional authenticated data binding the workspace ID, endpoint ID, and secret version. The database stores the key version separately and enforces one unretired secret per endpoint.

Creation writes endpoint, secret version 1, and audit event atomically. Rotation atomically retires the current secret, inserts the next version, advances the endpoint version, and writes an audit event. A disabled endpoint cannot rotate. Each future delivery pins its secret version, destination URL, timeout, and immutable body; rotation affects only future deliveries and replays.

## Consequences

Plaintext is returned only by successful create/rotate responses and cannot be recovered later. If a client loses that response, it must rotate again. Historical attempts remain verifiable without making configuration mutable. Keyring rotation needs an explicit re-encryption runbook. Losing a retained encryption key makes its pinned deliveries undecryptable.
