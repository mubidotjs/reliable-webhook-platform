export const deliveryLabels: Record<string, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  RETRY_SCHEDULED: "Retry scheduled",
  SUCCEEDED: "Succeeded",
  EXHAUSTED: "Exhausted",
  CANCELLED: "Cancelled",
};
export function duration(value: number | null | undefined) {
  return value == null
    ? "—"
    : value < 1000
      ? `${value} ms`
      : `${(value / 1000).toFixed(1)} s`;
}
export function failureDescription(
  code: string | null | undefined,
  http?: number | null,
): string {
  const known: Record<string, string> = {
    TIMEOUT: "Destination did not respond within 5 seconds",
    NETWORK: "Unable to connect to destination",
    DESTINATION_POLICY: "Destination rejected by the network safety policy",
    KEY_UNAVAILABLE: "Signing configuration unavailable",
    UNCERTAIN:
      "The worker stopped before saving a definitive outcome. The destination may have received this attempt.",
    ATTEMPT_LIMIT: "Maximum retry policy reached",
    RETRY_WINDOW_EXPIRED: "The retry window expired",
    ENDPOINT_DISABLED: "Endpoint disabled",
  };
  if (code && known[code]) return known[code];
  const status =
    http ?? (code?.startsWith("HTTP_") ? Number(code.slice(5)) : null);
  if (status === 429) return "Destination rate limited the request";
  if (status && status >= 500) return "Destination server error";
  if (status && status >= 400) return "Destination rejected the request";
  if (status && status >= 300)
    return "Destination returned a redirect; redirects are not followed";
  return code
    ? "Delivery could not be completed"
    : status && status >= 200 && status < 300
      ? "Destination accepted the request"
      : "No failure recorded";
}
export function endpointLabel(endpoint: { name?: string | null; url: string }) {
  return endpoint.name || new URL(endpoint.url).hostname;
}
