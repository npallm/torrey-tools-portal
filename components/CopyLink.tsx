"use client";

import { useState } from "react";

export function CopyLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded border px-3 py-1 text-xs"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${value}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
