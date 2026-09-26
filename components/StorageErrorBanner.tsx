"use client";

import { useData } from "@/app/DataProvider";
import { Button } from "@/components/FormControls";

const BANNER_STYLE = { background: "var(--color-danger-bg)", color: "var(--color-danger)" } as const;

/**
 * Storage problems, which were previously set on the data context but never
 * displayed. An upgrade notice (close other tabs / reload) has no Dismiss:
 * it describes a problem that is still there, and it goes away on its own
 * once resolved. An ordinary storage error can be dismissed.
 */
export function StorageErrorBanner() {
  const { databaseNotice, storageError, dismissStorageError } = useData();
  if (!databaseNotice && !storageError) return null;
  return (
    <div className="flex flex-col">
      {databaseNotice && (
        <div role="alert" className="px-4 py-3 text-sm font-medium" style={BANNER_STYLE}>
          {databaseNotice}
        </div>
      )}
      {storageError && (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium" style={BANNER_STYLE}>
          <span>{storageError}</span>
          <Button variant="text" onClick={dismissStorageError} className="shrink-0">
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
