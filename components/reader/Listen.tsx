"use client";

import { useEffect, useRef } from "react";
import { Headphones, LoaderCircle, Pause, Play, Square, RotateCcw, MessageCircle, Locate, Ellipsis, SlidersHorizontal } from "lucide-react";
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
  const { ix, jumpToBlock } = useReader();
  const { status, block, rate, elapsed, duration, error, needKey, follow, studyPaused } = useListen();
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
    if (!block) { prev.current = null; return; }
    if (status !== "playing" || !follow) return;
    setUI({ cursor: block });
    const was = prev.current ? blockEl(prev.current)?.getBoundingClientRect() : null;
    const following = !was || (was.bottom > 0 && was.top < window.innerHeight);
    const r = blockEl(block)?.getBoundingClientRect();
    if (following && r && (r.top < 80 || r.bottom > window.innerHeight * .8)) jumpToBlock(block, { flash: false });
    prev.current = block;
  }, [block, status, follow, jumpToBlock, setUI]);

  const explain = () => {
    const id = studyBlock(ix, block ?? from());
    if (!id) return;
    const quote = (ix.texts.get(id) ?? "").slice(0, 12000);
    if (!quote.trim()) return;
    pauseListening(true);
    startStudy(ix, { action: "explain", anchor: { start: { b: id, o: 0 }, end: { b: id, o: quote.length }, quote } });
  };
  const active = status !== "idle";
  const n = block ? ix.numbers.get(block) : undefined;

  return <section className={`study-player ${active ? "is-active" : "is-idle"}`} aria-label="Плеер чтения">
    {error && <div role="alert" className="study-player-error"><p>{error}</p><button type="button" onClick={openVoiceSettings}>{needKey ? "Подключить голос" : "Настройки голоса"}</button></div>}
    <div className="study-player-main">
      {on && <button type="button" className="study-play" aria-label={status === "playing" ? "Пауза" : status === "error" ? "Повторить озвучку" : active ? "Продолжить озвучку" : "Читать вслух"} disabled={status === "loading"} onClick={() => {
        setUI({ activeGloss: null, notebookOpen: false });
        if (status === "idle") startListening(ix, from()); else toggleListening();
      }}>{status === "loading" ? <LoaderCircle size={15} className="animate-spin" /> : status === "playing" ? <Pause size={13} fill="currentColor" strokeWidth={0} /> : <Play size={13} fill="currentColor" strokeWidth={0} />}</button>}
      <div className="study-timeline">
        {active && !error && duration > 0 ? <>
          <input aria-label="Позиция в текущем аудиофрагменте" aria-valuetext={`${clock(elapsed)} из ${clock(duration)}`} type="range" min={0} max={duration} step={.1} value={elapsed} onChange={e => seekListening(Number(e.target.value))} style={{ backgroundImage: `linear-gradient(to right, var(--study-accent) ${Math.min(100, elapsed / duration * 100)}%, var(--rule-strong) 0%)` }} />
          <span className="study-time" title={`Текущий фрагмент${n ? ` · ¶${n}` : ""}${studyPaused ? " · пауза для разбора" : ""}`}>{clock(elapsed)}<span> / {clock(duration)}</span></span>
        </> : <span className="study-idle-label">{error ? "Голос недоступен" : status === "loading" ? "Готовим голос…" : on ? "Слушать текст" : "Читаем"}</span>}
      </div>
      <span className="study-player-divider" aria-hidden />
      <button type="button" className="study-discuss" aria-label="Разобрать абзац" data-tip="Разобрать текущий абзац" onClick={explain}><MessageCircle size={15} strokeWidth={1.6} /><span>Разбор</span></button>
      <div className="study-player-menu">
        <Popover label="Управление озвучкой" trigger={<Ellipsis size={18} />} triggerClass="study-icon" width={244}>
          {close => <div className="study-audio-options">
            <p className="study-audio-heading">Озвучка{n ? ` · ¶${n}` : ""}</p>
            <button type="button" onClick={cycleRate}><span>Скорость</span><strong>{rate}×</strong></button>
            {active && <button type="button" onClick={() => { seekListening(0); close(); }}><RotateCcw size={15} /> Повторить фрагмент</button>}
            {block && <button type="button" onClick={() => { jumpToBlock(block, { flash: false }); close(); }}><Locate size={15} /> Вернуться к голосу</button>}
            {on && <label><input type="checkbox" checked={follow} onChange={e => useListen.setState({ follow: e.target.checked })} /> Следовать за голосом</label>}
            <div className="study-audio-rule" />
            <button type="button" onClick={() => { close(); openVoiceSettings(); }}><SlidersHorizontal size={15} /> Настройки голоса</button>
            {active && <button type="button" onClick={() => { stopListening(); close(); }}><Square size={14} /> Остановить озвучку</button>}
          </div>}
        </Popover>
      </div>
    </div>
  </section>;
}
