"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeliveryQuery } from "@rwp/contracts";
import { Button } from "@/components/ui/button";
import { inputStyle } from "./common";
import { deliveryLabels, endpointLabel } from "./delivery-format";
const fields = [
  "search",
  "status",
  "endpointId",
  "eventType",
  "from",
  "to",
] as const;
const names = {
  search: "ID",
  status: "Status",
  endpointId: "Endpoint",
  eventType: "Event type",
  from: "From",
  to: "Through",
};
export function DeliveryFilters({
  query,
  endpoints,
}: {
  query: Partial<DeliveryQuery>;
  endpoints: { id: string; name: string | null; url: string }[];
}) {
  const router = useRouter();
  const active = fields.filter((field) => query[field]);
  function remove(field: (typeof fields)[number]) {
    const params = new URLSearchParams();
    for (const key of fields)
      if (key !== field && query[key]) params.set(key, String(query[key]));
    if (query.limit && query.limit !== 25)
      params.set("limit", String(query.limit));
    return (
      "/dashboard/deliveries" + (params.size ? "?" + params.toString() : "")
    );
  }
  return (
    <form
      className="mb-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        for (const field of ["search", "status", "endpointId", "eventType"]) {
          const value = String(data.get(field) || "").trim();
          if (value) params.set(field, value);
        }
        for (const field of ["from", "to"]) {
          const value = String(data.get(field) || "");
          if (value) {
            // Retain precise externally supplied timestamps when the displayed day was not edited.
            const original = query[field as "from" | "to"];
            params.set(
              field,
              original?.slice(0, 10) === value
                ? original
                : value +
                    (field === "from" ? "T00:00:00.000Z" : "T23:59:59.999Z"),
            );
          }
        }
        if (query.limit && query.limit !== 25)
          params.set("limit", String(query.limit));
        router.push("/dashboard/deliveries?" + params.toString());
      }}
    >
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
        <label className="text-xs text-muted">
          Delivery or event ID
          <input
            name="search"
            className={inputStyle}
            maxLength={128}
            defaultValue={query.search}
            placeholder="Exact delivery or event ID"
          />
        </label>
        <div className="text-xs text-muted">
          <label htmlFor="delivery-status">Status</label>
          <select
            id="delivery-status"
            name="status"
            className={inputStyle}
            defaultValue={query.status || ""}
          >
            <option value="">All statuses</option>
            {Object.entries(deliveryLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Apply filters</Button>
      </div>
      <details
        className="group"
        open={
          Boolean(
            query.endpointId || query.eventType || query.from || query.to,
          ) || undefined
        }
      >
        <summary className="w-fit rounded px-1 py-2 text-sm text-muted">
          More filters
        </summary>
        <div className="grid grid-cols-1 gap-3 border-t border-line py-3 sm:grid-cols-2 xl:grid-cols-4">
          <label htmlFor="delivery-endpoint" className="text-xs text-muted">
            Endpoint
            <input
              id="delivery-endpoint"
              name="endpointId"
              list="endpoint-options"
              className={inputStyle}
              defaultValue={query.endpointId}
              maxLength={64}
              placeholder="Endpoint ID"
            />
          </label>
          <datalist id="endpoint-options">
            {endpoints.map((e) => (
              <option key={e.id} value={e.id}>
                {endpointLabel(e)}
              </option>
            ))}
          </datalist>
          <label className="text-xs text-muted">
            Event type
            <input
              name="eventType"
              className={inputStyle}
              defaultValue={query.eventType}
              maxLength={200}
              placeholder="invoice.paid"
            />
          </label>
          <label className="text-xs text-muted">
            From date (UTC)
            <input
              name="from"
              type="date"
              className={inputStyle}
              defaultValue={query.from?.slice(0, 10)}
            />
          </label>
          <label className="text-xs text-muted">
            Through date (UTC)
            <input
              name="to"
              type="date"
              className={inputStyle}
              defaultValue={query.to?.slice(0, 10)}
            />
          </label>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        {active.map((field) => (
          <Link
            key={field}
            href={remove(field)}
            aria-label={"Remove " + names[field] + " filter"}
            className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-md border border-line bg-surface px-3 text-xs hover:bg-raised"
          >
            <span className="truncate">
              {names[field]}:{" "}
              {field === "status"
                ? deliveryLabels[query.status!]
                : String(query[field])}
            </span>
            <span aria-hidden="true">×</span>
          </Link>
        ))}
        <Link
          href="/dashboard/deliveries"
          className="inline-flex min-h-9 items-center text-sm text-accent underline underline-offset-4"
        >
          Clear filters
        </Link>
      </div>
    </form>
  );
}
