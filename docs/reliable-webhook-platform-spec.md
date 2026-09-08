# Reliable Webhook Platform — v1 Specification

**Status:** Draft for approval  
**Repository:** `mubidotjs/reliable-webhook-platform`  
**Purpose:** Flagship public project demonstrating senior full-stack, API, reliability, database, testing and operational judgment

## 1. Product outcome

Build a small but production-minded platform that lets a team register webhook endpoints, send test events, inspect delivery attempts, understand failures and safely replay failed deliveries.

The project is not intended to imitate a complete commercial webhook provider. Its value is the visible engineering around delivery guarantees, idempotency, retries, security, observability and failure recovery.

## 2. Primary user journey

1. A user signs in and creates a workspace.
2. The user registers an HTTPS destination endpoint.
3. The platform generates a signing secret and shows it once.
4. The user sends a test event through the API or dashboard.
5. The platform stores the event and queues a delivery.
6. A worker signs the payload and attempts delivery.
7. The dashboard shows status, response metadata and attempt history.
8. Transient failures retry automatically according to policy.
9. An exhausted or manually selected delivery can be safely replayed.

## 3. v1 scope

### Included

- Email/password or GitHub-based authentication.
- One workspace per account initially, with an upgrade path to memberships.
- Webhook endpoint create, list, update, disable and rotate-secret flows.
- Test-event creation through authenticated UI and API.
- Durable event and delivery records.
- Background delivery queue.
- HMAC-SHA256 request signing with timestamp protection.
- Idempotency for event creation and replay.
- Configurable request timeout within safe limits.
- Exponential backoff with jitter and a maximum attempt count.
- Delivery and attempt status history.
- Manual replay that creates an auditable new delivery operation.
- Structured logs and request/delivery correlation IDs.
- Operational dashboard with filtering and pagination.
- Unit, integration and end-to-end tests for critical flows.
- Docker-based local development and CI.
- Reproducible failure/load experiment.

### Explicitly excluded from v1

- Billing and subscriptions.
- Multiple regions or active-active deployment.
- Arbitrary inbound third-party provider integrations.
- Complex organization administration.
- Microservices.
- User-authored scripts or payload transformations.
- Guaranteed exactly-once delivery.
- Large-file payloads.
- Native mobile application.

## 4. Recommended technical direction

### Repository structure

Use a pnpm workspace with clear boundaries:

```text
apps/
  web/        Next.js UI and serverless HTTP endpoints
  receiver/   Local failure-injection test receiver
packages/
  domain/     Framework-independent delivery rules
  contracts/  Shared schemas and API types
  config/     Typed configuration helpers
  testing/    Shared test builders only when justified
docs/
  adr/        Architecture decision records
  diagrams/   Source-controlled diagrams
infra/        Local/deployment configuration
```

Keep domain and application rules in explicit packages; add shared abstractions only when their boundaries are proven. Avoid premature framework wrappers.

### Stack

- **Frontend:** Next.js, React, TypeScript, accessible component primitives.
- **API:** Next.js Route Handlers with generated OpenAPI; domain logic remains framework-independent.
- **Validation/contracts:** Zod or Nest-compatible schema validation, selected once for consistent runtime validation.
- **Database:** PostgreSQL with explicit migrations and reviewed indexes.
- **Data access:** Prisma as the speed-oriented default, with migration SQL reviewed and documented.
- **Durable delivery transport:** Upstash QStash free tier. Application-owned delivery state and retry policy remain in PostgreSQL; QStash invokes the serverless delivery processor and carries delayed retry messages.
- **Testing:** Vitest or Jest for units, Supertest for API integration, Playwright for end-to-end.
- **Observability:** structured Pino logs, metrics and trace/correlation propagation.
- **Local environment:** Docker Compose for PostgreSQL and the failure-injection receiver; a local queue adapter exercises the same application service contracts without cloud credentials.
- **CI:** install, formatting check, lint, type-check, tests and build.

### Architecture principle

Use a modular monolith deployed as a serverless Next.js application. Modules should reflect domain capabilities such as identity, workspaces, endpoints, events, delivery and audit. Route handlers and QStash callbacks call application services rather than contain domain rules. This is a deployment constraint, not permission to collapse domain boundaries into UI code.

### Strict zero-cost deployment profile

- **Web/UI/API:** Vercel Hobby at `webhooks.mubashirhussain.dev`.
- **Database:** Neon Free PostgreSQL.
- **Async invocation:** Upstash QStash Free.
- **Monthly infrastructure budget:** `$0`; do not attach paid plans or enable usage-based billing.
- **Demo guardrails:** enforce an application quota below provider limits, reject work when the quota is reached, keep payloads small and publish a visible demo-limit notice.
- **Portability:** queue and persistence are behind narrow application interfaces so local Docker or a future paid worker can replace the free adapters without rewriting domain logic.

The hosted demo is a personal, non-commercial portfolio project. Provider free tiers can change, so their limits are checked before each public release. The repository remains fully runnable locally even if a hosted free tier is discontinued.

## 5. Delivery semantics

The platform promises **at-least-once delivery**, not exactly once.

- Each event has a stable event ID.
- Each destination delivery has a stable delivery ID.
- Every HTTP attempt has its own attempt ID and sequence number.
- Consumers receive the event ID and should implement their own deduplication.
- The platform prevents accidental duplicate scheduling through database constraints and idempotency keys.
- A manual replay is auditable and never rewrites historical attempts.

### Suggested request headers

- `webhook-id`: stable event identifier.
- `webhook-timestamp`: signed Unix timestamp.
- `webhook-signature`: versioned HMAC signature.
- `user-agent`: project/version identifier.

The signed content should include the event ID, timestamp and raw request body. Signature verification documentation will include replay-window validation and constant-time comparison.

## 6. Delivery state model

### Delivery statuses

- `PENDING`
- `PROCESSING`
- `SUCCEEDED`
- `RETRY_SCHEDULED`
- `EXHAUSTED`
- `CANCELLED`

### Transition rules

- A signed QStash callback claims a pending or retry-scheduled delivery.
- A successful 2xx response completes the delivery.
- Timeouts, network failures, 408, 425, 429 and most 5xx responses are retryable.
- Most other 4xx responses are terminal unless policy explicitly says otherwise.
- Retry timing respects a safe, capped `Retry-After` value where applicable.
- Exhausted deliveries require an explicit replay action.
- Database state updates and asynchronous scheduling use an outbox plus idempotent dispatcher. Because a database commit and QStash publish cannot share one transaction, an accepted event remains recoverable until dispatch is confirmed.

The exact retry classification will be implemented as a tested policy rather than scattered conditionals.

## 7. Initial data model

| Entity              | Important fields and constraints                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| `users`             | ID, email, authentication fields, timestamps; unique normalized email                                 |
| `workspaces`        | ID, name, owner, timestamps                                                                           |
| `webhook_endpoints` | Workspace, URL, status, encrypted secret material/version, timeout, timestamps                        |
| `events`            | Workspace, event type, payload, idempotency key, creation source, timestamps                          |
| `deliveries`        | Event, endpoint, status, next-attempt time, attempt count, replay relationship                        |
| `delivery_attempts` | Delivery, sequence, started/completed time, HTTP status, duration, safe response excerpt, error class |
| `audit_events`      | Actor, workspace, action, target, safe metadata and timestamp                                         |

Important indexes and uniqueness rules will be justified in an ADR and verified with query plans where useful.

## 8. API surface

The exact route naming may change during contract review.

### Endpoint management

- `POST /v1/endpoints`
- `GET /v1/endpoints`
- `GET /v1/endpoints/:id`
- `PATCH /v1/endpoints/:id`
- `POST /v1/endpoints/:id/rotate-secret`

### Events and deliveries

- `POST /v1/events`
- `GET /v1/events`
- `GET /v1/events/:id`
- `GET /v1/deliveries`
- `GET /v1/deliveries/:id`
- `POST /v1/deliveries/:id/replay`

Write endpoints accept an idempotency key where duplicate client submission is plausible. Pagination defaults to cursor-based ordering by stable timestamp plus ID.

## 9. Security baseline

- Validate and normalize every external input.
- Allow only HTTPS destinations outside local development.
- Protect against server-side request forgery: block loopback, link-local, private networks and unsafe redirects; re-check resolved destinations at connection time.
- Encrypt signing secrets at rest and never log or return them after initial creation/rotation.
- Redact authorization headers, cookies, signatures, payload secrets and credentials from logs.
- Apply authentication, workspace authorization and rate limits consistently.
- Use CSRF protection where cookie-based mutations require it.
- Use constant-time signature comparison and a bounded replay window.
- Limit payload size, response-body capture, redirect count and request duration.
- Use dependency scanning and secret scanning/push protection.
- Use synthetic data only; no employer/customer information.

SSRF protection is a release-blocking requirement because the service sends HTTP requests to user-provided URLs.

## 10. Testing strategy

### Unit tests

- Signature construction and verification examples.
- Retry classification and delay calculation.
- Idempotency conflict behavior.
- Delivery state transitions.
- URL/network destination policy.

### Integration tests

- Database constraints and transactions.
- Event acceptance plus durable queue scheduling.
- Worker success, timeout, retry and exhaustion.
- Authorization boundaries between workspaces.
- Replay behavior and audit records.

### End-to-end tests

- Register endpoint, send event and observe successful delivery.
- Observe a transient failure followed by success.
- Observe exhausted retries and manually replay.
- Rotate a secret and validate new signatures.

### Failure experiment

Use a controlled receiver capable of returning delayed responses, 429s, selected 5xx responses and connection termination. Record throughput, queue delay, delivery latency, retry distribution and recovery behavior. Publish only measurements produced by the checked-in commands and documented environment.

## 11. Observability

- Correlation ID from API request through event, delivery and attempt.
- Structured logs with stable event names and redaction.
- Metrics for accepted events, delivery result, attempts, outbox backlog/age and latency.
- Health/readiness checks that distinguish API, database and queue dependencies.
- A simple dashboard or documented metric queries sufficient to explain incidents.

## 12. Milestones and review gates

| Milestone            | Codex output                                                          | Approval evidence                                         |
| -------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| M0 Foundation        | Workspace, app, domain packages, database, CI and local stack         | Clean build/test run and architecture walkthrough         |
| M1 Secure endpoints  | Endpoint lifecycle, secret/signing and validation                     | Security checklist and working signed request             |
| M2 Reliable delivery | Outbox, QStash adapter, attempts, retry/idempotency and failure tests | Demonstrated transient failure and recovery               |
| M3 Operations UI     | History, filters, details and replay                                  | User walkthrough and Playwright evidence                  |
| M4 v1 hardening      | Observability, load/failure test, docs and deployment                 | Release packet, comprehension check and explicit approval |

## 13. Definition of done for v1

- A new developer can run the system from documented steps.
- The primary successful and failed-delivery workflows are demonstrable.
- CI passes lint, type-check, tests and build.
- Critical security constraints, especially SSRF and secret handling, are tested.
- Delivery semantics and limitations are documented accurately.
- Architecture and consequential choices have short ADRs.
- Load/failure results are reproducible and not overstated.
- The demo contains no real secrets or personal/employer data.
- Mubashir has reviewed the release packet and approved publication.

## 14. Decisions requiring one approval

Recommended defaults are shown first.

1. **Authentication:** Auth.js with GitHub/email-based sign-in, or custom email/password authentication.
2. **Data access:** Prisma with reviewed SQL migrations, or a lower-level typed query builder.
3. **Deployment:** approved — strict `$0/month` Vercel Hobby + Neon Free + Upstash QStash Free profile, with hard application quotas and no paid-plan attachment.
4. **Product naming:** keep the descriptive repository name for recruiter clarity, or add a separate brand name later.

Once these defaults are approved, Codex can produce the exact repository settings and begin M0 immediately after the repository is created.
