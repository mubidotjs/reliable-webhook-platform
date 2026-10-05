# Operations UI refresh

## Scope

Refreshed the existing v1 interface without changing backend modules, API contracts, authentication, tenant isolation, routes, delivery/replay semantics, database schema, or dependencies. The application retains its dark-only theme. No synthetic metrics or new product destinations were added.

- Graphite canvas and surfaces, restrained blue actions, semantic status colors, consistent typography, spacing, focus treatment, controls, and tables.
- A 216 px desktop sidebar, persistent responsive navigation, workspace header, skip link, and bounded content widths.
- Real workspace totals and recent deliveries on the overview; direct links to exhausted deliveries and scheduled retries.
- Dense delivery history with status, event/delivery identity, endpoint, latest result, attempts, and UTC timestamps. Secondary filters expand on demand; applied filters are individually removable.
- Delivery outcome first, followed by attempt history, endpoint/lifecycle metadata, and payload. Automatic retries remain distinct from confirmed manual replay.
- An ordered attempt timeline showing HTTP result, duration, error classification, timestamps, and retry transitions. Observed gaps between attempts are not presented as historical scheduling promises.
- Copyable IDs, destinations, and payloads. Payload viewers support bounded scrolling and optional wrapping; the event detail viewer preserves exact stored delivery bytes.
- Compact endpoint/event forms, consistent inline feedback, native confirmation dialogs, and one-time-secret handling. Form disclosures cannot hide an unacknowledged secret or an in-flight submission.
- Consistent empty, loading, error, and missing-record states. Public/sign-in/onboarding/setup screens follow the same visual system; the public page describes the real workflow instead of showing illustrative dashboard metrics.

## Maintenance rules

Foundation tokens live in `apps/web/src/app/globals.css` and `apps/web/tailwind.config.ts`. Existing Tailwind infrastructure and Lucide icons are reused. Status mapping, page headings, time formatting, and basic form styles remain in the existing dashboard component directory; no general-purpose component framework was introduced.

Use explicit status class names so Tailwind includes them in production output. Status always includes text and an icon; color alone never carries the meaning. Keep display labels separate from the unchanged API enum values.

Keep wide data tables inside the positioned `.table-region` scroll container. Its positioning also contains absolutely positioned screen-reader text and prevents page-level overflow on narrow screens. Full technical values remain available on detail pages.

Preserve replay idempotency keys across uncertain responses and re-confirm endpoint changes. Preserve event submission snapshots and producer event IDs across uncertain submissions. UI refactoring must not alter those existing state machines.

## Validation

Validated locally on 2026-10-05. Database-dependent checks used disposable PostgreSQL 17 databases in a dedicated loopback-only Docker container. Existing migrations were applied unchanged; no project environment file or external database was modified. Browser fixtures were isolated to test owners and synthetic records. The application itself has no fixture mode.

| Check                   | Result              |
| ----------------------- | ------------------- |
| `pnpm format:check`     | Passed              |
| `pnpm lint`             | Passed, no warnings |
| `pnpm typecheck`        | Passed              |
| `pnpm openapi:check`    | Passed              |
| `pnpm test`             | 81 tests passed     |
| `pnpm test:integration` | 44 tests passed     |
| `pnpm build`            | Passed              |
| `pnpm test:e2e`         | 27 tests passed     |
| `git diff --check`      | Passed              |

The browser suite retains existing endpoint, event ingestion, tenant-isolation, delivery, pagination, replay, and uncertain-response assertions. Six additional UI tests cover all six delivery statuses, table density, responsive containment, precise URL filter boundaries, replay dialog focus/inert background/Escape behavior, payload escaping and exact copying, clipboard failure, reduced-motion layouts, and supporting routes. Secret rotation and disablement tests now operate the native confirmation dialogs; the secret screenshot is masked.

History was checked at 320, 390, 768, 1024, 1280, and 1440 px. Detail and supporting pages were also checked for narrow-screen containment. Wide tables retain horizontal scrolling on smaller screens rather than dropping operational fields. Screenshots were visually reviewed for history, overview, terminal/retrying/successful delivery details, the replay dialog, mobile details, endpoint creation with a masked secret, endpoints, events, the setup guide, public entry, and sign-in.

Screenshots are generated under the ignored `test-results/` directory by the browser suite, including `refresh-history-desktop.png`, `refresh-history-320.png`, `refresh-exhausted.png`, `refresh-detail-mobile.png`, `refresh-replay-dialog.png`, and `refresh-secret.png`. A subsequent Playwright run may replace this directory.

Keyboard and semantic behavior were checked through browser automation. A manual screen-reader session and cross-browser audit were not performed. Local validation does not replace the existing hosted QStash/production sign-off requirements.
