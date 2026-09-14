"use client";
import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function RefreshDelivery({ active = false }: { active?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!active || pending) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        startTransition(() => router.refresh());
    }, 3000);
    return () => clearInterval(timer);
  }, [active, pending, router]);
  return (
    <div className="my-5 flex flex-wrap items-center gap-4">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? "Refreshing…" : "Refresh"}
      </Button>
      <span className="text-xs text-slate-500">
        {active
          ? "Updates every 3 seconds while this page is visible."
          : "Showing the latest loaded records."}
      </span>
    </div>
  );
}
