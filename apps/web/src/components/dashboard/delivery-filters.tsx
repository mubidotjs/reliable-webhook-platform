"use client";
import { useRouter } from "next/navigation";
import type { DeliveryQuery } from "@rwp/contracts";
import { Button } from "@/components/ui/button";
import { inputStyle } from "./common";
import { deliveryLabels, endpointLabel } from "./delivery-format";
export function DeliveryFilters({
  query,
  endpoints,
}: {
  query: Partial<DeliveryQuery>;
  endpoints: { id: string; name: string | null; url: string }[];
}) {
  const router = useRouter();
  return (
    <form
      className="mb-6 grid gap-4 rounded-xl border border-slate-800 p-5 sm:grid-cols-2 lg:grid-cols-3"
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
          if (value)
            params.set(
              field,
              value + (field === "from" ? "T00:00:00.000Z" : "T23:59:59.999Z"),
            );
        }
        router.push("/dashboard/deliveries?" + params.toString());
      }}
    >
      <label className="text-sm">
        Delivery or event ID
        <input
          name="search"
          className={inputStyle}
          maxLength={128}
          defaultValue={query.search}
          placeholder="Exact ID"
        />
      </label>
      <div className="text-sm">
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
      <div className="text-sm">
        <label htmlFor="delivery-endpoint">Endpoint</label>
        <input
          id="delivery-endpoint"
          name="endpointId"
          list="endpoint-options"
          className={inputStyle}
          defaultValue={query.endpointId}
          maxLength={64}
          placeholder="Endpoint ID"
        />
        <datalist id="endpoint-options">
          {endpoints.map((e) => (
            <option key={e.id} value={e.id}>
              {endpointLabel(e)}
            </option>
          ))}
        </datalist>
      </div>
      <label className="text-sm">
        Event type
        <input
          name="eventType"
          className={inputStyle}
          defaultValue={query.eventType}
          maxLength={200}
          placeholder="invoice.paid"
        />
      </label>
      <label className="text-sm">
        From date (UTC)
        <input
          name="from"
          type="date"
          className={inputStyle}
          defaultValue={query.from?.slice(0, 10)}
        />
      </label>
      <label className="text-sm">
        Through date (UTC)
        <input
          name="to"
          type="date"
          className={inputStyle}
          defaultValue={query.to?.slice(0, 10)}
        />
      </label>
      <div className="flex items-center gap-4">
        <Button>Apply filters</Button>
        <a
          href="/dashboard/deliveries"
          className="text-sm text-cyan-300 underline"
        >
          Clear filters
        </a>
      </div>
    </form>
  );
}
