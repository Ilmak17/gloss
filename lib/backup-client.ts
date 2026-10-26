"use client";
import { makeBackup, parseBackup, safeSettings, mergeReadingState, type Backup, type BackupData } from "./backup-format";
import { loadDoc, loadPdf, useStore, restoreDocuments } from "./store";
import { readVoiceSettings, saveVoiceSettings } from "./voice-settings";
import { SAMPLES } from "./samples";
import { applySettings } from "./settings";

async function encode(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
export async function collectBackup(): Promise<Backup> {
  const st = useStore.getState();
  if (!st.hydrated) throw new Error("The library is still loading.");
  const state = structuredClone({ library: st.library, glosses: st.glosses, highlights: st.highlights, briefs: st.briefs, progress: st.progress });
  const ids = [...new Set([...state.library.map(x => x.id), ...Object.keys(state.glosses), ...Object.keys(state.highlights), ...Object.keys(state.progress)])].sort();
  const docs: BackupData["docs"] = [], originals: BackupData["originals"] = [], bookmarks: BackupData["bookmarks"] = {};
  for (const id of ids) {
    const doc = await loadDoc(id) ?? SAMPLES.find(x => x.id === id);
    if (!doc) {
      if (state.library.some(x => x.id === id)) throw new Error(`Cannot back up missing text: ${id}. Open it first and retry.`);
      // Deleted test texts may leave positions or notes. Preserve those records without fabricating a document.
      continue;
    }
    docs.push(doc);
    const original = await loadPdf(id);
    if (original) originals.push({ id, type: original.type, base64: await encode(original) });
    const raw = localStorage.getItem(`gloss:bookmarks:${id}`);
    if (raw) bookmarks[id] = JSON.parse(raw);
  }
  const voice = readVoiceSettings();
  const prefs = JSON.parse(localStorage.getItem("gloss:library") || "null");
  const rate = Number(localStorage.getItem("gloss:listen-rate")) || 1;
  return makeBackup({ state, docs, originals, bookmarks, settings: safeSettings(st.settings), preferences: {
    rate, voice: { provider: voice.provider, voiceId: voice.voiceId },
    ...(prefs ? { library: { paintedCovers: !!prefs.paintedCovers, hiddenSamples: prefs.hiddenSamples ?? [] } } : {}),
  } });
}
export async function restoreBackup(input: unknown) {
  const backup = await parseBackup(input);
  const st = useStore.getState();
  const fresh = st.library.length === 0;
  const merged = mergeReadingState(st, backup.data.state);
  // Check localStorage space before changing IndexedDB; preserve existing books and originals.
  const stateJson = JSON.stringify(merged);
  localStorage.setItem("gloss:restore-check", stateJson);
  localStorage.removeItem("gloss:restore-check");
  const docs = [];
  const originals = [];
  for (const doc of backup.data.docs) if (!await loadDoc(doc.id)) docs.push(doc);
  for (const f of backup.data.originals) if (!await loadPdf(f.id)) originals.push({ id: f.id, blob: new Blob([Uint8Array.from(atob(f.base64), c => c.charCodeAt(0))], { type: f.type }) });
  await restoreDocuments(docs, originals);
  for (const [id, list] of Object.entries(backup.data.bookmarks)) {
    const current = JSON.parse(localStorage.getItem(`gloss:bookmarks:${id}`) || "[]") as typeof list;
    const all = [...current, ...list.filter(x => !current.some(y => x.point.b === y.point.b && x.point.o === y.point.o))];
    localStorage.setItem(`gloss:bookmarks:${id}`, JSON.stringify(all));
  }
  localStorage.setItem("gloss:v1", stateJson);
  useStore.setState(merged);
  if (fresh) {
    st.setSettings(safeSettings(backup.data.settings));
    applySettings(useStore.getState().settings);
    const p = backup.data.preferences;
    if (p.library) localStorage.setItem("gloss:library", JSON.stringify(p.library));
    if (p.rate) localStorage.setItem("gloss:listen-rate", String(p.rate));
    if (p.voice && ["kokoro", "elevenlabs", "together"].includes(p.voice.provider)) {
      const provider = p.voice.provider as "kokoro" | "elevenlabs" | "together";
      saveVoiceSettings({ provider, voiceId: p.voice.voiceId, apiKey: readVoiceSettings(provider).apiKey });
    }
  }
  return docs.length;
}

let running: Promise<{ at: string; commit: string; repository: string; audio: number }> | null = null;
export function pushBackup() {
  if (running) return running;
  running = (async () => {
    const snapshot = await collectBackup();
    const res = await fetch("/api/backup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error ?? "Backup failed.");
    return result;
  })().finally(() => { running = null; });
  return running;
}
