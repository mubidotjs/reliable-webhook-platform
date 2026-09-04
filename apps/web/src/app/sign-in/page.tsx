import { ShieldCheck, Webhook } from "lucide-react";
import Link from "next/link";

import { SignInButton } from "@/components/sign-in-button";

export const dynamic = "force-dynamic";

export default function SignInPage(): React.ReactNode {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/90 p-7 shadow-panel sm:p-9">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-3 font-semibold"
        >
          <span className="grid size-9 place-items-center rounded-lg border border-cyan-300/30 bg-cyan-300/10 text-cyan-300">
            <Webhook aria-hidden="true" className="size-5" />
          </span>
          Reliable Webhook Platform
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Sign in to your delivery workspace
        </h1>
        <p className="mt-3 text-base leading-7 text-slate-400">
          GitHub identifies your account. New accounts create one private
          workspace before registering an endpoint.
        </p>
        <div className="mt-8">
          <SignInButton />
        </div>
        <div className="mt-8 flex items-start gap-3 border-t border-slate-800 pt-6 text-sm leading-6 text-slate-500">
          <ShieldCheck
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-cyan-300"
          />
          <p>
            Authentication metadata is minimized. Never submit customer,
            employer, credential, or regulated data to the public demo.
          </p>
        </div>
      </section>
    </main>
  );
}
