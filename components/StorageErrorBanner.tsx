"use client";

import { useData } from "@/app/DataProvider";

/** Shows storage problems, which were previously set on the data context but never displayed. */
export function StorageErrorBanner() {
  const { storageError } = useData();
  if (!storageError) return null;
  return (
    <div
      role="alert"
      className="px-4 py-3 text-sm font-medium"
      style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)" }}
    >
      {storageError}
    </div>
  );
}
