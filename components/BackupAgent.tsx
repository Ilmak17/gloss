"use client";
import { useEffect } from "react";
import { pushBackup } from "@/lib/backup-client";
import { useStore } from "@/lib/store";

/** Opt-in is server-side; no provider key or GitHub credential ever reaches the browser. */
export function BackupAgent() {
  useEffect(() => {
    let stopped = false;
    const backup = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const st = useStore.getState();
      if (!st.hydrated || !st.library.length) return;
      try {
        const config = await fetch("/api/backup").then(r => r.json());
        // First snapshot is manual; automatic snapshots start after it succeeded.
        if (!stopped && config.enabled && config.at) await pushBackup();
      } catch { /* The Backups page shows the persisted error and last successful upload. */ }
    };
    const timer = setInterval(() => void backup(), 5 * 60_000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  return null;
}
