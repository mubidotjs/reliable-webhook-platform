# Reliable Webhook Platform

A production-minded webhook delivery platform built as a TypeScript modular monolith. The repository is implemented milestone by milestone; M1 adds secure, workspace-scoped endpoint configuration on top of the M0 foundation.

## M1 status

- Next.js 16 App Router and React 19 web application
- Better Auth database sessions with GitHub-only OAuth
- Explicit one-owner/one-workspace onboarding
- Prisma 7 and PostgreSQL 17 foundation schema
- Fastify failure-injection receiver
- Pure domain, contracts, configuration, and testing packages
- Docker Compose, CI, strict TypeScript, ESLint, Prettier, and Vitest
- Architecture decisions for the v1 reliability and security model
- REST endpoint create, list, read, update, disable, and secret rotation
- Show-once signing secrets encrypted with a versioned AES-256-GCM keyring
- HTTPS/DNS/connection-time SSRF policy and generated OpenAPI 3.1 contracts

Endpoint management is implemented without delivery side effects. Events, attempts, retries, outbox processing, and replay begin in M2.

## Prerequisites

- Node.js 24 LTS (see `.nvmrc`)
- pnpm 11.19.0 via Corepack
- Docker with Compose v2
- A GitHub OAuth app for interactive sign-in

The Compose database binds to host port `54329` by default to avoid common local PostgreSQL collisions. Set `POSTGRES_PORT` and update both database URLs if another port is needed.

## Local setup

1. Enable pnpm and install dependencies.

   ```bash
   corepack enable
   corepack prepare pnpm@11.19.0 --activate
   pnpm install --frozen-lockfile
   ```

2. Copy `.env.example` to `.env` and replace the development placeholders. Generate `BETTER_AUTH_SECRET` with at least 32 random bytes. Configure the GitHub OAuth callback as:

   ```text
   http://localhost:3000/api/auth/callback/github
   ```

3. Start PostgreSQL and apply the reviewed migrations.

   ```bash
   docker compose up -d postgres
   pnpm db:generate
   pnpm db:deploy
   ```

4. Run both applications.

   ```bash
   pnpm dev
   ```

The web app runs at `http://localhost:3000`; the receiver runs at `http://localhost:4000`. The receiver health endpoint is `/health`, with deterministic behavior routes under `/receive`.

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm openapi:check
pnpm build
pnpm test:e2e
```

Integration tests require the local PostgreSQL service. Configuration is parsed through `@rwp/config`; secrets and provider credentials must remain in environment variables.

## Repository map

```text
apps/web        Next.js UI, route adapters, application modules, persistence, worker entrypoint
apps/receiver   Fastify receiver for success, delay, termination, status, and failure sequences
packages/domain Pure delivery state and policy rules
packages/contracts Shared Zod contracts and API problem shapes
packages/config Typed server configuration
packages/testing Shared test builders introduced only when duplication exists
docs/adr        Accepted architecture decisions
infra/docker    Local container definitions
```

See [Architecture](docs/architecture.md) for boundaries and data flow. No cloud resource, DNS record, GitHub remote, or deployment is created by this repository.

## Data handling

The public demo is intended for synthetic payloads only. Do not submit employer, customer, credential, personal, or regulated data. The planned v1 retention job removes sensitive delivery history after 30 days; that behavior is implemented and tested in M4.

## License

MIT
