import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { ArrowRight, Webhook } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default async function HomePage(): Promise<React.ReactNode> {
  if (await getCurrentSession()) redirect("/dashboard");
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3 font-semibold"
          >
            <Webhook
              className="size-6 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>Reliable Webhook Platform</span>
          </Link>
          <Button asChild variant="secondary">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
        <p className="mb-4 text-sm font-medium text-accent">
          Durable delivery. Inspectable outcomes.
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Delivery failures should be explainable—and recoverable.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-muted">
          Register your HTTPS receiver, send a signed webhook, and follow every
          attempt from acceptance through retry or final outcome.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button asChild>
            <Link href="/sign-in">
              Open workspace
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <span className="text-sm text-muted">
            Sign in with GitHub. Create one private workspace.
          </span>
        </div>
        <section
          className="mt-16 border-y border-line py-8"
          aria-labelledby="workflow"
        >
          <h2 id="workflow" className="text-lg font-semibold">
            From event to outcome
          </h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {[
              [
                "01",
                "Configure a receiver",
                "Register a public HTTPS endpoint and save its one-time signing secret.",
              ],
              [
                "02",
                "Send an event",
                "Acceptance commits the event and delivery work durably before dispatch.",
              ],
              [
                "03",
                "Inspect and recover",
                "Follow immutable attempts, scheduled retries, and confirmed manual replays.",
              ],
            ].map(([number, title, text]) => (
              <li key={number}>
                <span className="font-mono text-xs text-muted">{number}</span>
                <h3 className="mt-2 font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-8 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="font-semibold">
              Built for honest delivery semantics
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              At-least-once delivery with signed payloads, bounded retries, and
              auditable recovery. Receivers must verify signatures and
              deduplicate events. An accepted event is not yet a successful
              delivery.
            </p>
          </div>
          <div>
            <h2 className="font-semibold">
              A workspace for operational clarity
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Inspect HTTP results, timing, failure classifications, and the
              relationship between an original delivery and its replay. Use
              synthetic data in this public demo.
            </p>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 px-4 py-6 text-xs text-muted sm:px-6">
          <span>Reliable Webhook Platform</span>
          <Link
            href="/api/health/live"
            className="text-accent underline underline-offset-4"
          >
            Process liveness endpoint
          </Link>
        </div>
      </footer>
    </div>
  );
}
