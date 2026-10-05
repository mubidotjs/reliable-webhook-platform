"use client";
import { useState } from "react";
import { CopyControl } from "./copy-id";
export function CodeViewer({ value, label }: { value: string; label: string }) {
  const [wrap, setWrap] = useState(false);
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-line">
      <div className="flex flex-wrap items-center justify-between gap-x-4 border-b border-line bg-surface px-4 py-1">
        <p className="text-xs font-medium text-muted">{label}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={wrap}
            onClick={() => setWrap(!wrap)}
            className="min-h-11 rounded-md px-2 text-xs text-muted hover:bg-raised"
          >
            Wrap lines
          </button>
          <CopyControl value={value} label={label} />
        </div>
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className={
          "max-h-96 overflow-auto bg-canvas p-4 text-xs leading-5 text-slate-200 " +
          (wrap ? "whitespace-pre-wrap break-all" : "whitespace-pre")
        }
      >
        <code>{value}</code>
      </pre>
    </div>
  );
}
