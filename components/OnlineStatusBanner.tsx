"use client";

import { useEffect, useState } from "react";

export function OnlineStatusBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="border-b px-4 py-2 text-center text-sm font-medium"
      style={{ background: "var(--warn-bg)", borderColor: "var(--warn-border)", color: "var(--warn-foreground)" }}
    >
      Offline — capture and build still work. Odds and player status will use the last saved data.
    </div>
  );
}
