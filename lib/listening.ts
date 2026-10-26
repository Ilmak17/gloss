"use client";

import { create } from "zustand";
import { anchorToRange } from "./anchor";
import { blockText, type Block } from "./article";
import { readApiKey } from "./ask";
import type { DocIndex } from "./doc";
import { speechChunks, type TimedWord } from "./speech";
import { readVoiceSettings } from "./voice-settings";

/**
 * Read aloud. The text is spoken a passage at a time from where you are, each
 * clip fetched only when needed, and the paragraph being read is
 * marked like the keyboard cursor so the eye can follow along.
 */

type Status = "idle" | "loading" | "playing" | "paused" | "error";
type ListenState = { status: Status; block: string | null; offset: number; rate: number; elapsed: number; duration: number; studyPaused: boolean; follow: boolean; error?: string; needKey?: boolean; cache?: string };

const RATES = [1, 1.2, 1.4, 1.7, 2, 0.8];
const RATE_KEY = "gloss:listen-rate";

export const useListen = create<ListenState>(() => ({ status: "idle", block: null, offset: 0, rate: 1, elapsed: 0, duration: 0, studyPaused: false, follow: true }));

const SPOKEN = new Set<Block["type"]>(["p", "h2", "h3", "quote", "li", "note"]);

/** A few hundred milliseconds of silence, played inside the click so phones let the voice play later. */
function silence(): string {
  const n = 800;
  const b = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  b.setUint32(4, 36 + n * 2, true);
  str(8, "WAVEfmt ");
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, 1, true);
  b.setUint32(24, 8000, true);
  b.setUint32(28, 16000, true);
  b.setUint16(32, 2, true);
  b.setUint16(34, 16, true);
  str(36, "data");
  b.setUint32(40, n * 2, true);
  let bin = "";
  new Uint8Array(b.buffer).forEach((x) => (bin += String.fromCharCode(x)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/* ---------------- the engine: one voice at a time ---------------- */

let items: { block: string; text: string; start: number }[] = [];
let activeWords: TimedWord[] = [];
let wantedPaused = false;
let studySession: number | null = null;
let highlightFrame = 0;
let lastHighlight = "";
let idx = 0;
let initialOffset = 0;
let pendingSeek: number | null = null;
let session = 0;
let audio: HTMLAudioElement | null = null;
let ctrl: AbortController | null = null;
type Clip = { url: string; words: TimedWord[]; cache?: string };
const clips = new Map<number, Promise<Clip>>();
const urls = new Map<number, string>();

function clip(i: number): Promise<Clip> {
  let p = clips.get(i);
  if (!p) {
    const signal = ctrl?.signal;
    const requestSession = session;
    const voice = readVoiceSettings();
    p = fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: items[i].text, provider: voice.provider, voiceId: voice.voiceId || undefined, apiKey: (voice.provider === "together" ? readApiKey() : voice.apiKey) || undefined }),
      signal,
    }).then(async (r) => {
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; code?: string };
        throw Object.assign(new Error(j.error ?? "The voice did not answer."), { needKey: j.code === "need_key" });
      }
      let blob: Blob;
      let words: TimedWord[] = [];
      let cache: string | undefined;
      if (r.headers.get("content-type")?.includes("application/json")) {
        const data = await r.json() as { audio: string; words: TimedWord[]; cache?: string };
        blob = new Blob([Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], { type: "audio/mpeg" });
        words = data.words;
        cache = data.cache;
      } else blob = await r.blob();
      if (requestSession !== session || signal?.aborted) throw new DOMException("Stopped", "AbortError");
      const url = URL.createObjectURL(blob);
      urls.set(i, url);
      return { url, words, cache };
    });
    // A failed clip is forgotten, so "Try again" fetches it afresh.
    p.catch(() => clips.get(i) === p && clips.delete(i));
    clips.set(i, p);
  }
  return p;
}

function release(upTo: number) {
  for (const [i, url] of urls) {
    if (i < upTo) {
      URL.revokeObjectURL(url);
      urls.delete(i);
      clips.delete(i);
    }
  }
}

async function playAt(i: number, s: number) {
  if (s !== session || !audio) return;
  if (i >= items.length) return stopListening();
  idx = i;
  const ready = urls.has(i);
  useListen.setState({ block: items[i].block, offset: i === 0 ? Math.max(items[i].start, initialOffset) : items[i].start, elapsed: 0, duration: 0, cache: undefined, needKey: false, error: undefined, ...(ready ? {} : { status: "loading" }) });
  let result: Clip;
  try {
    result = await clip(i);
  } catch (e) {
    if (s === session) useListen.setState({ status: "error", needKey: e instanceof Error && "needKey" in e && Boolean(e.needKey), error: e instanceof Error ? e.message : "The voice did not answer." });
    return;
  }
  if (s !== session || !audio) return;
  // Fetch only the requested passage: no credits spent on unread paragraphs.
  useListen.setState({ cache: result.cache });
  release(i - 1);
  activeWords = result.words;
  clearSpeechHighlight();
  const target = i === 0 ? initialOffset - items[i].start : 0;
  const firstWord = result.words.find(w => w.end > target);
  pendingSeek = target > 0 && firstWord ? firstWord.from : 0;
  audio.src = result.url;
  audio.playbackRate = useListen.getState().rate;
  if (wantedPaused) { useListen.setState({ status: "paused" }); return; }
  try {
    await audio.play();
    if (s === session) {
      if (wantedPaused) audio.pause();
      useListen.setState({ status: wantedPaused ? "paused" : "playing" });
    }
  } catch {
    if (s === session) useListen.setState({ status: "paused" });
  }
}

export function startListening(ix: DocIndex, fromBlock: string | null, fromOffset = 0) {
  stopListening();
  initialOffset = Math.max(0, fromOffset);
  const blocks = ix.article.blocks;
  const at = Math.max(0, fromBlock ? blocks.findIndex((b) => b.id === fromBlock) : 0);
  items = [];
  for (const b of blocks.slice(at)) {
    if (!SPOKEN.has(b.type)) continue;
    const t = blockText(b);
    if (!t) continue;
    for (const c of speechChunks(t)) {
      if (b.id === fromBlock && c.start + c.text.length <= initialOffset) continue;
      items.push({ block: b.id, text: c.text, start: c.start });
    }
  }
  if (!items.length) return;
  if (items[0].block !== fromBlock) initialOffset = 0;

  wantedPaused = false;
  audio ??= new Audio();
  audio.ontimeupdate = () => { updatePosition(); highlightSpeech(); };
  audio.onloadedmetadata = () => {
    if (audio?.src.startsWith("blob:") && pendingSeek !== null) { audio.currentTime = pendingSeek; pendingSeek = null; }
    updatePosition(); highlightSpeech();
  };
  audio.ondurationchange = updatePosition;
  audio.onplaying = () => { cancelAnimationFrame(highlightFrame); followSpeech(); };
  audio.onpause = () => cancelAnimationFrame(highlightFrame);
  audio.onerror = () => useListen.setState({ status: "error", error: "This audio could not be played. Try again." });
  // Only a spoken clip ending moves on; the unlocking silence ending must not.
  audio.onended = () => audio?.src.startsWith("blob:") && void playAt(idx + 1, session);
  // Unlock playback inside the click: later clips arrive after an await.
  audio.src = silence();
  audio.play().catch(() => {});

  ctrl = new AbortController();
  const s = ++session;
  try {
    const r = Number(localStorage.getItem(RATE_KEY));
    if (RATES.includes(r)) useListen.setState({ rate: r });
  } catch {}
  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: ix.article.title, artist: ix.article.author ?? ix.article.source ?? "Gloss" });
    navigator.mediaSession.setActionHandler("play", () => resumeListening());
    navigator.mediaSession.setActionHandler("pause", () => pauseListening());
  }
  void playAt(0, s);
}

export function stopListening() {
  session++;
  cancelAnimationFrame(highlightFrame);
  clearSpeechHighlight();
  activeWords = [];
  pendingSeek = null;
  initialOffset = 0;
  wantedPaused = false;
  studySession = null;
  ctrl?.abort();
  ctrl = null;
  if (audio) {
    audio.onended = null;
    audio.ontimeupdate = null;
    audio.onloadedmetadata = null;
    audio.ondurationchange = null;
    audio.onplaying = null;
    audio.onpause = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
  }
  release(Infinity);
  clips.clear();
  items = [];
  useListen.setState({ status: "idle", block: null, offset: 0, elapsed: 0, duration: 0, studyPaused: false, error: undefined, needKey: false, cache: undefined });
}

/** Pause is idempotent, including while the first clip is still being fetched. */
export function pauseListening(forStudy = false) {
  const { status } = useListen.getState();
  if (!audio || !["playing", "loading", "paused"].includes(status)) return;
  if (forStudy && !wantedPaused && (status === "playing" || status === "loading")) studySession = session;
  if (!forStudy) studySession = null;
  wantedPaused = true;
  audio.pause();
  useListen.setState({ studyPaused: studySession === session, ...(status === "loading" ? {} : { status: "paused" }) });
}

export function resumeListening() {
  const { status } = useListen.getState();
  if (!audio || (status !== "paused" && status !== "loading")) return;
  wantedPaused = false;
  studySession = null;
  useListen.setState({ studyPaused: false });
  if (status === "loading") return;
  const s = session;
  audio.play().then(() => {
    if (s !== session || !audio) return;
    if (wantedPaused) audio.pause();
    useListen.setState({ status: wantedPaused ? "paused" : "playing" });
  }).catch(() => {});
}

/** Only resume a session interrupted by studying; never start a new voice. */
export function resumeAfterStudy() {
  if (studySession === session) resumeListening();
}

function updatePosition() {
  if (!audio || !audio.src.startsWith("blob:")) return;
  useListen.setState({ elapsed: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
}

export function seekListening(seconds: number) {
  if (!audio || !audio.src.startsWith("blob:") || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.max(0, Math.min(audio.duration, seconds));
  updatePosition();
  highlightSpeech();
}

export function toggleListening() {
  const { status } = useListen.getState();
  if (!audio) return;
  if (status === "loading") {
    if (wantedPaused) resumeListening(); else pauseListening();
    return;
  } else if (status === "playing") {
    pauseListening();
  } else if (status === "paused") {
    resumeListening();
  } else if (status === "error") {
    useListen.setState({ error: undefined });
    void playAt(idx, session);
  }
}

export function cycleRate() {
  const { rate } = useListen.getState();
  const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
  useListen.setState({ rate: next });
  if (audio) audio.playbackRate = next;
  try {
    localStorage.setItem(RATE_KEY, String(next));
  } catch {}
}

/** CSS highlights leave annotation spans and text selection untouched. */
function clearSpeechHighlight() {
  lastHighlight = "";
  if (typeof CSS !== "undefined" && "highlights" in CSS) CSS.highlights.delete("speech");
}
function followSpeech() {
  highlightSpeech();
  if (audio && !audio.paused) highlightFrame = requestAnimationFrame(followSpeech);
}
function highlightSpeech() {
  if (!audio || !items[idx]) return;
  const word = activeWords.find(w => w.from <= audio!.currentTime && w.to > audio!.currentTime);
  if (!word) { clearSpeechHighlight(); return; }
  const item = items[idx];
  const offset = item.start + word.start;
  if (useListen.getState().offset !== offset) useListen.setState({ offset });
  if (typeof Highlight === "undefined" || typeof CSS === "undefined" || !("highlights" in CSS)) return;
  const key = `${idx}:${word.start}`;
  if (key === lastHighlight) return;

  const range = anchorToRange({ start: { b: item.block, o: item.start + word.start }, end: { b: item.block, o: item.start + word.end } });
  if (range) { CSS.highlights.set("speech", new Highlight(range)); lastHighlight = key; }
}


/** Identity only: lets navigation restore follow for the same playback session. */
export function listeningSessionId(): number { return session; }
