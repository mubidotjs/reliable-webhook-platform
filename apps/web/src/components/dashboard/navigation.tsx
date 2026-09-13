"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, RadioTower, Webhook, Send, BookOpen } from "lucide-react";
const links = [
  ["/dashboard", "Overview", Activity],
  ["/dashboard/endpoints", "Endpoints", RadioTower],
  ["/dashboard/events", "Events", Webhook],
  ["/dashboard/deliveries", "Deliveries", Send],
  ["/dashboard/guide", "Setup guide", BookOpen],
] as const;
export function WorkspaceNavigation() {
  const path = usePathname();
  return (
    <nav
      aria-label="Workspace"
      className="flex gap-2 overflow-x-auto p-3 lg:flex-col lg:p-5"
    >
      {links.map(([href, label, Icon]) => {
        const active =
          href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${active ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}
          >
            <Icon aria-hidden="true" className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
