"use client";

import { useEffect, useRef } from "react";
import { Headphones, LoaderCircle, Square, RotateCcw, MessageCircle, Locate, Ellipsis, SlidersHorizontal, ChevronDown } from "lucide-react";
import { blockEl } from "@/lib/anchor";
import { useStore } from "@/lib/store";
import { openVoiceSettings } from "@/lib/voice-settings";
import { useListen, startListening, stopListening, toggleListening, cycleRate, pauseListening, seekListening } from "@/lib/listening";
import { startStudy } from "@/lib/study-draft";
import { studyBlock } from "@/lib/study";
import { barBtn, Popover } from "@/components/ui/Popover";
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

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** One dock for narration and the transition from reading to discussion. */
export function ListenBar({ from }: { from: () => string | null }) {
  const { ix, jumpToBlock, paged, readingPoint, goToPoint, chooseListeningStart, cancelListeningStart } = useReader();
  const { status, block, rate, elapsed, duration, error, needKey, follow, studyPaused, cache } = useListen();
  const on = useStore(s => s.settings.listen);
  const activeGloss = useStore(s => s.activeGloss);
  const pending = useStore(s => s.pending);
  const notebook = useStore(s => s.notebookOpen);
  const setUI = useStore(s => s.setUI);
  const prev = useRef<string | null>(null);

  useEffect(() => () => stopListening(), [ix]);
  useEffect(() => { if (!on) stopListening(); }, [on]);
  useEffect(() => { if (activeGloss || pending || notebook) pauseListening(true); }, [activeGloss, pending, notebook]);
  useEffect(() => {
    if (paged) return;
    if (!block) { prev.current = null; return; }
    if (status !== "playing" || !follow) return;
    setUI({ cursor: block });
    const was = prev.current ? blockEl(prev.current)?.getBoundingClientRect() : null;
    const following = !was || (was.bottom > 0 && was.top < window.innerHeight);
    const r = blockEl(block)?.getBoundingClientRect();
    if (following && r && (r.top < 80 || r.bottom > window.innerHeight * .8)) jumpToBlock(block, { flash: false });
    prev.current = block;
  }, [block, status, follow, jumpToBlock, setUI, paged]);

  const explain = () => {
    const id = studyBlock(ix, block ?? from());
    if (!id) return;
    const quote = (ix.texts.get(id) ?? "").slice(0, 12000);
    if (!quote.trim()) return;
    pauseListening(true);
    startStudy(ix, { action: "explain", anchor: { start: { b: id, o: 0 }, end: { b: id, o: quote.length }, quote } });
  };
  const startHere = () => {
    cancelListeningStart?.();
    setUI({ activeGloss: null, notebookOpen: false, pending: null });
    const point = readingPoint?.();
    useListen.setState({ follow: true });
    startListening(ix, point?.b ?? from(), point?.o ?? 0);
  };
  const active = status !== "idle";
  const n = block ? ix.numbers.get(block) : undefined;

  return <section className={`study-player ${active ? "is-active" : "is-idle"}`} aria-label="Reading player">
    {active && cache === "unavailable" && <div role="status" className="study-player-error">Audio could not be saved. Replaying later may use credits.</div>}
    {error && <div role="alert" className="study-player-error"><p>{error}</p><button type="button" onClick={openVoiceSettings}>{needKey ? "Connect voice" : "Voice settings"}</button></div>}
    <div className="study-player-main">
      {on && <button type="button" className="study-play" aria-label={status === "playing" ? "Pause" : status === "error" ? "Retry audio" : active ? "Resume listening" : "Read aloud"} disabled={status === "loading"} onClick={() => {
        cancelListeningStart?.();
        setUI({ activeGloss: null, notebookOpen: false });
        if (status === "idle") startHere(); else toggleListening();
      }}>{status === "loading" ? <LoaderCircle size={15} className="animate-spin" aria-hidden /> : <svg key={status === "playing" ? "pause" : "play"} className="study-play-glyph" width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        {status === "playing" ? <><rect x="4" y="3" width="2.5" height="10" rx="1.25" fill="currentColor" /><rect x="9.5" y="3" width="2.5" height="10" rx="1.25" fill="currentColor" /></> : <path d="M5 3.5 12 8l-7 4.5z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />}
      </svg>}</button>}
      <div className="study-timeline">
        {active && !error && duration > 0 ? <>
          <input aria-label="Position in current passage" aria-valuetext={`${clock(elapsed)} of ${clock(duration)}`} type="range" min={0} max={duration} step={.1} value={elapsed} onChange={e => seekListening(Number(e.target.value))} style={{ backgroundImage: `linear-gradient(to right, var(--study-accent) ${Math.min(100, elapsed / duration * 100)}%, var(--rule-strong) 0%)` }} />
          <span className="study-time" title={`Current passage${n ? ` · ¶${n}` : ""}${studyPaused ? " · paused for discussion" : ""}`}>{clock(elapsed)}<span> / {clock(duration)}</span></span>
        </> : !active && on && chooseListeningStart ? <div className="listen-start-menu">
          <Popover label="Choose where to listen" trigger={<><span>Listen</span><ChevronDown size={12} /></>} triggerClass="listen-start-trigger" width={230}>
            {close => <div className="study-audio-options">
              <button onClick={() => { close(); startHere(); }}>From current reading position</button>
              <button onClick={() => { close(); chooseListeningStart(); }}>Choose starting point…</button>
              <p className="listen-start-help">Or select text and choose “Listen from here”.</p>
            </div>}
          </Popover>
        </div> : <span className="study-idle-label">{error ? "Audio unavailable" : status === "loading" ? "Preparing audio…" : on ? "Listen" : "Reading"}</span>}
      </div>
      <span className="study-player-divider" aria-hidden />
      <button type="button" className="study-discuss" aria-label="Discuss paragraph" data-tip="Discuss this paragraph" onClick={explain}><MessageCircle size={15} strokeWidth={1.6} /><span>Discuss</span></button>
      <div className="study-player-menu">
        <Popover label="Playback options" trigger={<Ellipsis size={18} />} triggerClass="study-icon" width={244}>
          {close => <div className="study-audio-options">
            <p className="study-audio-heading">Audio{n ? ` · ¶${n}` : ""}</p>
            {active && (cache === "hit" || cache === "saved") && <p className="text-xs text-ink-3 px-2 pb-2">{cache === "hit" ? "Saved audio · no new charge" : "Audio saved on this Mac"}</p>}
            {on && chooseListeningStart && <button type="button" onClick={() => { close(); chooseListeningStart(); }}><Locate size={15} /> Choose starting point…</button>}
            {on && active && <button type="button" onClick={() => { close(); startHere(); }}>From current reading position</button>}
            <button type="button" onClick={cycleRate}><span>Speed</span><strong>{rate}×</strong></button>
            {active && <button type="button" onClick={() => { seekListening(0); close(); }}><RotateCcw size={15} /> Replay passage</button>}
            {block && <button type="button" onClick={() => { useListen.setState({follow:true}); if (goToPoint) goToPoint({b:block,o:useListen.getState().offset}); else jumpToBlock(block, { flash: false }); close(); }}><Locate size={15} /> Jump to audio</button>}
            {on && <label><input type="checkbox" checked={follow} onChange={e => useListen.setState({ follow: e.target.checked })} /> Follow along</label>}
            <div className="study-audio-rule" />
            <button type="button" onClick={() => { close(); openVoiceSettings(); }}><SlidersHorizontal size={15} /> Voice settings</button>
            {active && <button type="button" onClick={() => { stopListening(); close(); }}><Square size={14} /> Stop listening</button>}
          </div>}
        </Popover>
      </div>
    </div>
  </section>;
}
