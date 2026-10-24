"use client";

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { Headphones, LoaderCircle, Pause, Play, Square } from "lucide-react";
import { anchorToRange, blockEl } from "@/lib/anchor";
import { blockText, type Block } from "@/lib/article";
import { readApiKey } from "@/lib/ask";
import type { DocIndex } from "@/lib/doc";
import { useStore } from "@/lib/store";
import { speechChunks, type TimedWord } from "@/lib/speech";
import { openVoiceSettings, readVoiceSettings } from "@/lib/voice-settings";
import { barBtn } from "@/components/ui/Popover";
import { useReader } from "./context";

/**
 * Read aloud. The text is spoken a passage at a time from where you are, each
 * clip fetched a little ahead of the voice, and the paragraph being read is
 * marked like the keyboard cursor so the eye can follow along.
 */

type Status = "idle" | "loading" | "playing" | "paused" | "error";
type ListenState = { status: Status; block: string | null; rate: number; error?: string; needKey?: boolean };

const RATES = [1, 1.2, 1.4, 1.7, 2, 0.8];
const RATE_KEY = "gloss:listen-rate";

const useListen = create<ListenState>(() => ({ status: "idle", block: null, rate: 1 }));

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
let highlightFrame = 0;
let lastHighlight = "";
let idx = 0;
let session = 0;
let audio: HTMLAudioElement | null = null;
let ctrl: AbortController | null = null;
type Clip = { url: string; words: TimedWord[] };
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
      body: JSON.stringify({ text: items[i].text, provider: voice.provider, voiceId: voice.voiceId || undefined, apiKey: (voice.provider === "elevenlabs" ? voice.apiKey : readApiKey()) || undefined }),
      signal,
    }).then(async (r) => {
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string; code?: string };
        throw Object.assign(new Error(j.error ?? "The voice did not answer."), { needKey: j.code === "need_key" });
      }
      let blob: Blob;
      let words: TimedWord[] = [];
      if (r.headers.get("content-type")?.includes("application/json")) {
        const data = await r.json() as { audio: string; words: TimedWord[] };
        blob = new Blob([Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], { type: "audio/mpeg" });
        words = data.words;
      } else blob = await r.blob();
      if (requestSession !== session || signal?.aborted) throw new DOMException("Stopped", "AbortError");
      const url = URL.createObjectURL(blob);
      urls.set(i, url);
      return { url, words };
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
  useListen.setState({ block: items[i].block, needKey: false, error: undefined, ...(ready ? {} : { status: "loading" }) });
  let result: Clip;
  try {
    result = await clip(i);
  } catch (e) {
    if (s === session) useListen.setState({ status: "error", needKey: e instanceof Error && "needKey" in e && Boolean(e.needKey), error: e instanceof Error ? e.message : "The voice did not answer." });
    return;
  }
  if (s !== session || !audio) return;
  void clip(i + 1 < items.length ? i + 1 : i);
  if (i + 2 < items.length) void clip(i + 2);
  release(i - 1);
  activeWords = result.words;
  clearSpeechHighlight();
  audio.src = result.url;
  audio.playbackRate = useListen.getState().rate;
  if (wantedPaused) { useListen.setState({ status: "paused" }); return; }
  try {
    await audio.play();
    if (s === session) useListen.setState({ status: "playing" });
  } catch {
    if (s === session) useListen.setState({ status: "paused" });
  }
}

export function startListening(ix: DocIndex, fromBlock: string | null) {
  stopListening();
  const blocks = ix.article.blocks;
  const at = Math.max(0, fromBlock ? blocks.findIndex((b) => b.id === fromBlock) : 0);
  items = [];
  for (const b of blocks.slice(at)) {
    if (!SPOKEN.has(b.type)) continue;
    const t = blockText(b);
    if (!t) continue;
    for (const c of speechChunks(t)) items.push({ block: b.id, text: c.text, start: c.start });
  }
  if (!items.length) return;

  wantedPaused = false;
  audio ??= new Audio();
  audio.ontimeupdate = highlightSpeech;
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
    navigator.mediaSession.setActionHandler("play", () => toggleListening());
    navigator.mediaSession.setActionHandler("pause", () => toggleListening());
  }
  void playAt(0, s);
}

export function stopListening() {
  session++;
  cancelAnimationFrame(highlightFrame);
  clearSpeechHighlight();
  activeWords = [];
  wantedPaused = false;
  ctrl?.abort();
  ctrl = null;
  if (audio) {
    audio.onended = null;
    audio.ontimeupdate = null;
    audio.onplaying = null;
    audio.onpause = null;
    audio.onerror = null;
    audio.pause();
    audio.removeAttribute("src");
  }
  release(Infinity);
  clips.clear();
  items = [];
  useListen.setState({ status: "idle", block: null, error: undefined, needKey: false });
}

function toggleListening() {
  const { status } = useListen.getState();
  if (!audio) return;
  if (status === "loading") {
    wantedPaused = !wantedPaused;
    return;
  } else if (status === "playing") {
    wantedPaused = true;
    audio.pause();
    useListen.setState({ status: "paused" });
  } else if (status === "paused") {
    wantedPaused = false;
    const s = session;
    audio.play().then(() => { if (s === session) useListen.setState({ status: "playing" }); }).catch(() => {});
  } else if (status === "error") {
    useListen.setState({ error: undefined });
    void playAt(idx, session);
  }
}

function cycleRate() {
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
  if (!audio || !items[idx] || typeof Highlight === "undefined" || !("highlights" in CSS)) return;
  const word = activeWords.find(w => w.from <= audio!.currentTime && w.to > audio!.currentTime);
  if (!word) { clearSpeechHighlight(); return; }
  const key = `${idx}:${word.start}`;
  if (key === lastHighlight) return;
  lastHighlight = key;
  const item = items[idx];
  const range = anchorToRange({ start: { b: item.block, o: item.start + word.start }, end: { b: item.block, o: item.start + word.end } });
  if (range) CSS.highlights.set("speech", new Highlight(range));
}

/* ---------------- the controls ---------------- */

/** In the top bar, only when Listen is on in settings. Starts from the paragraph you are on. */
export function ListenButton({ from }: { from: () => string | null }) {
  const { ix } = useReader();
  const on = useStore((s) => s.settings.listen);
  const status = useListen((s) => s.status);
  if (!on) return null;
  const active = status !== "idle";
  return (
    <button
      type="button"
      className={`${barBtn} ${active ? "bg-sunk text-ink" : ""}`}
      aria-label={active ? "Stop reading aloud" : "Read aloud from here"}
      aria-pressed={active}
      data-tip={active ? "Stop reading aloud" : "Read aloud from here"}
      onClick={() => {
        if (active) return stopListening();
        // The paragraph cursor when it is on screen, otherwise the first paragraph in view.
        const cursor = useStore.getState().cursor;
        const r = cursor ? blockEl(cursor)?.getBoundingClientRect() : null;
        startListening(ix, r && r.bottom > 0 && r.top < window.innerHeight ? cursor : from());
      }}
    >
      <Headphones size={16} strokeWidth={1.8} />
    </button>
  );
}

/** While the voice is reading: a small bar just above the question box, and the cursor on the paragraph being read. */
export function ListenBar() {
  const { ix, jumpToBlock } = useReader();
  const { status, block, rate, error, needKey } = useListen();
  const on = useStore((s) => s.settings.listen);
  const setUI = useStore((s) => s.setUI);
  const prev = useRef<string | null>(null);

  // Leaving the text, or switching Listen off, stops the voice.
  useEffect(() => () => stopListening(), [ix]);
  useEffect(() => {
    if (!on) stopListening();
  }, [on]);

  // Follow the voice, but only while the reader is following too.
  useEffect(() => {
    if (!block) {
      prev.current = null;
      return;
    }
    setUI({ cursor: block });
    const was = prev.current ? blockEl(prev.current)?.getBoundingClientRect() : null;
    const following = !was || (was.bottom > 0 && was.top < window.innerHeight);
    const r = blockEl(block)?.getBoundingClientRect();
    if (following && r && (r.top < 80 || r.bottom > window.innerHeight * 0.8)) jumpToBlock(block, { flash: false });
    prev.current = block;
  }, [block, jumpToBlock, setUI]);

  if (status === "idle") return null;
  const n = block ? ix.numbers.get(block) : undefined;

  return (
    <div
      role="region"
      aria-label="Reading aloud"
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+80px)] left-1/2 sm:bottom-[calc(env(safe-area-inset-bottom)+90px)] z-[46] flex -translate-x-1/2 items-center gap-1 rounded-full bg-lens p-1 text-lens-fg shadow-pop ring-1 ring-black/5"
      style={{ animation: "rise 0.35s var(--ease-out) both" }}
    >
      {!needKey && (
        <button
          type="button"
          onClick={toggleListening}
          disabled={status === "loading"}
          aria-label={status === "playing" ? "Pause" : status === "error" ? "Try again" : "Play"}
          className="grid size-9 place-items-center rounded-full bg-[var(--rubric)] text-white transition-transform active:scale-90"
        >
          {status === "loading" ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : status === "playing" ? (
            <Pause size={15} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={15} fill="currentColor" strokeWidth={0} className="translate-x-px" />
          )}
        </button>
      )}
      {status === "error" ? (
        <>
          <span className={`max-w-[min(360px,60vw)] truncate px-2 text-[13px] ${needKey ? "pl-3.5" : ""}`} title={error}>
            {error}
          </span>
          {needKey && (
            <button
              type="button"
              onClick={() => {
                stopListening();
                openVoiceSettings();
              }}
              className="h-9 shrink-0 rounded-full px-3 text-[13px] font-medium underline decoration-lens-mute underline-offset-4 transition-colors hover:bg-lens-hover"
            >
              Voice settings
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => block && jumpToBlock(block, { flash: false })}
          className="h-9 rounded-full px-2.5 text-[13px] tabular-nums text-lens-fg/85 transition-colors hover:bg-lens-hover hover:text-lens-fg"
          aria-label={n ? `Reading paragraph ${n}. Show it.` : "Show where it is reading"}
        >
          {n ? `Reading ¶${n}` : "Reading"}
        </button>
      )}
      {!needKey && (
        <button
          type="button"
          onClick={cycleRate}
          aria-label={`Speed ${rate} times. Change speed.`}
          className="h-9 min-w-[48px] rounded-full px-2.5 text-[13px] font-medium tabular-nums transition-colors hover:bg-lens-hover"
        >
          {`${rate}×`}
        </button>
      )}
      <button type="button" onClick={stopListening} aria-label="Stop reading aloud" className="grid size-9 place-items-center rounded-full text-lens-fg/80 transition-colors hover:bg-lens-hover hover:text-lens-fg">
        <Square size={13} fill="currentColor" strokeWidth={0} />
      </button>
    </div>
  );
}
