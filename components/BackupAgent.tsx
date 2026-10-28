"use client";
import { useEffect } from "react";
import { pushBackup } from "@/lib/backup-client";
import { useStore } from "@/lib/store";

/**
 * Opt-in is server-side; no provider key or GitHub credential ever reaches the browser.
 * One open tab backs up; the others wait their turn and take over when it closes.
 */
export function BackupAgent() {
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setInterval> | undefined, leave = () => {};
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
    const start = () => { if (!stopped) timer = setInterval(() => void backup(), 5 * 60_000); };
    if (navigator.locks) {
      // Held for as long as this tab is open; released when it closes or this effect ends.
      void navigator.locks.request("gloss:backup", () => new Promise<void>(release => {
        leave = release;
        if (stopped) release(); else start();
      })).catch(() => {});
    } else start();
    return () => { stopped = true; clearInterval(timer); leave(); };
  }, []);
  return null;
}
