"use client";
import { useState } from "react";
export function CopyId({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-2">
      <code className="break-all text-xs">{value}</code>
      <button
        type="button"
        className="rounded px-2 py-1 text-xs text-cyan-300 focus-visible:outline focus-visible:outline-2"
        aria-label={"Copy " + label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setMessage("Copied");
          } catch {
            setMessage("Select the ID to copy it.");
          }
        }}
      >
        Copy
      </button>
      <span role="status" className="text-xs text-slate-400">
        {message}
      </span>
    </span>
  );
}
