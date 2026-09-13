"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4">
      <h1 className="text-xl font-semibold">This view could not be loaded</h1>
      <p className="text-slate-400">
        Try again, or return to the overview. If your session expired, sign in
        again.
      </p>
      <div className="flex gap-4">
        <Button onClick={reset}>Try again</Button>
        <Link href="/dashboard" className="p-3 text-cyan-300">
          Overview
        </Link>
        <Link href="/sign-in" className="p-3 text-cyan-300">
          Sign in
        </Link>
      </div>
    </div>
  );
}
