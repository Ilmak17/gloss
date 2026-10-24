"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Copy, Sparkles, X } from "lucide-react";
import { followUp } from "@/lib/ask";
import { pauseListening, resumeAfterStudy, useListen } from "@/lib/listening";
import { studyContext } from "@/lib/study";
import { useGlosses, useStore } from "@/lib/store";
import { GlossCard } from "./GlossCard";
import { useReader } from "./context";

export function StudyPanel() {
  const { ix } = useReader();
  const active = useStore(s => s.activeGloss);
  const notebook = useStore(s => s.notebookOpen);
  const glosses = useGlosses(ix.article.id);
  const g = glosses.find(g => g.id === active);
  return g && !notebook ? <Discussion key={g.id} gloss={g} /> : null;
}

function Discussion({ gloss }: { gloss: ReturnType<typeof useGlosses>[number] }) {
  const { ix } = useReader();
  const setUI = useStore(s => s.setUI);
  const studyPaused = useListen(s => s.studyPaused);
  const [copyStatus, setCopyStatus] = useState("");
  const [packet, setPacket] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const busy = gloss.turns.some(t => t.streaming);
  useEffect(() => {
    pauseListening(true);
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, []);
  const close = () => setUI({ activeGloss: null });

  return <aside className="study-panel" aria-label="Разбор текста" onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  }}>
    <header className="study-panel-heading">
      <div><p><Sparkles size={16} /> Разбираем вместе</p><span>AI в Gloss · ответы сохранены в заметках</span></div>
      <button ref={closeRef} type="button" onClick={close} aria-label="Закрыть разбор" className="study-icon"><X size={18} /></button>
    </header>
    <div className="study-panel-body scroll-thin">
      {studyPaused && <p className="study-pause-note">Чтение на паузе. Продолжим с того же места.</p>}
      <GlossCard gloss={gloss} active hover={false} entering={false} variant="sheet" onActivate={() => {}} />
      <div className="study-prompts">
        {["Объясни проще", "Дай другой пример", "Где границы этой идеи?"].map(q => <button type="button" key={q} disabled={busy} onClick={() => followUp(ix, gloss.id, q)}>{q}</button>)}
      </div>
    </div>
    <footer className="study-panel-footer">
      <button type="button" className="study-copy" onClick={async () => {
        const text = studyContext(ix, gloss);
        setPacket(text);
        try { await navigator.clipboard.writeText(text); setCopyStatus("Контекст готов — вставь в наш чат Codex"); }
        catch { setCopyStatus("Буфер недоступен. Скопируй контекст из поля ниже."); }
      }}><Copy size={14} /> Контекст для Codex</button>
      <p role="status">{copyStatus || "Для глубокого разбора — скопируй и вставь в наш чат."}</p>
      {packet && <details className="study-context"><summary>Показать текст для копирования</summary><textarea aria-label="Контекст для ручного копирования" readOnly value={packet} onFocus={e => e.currentTarget.select()} /></details>}
      <button type="button" className="study-continue" onClick={() => { close(); resumeAfterStudy(); }}>Продолжить чтение <ArrowRight size={16} /></button>
    </footer>
  </aside>;
}
