# ADR 0005: Versioned encrypted endpoint secrets

- Status: Accepted
- Date: 2026-09-04

## Context

Signing secrets must be recoverable for delivery but unavailable in plaintext storage. In-flight deliveries must remain stable across endpoint edits and rotations.

## Decision

Generate 32 random bytes per endpoint secret and encrypt them with AES-256-GCM under a versioned environment keyring. Store endpoint-secret versions separately. Each delivery pins its secret version, destination URL, timeout, and immutable body. Rotation affects only new deliveries and replays.

## Consequences

Historical attempts remain verifiable without making configuration mutable. Keyring rotation needs an explicit re-encryption runbook. Losing an active encryption key makes its pinned deliveries undecryptable.
