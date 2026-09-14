import { requireDashboardWorkspace } from "@/modules/dashboard/session";
import { PageHeading, RecordLink, panel } from "@/components/dashboard/common";
const example = `// Node.js: read the request as bytes before parsing JSON.
const key = Buffer.from(process.env.WEBHOOK_SIGNING_SECRET.slice(6), "base64url");
const eventId = request.headers["webhook-id"];
const timestamp = request.headers["webhook-timestamp"];
const signature = request.headers["webhook-signature"];
// Validate headers, reject timestamps more than 5 minutes from now,
// and compare in constant time. The complete tested example includes these checks.
const expected = "v1=" + createHmac("sha256", key)
  .update(eventId + "." + timestamp + ".")
  .update(rawBody)
  .digest("base64url");
// Only return 2xx after verification and durable processing/deduplication.`;
export default async function GuidePage() {
  await requireDashboardWorkspace();
  return (
    <>
      <PageHeading
        title="Add and verify a webhook"
        description="A webhook endpoint is your receiving service. This platform sends signed HTTP requests to it; QStash schedules those requests behind the scenes."
      />
      <div className="space-y-5">
        <section className={panel}>
          <h2 className="text-lg font-semibold">
            1. Prepare your HTTPS receiver
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Use a public HTTPS route you control, such as
            https://your-service.example/webhooks. It must accept POST requests
            and respond within five seconds. Your workspace domain opens this
            dashboard; the QStash API URL is a queue service. Neither is
            automatically your receiving endpoint.
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            A complete Node.js example is included in
            apps/receiver/src/verified-example.ts. Run it with the command below
            and expose port 4001 through your own HTTPS reverse proxy. localhost
            cannot be registered as a production destination.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs">
            {
              "# Set WEBHOOK_SIGNING_SECRET in your environment after step 2\npnpm --filter @rwp/receiver dev:verified"
            }
          </pre>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">
            2. Register the URL and save the secret
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Open <RecordLink href="/dashboard/endpoints">Endpoints</RecordLink>,
            enter your receiver URL, and select Create endpoint. Copy the
            one-time signing secret to WEBHOOK_SIGNING_SECRET in your receiving
            service. Never put it in frontend code. If you lose it, rotate the
            secret from endpoint details.
          </p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">
            3. Verify signatures in your receiver
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Remove the whsec_ prefix and base64url-decode the secret. Verify
            HMAC-SHA256 over eventId.timestamp.rawBody, using the three webhook
            headers and the exact unparsed request bytes. Reject stale
            timestamps and compare the complete v1= signature in constant time.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-6 text-slate-300">
            {example}
          </pre>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            The complete example validates headers, enforces a five-minute
            timestamp tolerance, and stores receipts in SQLite to deduplicate
            event IDs across restarts. When adding business logic, commit that
            update and the deduplication record together. During secret
            rotation, retain previous verification keys until their in-flight
            deliveries finish.
          </p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">
            4. Send a synthetic test event
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Open <RecordLink href="/dashboard/events">Events</RecordLink>,
            choose your endpoint, enter an event type and JSON payload, then
            select Send event. Leave Event ID blank to generate one. If the
            submission response is lost, use Retry same event to avoid a second
            delivery.
          </p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">
            5. Confirm delivery and receiver verification
          </h2>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            The delivery page updates automatically while work is active.
            SUCCEEDED means your receiver returned 2xx. Check your receiver logs
            or stored receipt to confirm it verified the signature. A green
            delivery badge alone cannot prove your receiver performed that
            check.
          </p>
        </section>
        <section className={panel}>
          <h2 className="text-lg font-semibold">If something fails</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
            <li>
              <strong className="text-slate-200">PENDING:</strong> accepted,
              waiting for dispatch. Check the local worker or hosted QStash
              configuration and recovery schedule if it persists.
            </li>
            <li>
              <strong className="text-slate-200">RETRY SCHEDULED:</strong>{" "}
              inspect the failure and next attempt time. Transient errors retry
              automatically.
            </li>
            <li>
              <strong className="text-slate-200">EXHAUSTED:</strong> a permanent
              failure, five-attempt limit, or 24-hour retry deadline was
              reached. Fix your receiver before creating a new event.
            </li>
            <li>
              <strong className="text-slate-200">CANCELLED:</strong> the
              endpoint was disabled before another attempt.
            </li>
            <li>
              <strong className="text-slate-200">Destination rejected:</strong>{" "}
              use public HTTPS on port 443 without URL credentials, fragments,
              or private IP addresses.
            </li>
            <li>
              <strong className="text-slate-200">Submission rejected:</strong>{" "}
              check JSON syntax, event ID conflicts, enabled endpoint status,
              and daily quotas (25 per workspace, 100 globally).
            </li>
            <li>
              <strong className="text-slate-200">UNCERTAIN:</strong> the
              receiver may have received a request before the worker stopped.
              Deduplicate event IDs; delivery is at least once.
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
