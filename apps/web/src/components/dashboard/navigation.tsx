"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, RadioTower, Webhook, Send, BookOpen } from "lucide-react";
const links = [
  ["/dashboard", "Overview", Activity],
  ["/dashboard/deliveries", "Deliveries", Send],
  ["/dashboard/endpoints", "Endpoints", RadioTower],
  ["/dashboard/events", "Events", Webhook],
  ["/dashboard/guide", "Setup guide", BookOpen],
] as const;
export function WorkspaceNavigation() {
  const path = usePathname();
  return (
    <nav
      aria-label="Workspace"
      className="grid grid-cols-2 gap-1 p-3 sm:grid-cols-3 lg:sticky lg:top-0 lg:flex lg:flex-col lg:p-4"
    >
      {links.map(([href, label, Icon]) => {
        const active =
          href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-2.5 rounded-md border-l-2 px-3 text-sm font-medium ${href.endsWith("/guide") ? "lg:mt-6" : ""} ${active ? "border-accent bg-raised text-foreground" : "border-transparent text-muted hover:bg-raised hover:text-foreground"}`}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
