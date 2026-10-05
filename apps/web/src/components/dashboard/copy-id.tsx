"use client";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
export function CopyControl({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  const [message, setMessage] = useState("");
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs text-accent hover:bg-raised"
        aria-label={"Copy " + label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setMessage("Copied");
          } catch {
            setMessage("Clipboard unavailable. Select the text to copy it.");
          }
        }}
      >
        {message === "Copied" ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
        Copy
      </button>
      <span role="status" className="text-xs text-muted">
        {message}
      </span>
    </span>
  );
}
export function CopyId({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-2">
      <code className="min-w-0 break-all text-xs">{value}</code>
      <CopyControl value={value} label={label} />
    </span>
  );
}
