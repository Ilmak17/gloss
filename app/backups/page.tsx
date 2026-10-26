"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { collectBackup, pushBackup, restoreBackup } from "@/lib/backup-client";
import { parseBackup, type Backup } from "@/lib/backup-format";
import { download } from "@/lib/export";
import { useStore } from "@/lib/store";
import { TopBar } from "@/components/ui/TopBar";

type Status = { enabled?: boolean; repository?: string; at?: string; commit?: string; error?: string; audio?: number; texts?: number };
export default function BackupsPage() {
  const [status, setStatus] = useState<Status>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = async () => setStatus(await fetch("/api/backup").then(r => r.json()).catch(() => ({})));
  useEffect(() => { useStore.getState().hydrate(); void refresh(); }, []);
  async function act(fn: () => Promise<string>) {
    setBusy(true); setMessage("");
    try { setMessage(await fn()); } catch (e) { setMessage(e instanceof Error ? e.message : "Could not finish the backup."); }
    finally { setBusy(false); void refresh(); }
  }
  const saveFile = async () => {
    const backup = await collectBackup();
    download(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), `gloss-backup-${new Date().toISOString().slice(0, 10)}.json`);
  };
  return <><TopBar /><main className="mx-auto max-w-2xl px-6 py-16">
    <Link href="/library" className="text-sm text-ink-3">← Library</Link>
    <h1 className="mt-6 text-4xl font-serif">Your reading, safely kept.</h1>
    <p className="mt-4 text-ink-2">Books, original files, notes, questions, bookmarks, reading positions and preferences. API keys stay on this device.</p>
    <section className="mt-10 rounded-2xl border border-rule p-6">
      <h2 className="text-xl">Private GitHub backup</h2>
      {status.repository && <a className="mt-2 block text-sm underline" href={`https://github.com/${status.repository}`} target="_blank" rel="noreferrer">{status.repository}</a>}
      <p className="mt-4 text-sm text-ink-2">{status.at ? `Last verified upload: ${new Date(status.at).toLocaleString()}. ${status.texts ?? 0} ${status.texts === 1 ? "text" : "texts"} · ${status.audio ?? 0} audio clips.` : "No verified upload yet."}</p>
      <p className="mt-2 text-sm text-ink-3">After the first backup, saves every 5 minutes while Gloss is open and visible. Cached narration is included. Git keeps previous versions.</p>
      {status.error && <p role="alert" className="mt-3">{status.error}</p>}
      <button disabled={busy || !status.enabled} className="mt-5 rounded-full bg-ink px-5 py-2 text-bg disabled:opacity-40" onClick={() => void act(async () => {
        const result = await pushBackup();
        return `Backed up and verified on GitHub · ${result.commit.slice(0, 7)}`;
      })}>{busy ? "Working…" : "Back up now"}</button>
      {!status.enabled && <p className="mt-3 text-sm">GitHub backup is not configured on this computer. You can still download and restore a local copy.</p>}
    </section>
    <section className="mt-6 rounded-2xl border border-rule p-6">
      <h2 className="text-xl">Download or restore</h2>
      <p className="mt-3 text-sm text-ink-2">A portable copy of your library. Cached narration is stored separately in the GitHub repository.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button disabled={busy} className="rounded-full border border-rule px-4 py-2" onClick={() => void act(async () => { await saveFile(); return "Your library copy is ready to download."; })}>Download library</button>
        <button disabled={busy} className="rounded-full border border-rule px-4 py-2" onClick={() => file.current?.click()}>Choose backup to restore</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" className="hidden" onChange={e => {
        const selected = e.target.files?.[0]; e.target.value = "";
        if (selected) void act(async () => {
          setPending(null);
          if (selected.size > 60 * 1024 * 1024) throw new Error("Backup is too large.");
          setPending(await parseBackup(JSON.parse(await selected.text())));
          return "Backup validated. Review the restore below.";
        });
      }} />
      {pending && <div className="mt-6 border-t border-rule pt-5">
        <p>{pending.data.state.library.length} texts · {pending.data.originals.length} original files</p>
        <p className="mt-2 text-sm text-ink-2">Adds missing books and notes. Existing text and edited notes are kept; the newer reading position wins. Appearance is restored only to an empty library. A safety copy of your current library downloads first.</p>
        <button disabled={busy} className="mt-4 rounded-full bg-ink px-5 py-2 text-bg" onClick={() => void act(async () => {
          await saveFile(); const added = await restoreBackup(pending); setPending(null);
          return `Restore complete. ${added} texts added. Open Library to continue.`;
        })}>Restore library</button>
      </div>}
    </section>
    <p role="status" className="mt-5 text-sm" aria-live="polite">{message}</p>
  </main></>;
}
