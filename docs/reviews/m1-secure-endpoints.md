# M1 review packet: Secure Endpoints

## Scope

M1 adds session-authenticated REST contracts for endpoint create, list, read, update, one-way disablement, and secret rotation. It includes show-once signing secrets, encrypted versioned storage, URL/DNS policy, workspace authorization, Problem Details, OpenAPI, audit records, and focused tests.

Endpoint screens, API-key lifecycle, event acceptance, delivery, receiver integration, retries, QStash, attempts, outbox processing, and replay are not included.

## Architecture and data flow

Route handlers adapt HTTP to shared Zod contracts. They establish a correlation ID, resolve the Better Auth session and owner workspace, enforce mutation origin, and call the endpoint application service. The service applies destination policy before transactionally writing PostgreSQL endpoint, encrypted secret, and audit records. Responses never query secret plaintext.

```text
HTTP request
  -> correlation + session + workspace + origin
  -> shared contract validation
  -> HTTPS / DNS / address policy
  -> endpoint application transaction
  -> resource JSON or application/problem+json
```

## Authentication and authorization

| Request                      | Authentication      | Workspace rule               | Additional rule                  |
| ---------------------------- | ------------------- | ---------------------------- | -------------------------------- |
| List/read                    | Better Auth session | Owner workspace from session | Foreign IDs return 404           |
| Create/update/disable/rotate | Better Auth session | Owner workspace from session | Exact configured Origin required |

API-key rows remain schema-only in M1.

## API and secret behavior

The canonical contract is [OpenAPI](../openapi.json). Creation returns endpoint metadata plus one `whsec_...` value. Rotation returns only the new value and version. List/read/update never expose current or retired secret material. All authenticated responses are `no-store`.

Secrets are 32 random bytes encrypted with AES-256-GCM. Additional authenticated data binds ciphertext to its workspace, endpoint, and version. Rotation is serializable and PostgreSQL enforces one unretired secret per endpoint. See the [verification guide](../signing.md).

## SSRF evidence

Only HTTPS port 443 is accepted. Credentials and fragments are rejected. Literal addresses and every DNS answer are classified; any non-public answer rejects the destination. The connection lookup repeats resolution and validation for M2, covering mixed answers and DNS rebinding. M1 sends no outbound webhook request.

## Schema and migration

No M2 table is changed. The M1 migration adds `(workspaceId, createdAt, id)` for cursor scans and a partial unique index for the one-active-secret invariant. Existing endpoint, secret, and audit tables remain the persistence model.

## Verification results

All required local checks passed on Node.js 24 and pnpm 11.19.0:

| Check                                 | Result                                                     |
| ------------------------------------- | ---------------------------------------------------------- |
| `pnpm install --frozen-lockfile`      | Passed; lockfile already current                           |
| `pnpm db:deploy` / `pnpm db:validate` | Passed; three reviewed migrations applied and schema valid |
| `pnpm format:check`                   | Passed                                                     |
| `pnpm lint`                           | Passed with zero warnings                                  |
| `pnpm typecheck`                      | Passed across all workspace packages                       |
| `pnpm test`                           | Passed; 46 unit tests                                      |
| `pnpm test:integration`               | Passed; 7 PostgreSQL integration tests                     |
| `pnpm openapi:check`                  | Passed; generated document matches shared contracts        |
| `pnpm build`                          | Passed; production Next.js route build completed           |
| `pnpm test:e2e`                       | Passed; 4 running-server API journeys                      |

The test environment uses synthetic users, URLs, session tokens, and encryption keys. It does not use GitHub OAuth credentials or send a webhook request.

## Known limitations and remaining risks

- M1 is REST-only and session-only; management UI and API-key access are later work.
- Destination acceptance depends on DNS availability and does not pin acceptance-time answers; connection-time revalidation remains mandatory.
- Endpoint destination URLs are operational configuration and remain readable in the database, including any user-supplied query string.
- Master-key re-encryption and loss-recovery procedures remain a hardening/runbook task.
- Port 443 only is intentionally strict and may reject otherwise public HTTPS services.

## M2 boundary

M2 will create immutable event/delivery records, pin destination and secret versions, publish through the outbox/queue boundary, execute SSRF-safe HTTP delivery with redirects disabled, record attempts, own retries and leases, enforce delivery quotas, exhaust work, and support replay. None of that behavior exists in this PR.
