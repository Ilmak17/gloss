"use client";

import { useEffect, useRef } from "react";
import { Headphones, LoaderCircle, Pause, Play, Square } from "lucide-react";
import { blockEl } from "@/lib/anchor";
import { useStore } from "@/lib/store";
import { openVoiceSettings } from "@/lib/voice-settings";
import { useListen, startListening, stopListening, toggleListening, cycleRate } from "@/lib/listening";
import { barBtn } from "@/components/ui/Popover";
import { useReader } from "./context";
export { startListening, stopListening } from "@/lib/listening";

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
