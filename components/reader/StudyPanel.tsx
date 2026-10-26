"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Copy, X } from "lucide-react";
import { pauseListening, resumeAfterStudy, useListen } from "@/lib/listening";
import { studyContext } from "@/lib/study";
import { useGlosses, useStore, type Gloss } from "@/lib/store";
import { Answer } from "./Answer";
import { useReader } from "./context";

export function StudyPanel() {
  const { ix } = useReader();
  const active = useStore(s => s.activeGloss);
  const notebook = useStore(s => s.notebookOpen);
  const glosses = useGlosses(ix.article.id);
  const g = glosses.find(g => g.id === active);
  return g && !notebook ? <Discussion key={g.id} gloss={g} /> : null;
}

function Discussion({ gloss }: { gloss: Gloss }) {
  const { ix, jumpToBlock } = useReader();
  const setUI = useStore(s => s.setUI);
  const updateGloss = useStore(s => s.updateGloss);
  const studyPaused = useListen(s => s.studyPaused);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [packet, setPacket] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const block = gloss.anchor?.start.b ?? gloss.at;
  const number = block ? ix.numbers.get(block) : undefined;
  const question = gloss.question ?? "";
  const history = gloss.turns.filter(t => t.content);

  useEffect(() => {
    pauseListening(true);
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, []);
  const close = () => setUI({ activeGloss: null });
  const edit = (value: string) => {
    updateGloss(ix.article.id, gloss.id, g => ({ ...g, destination: "codex", question: value }));
    setCopied(false); setCopyError(false); setPacket("");
  };
  const copy = async () => {
    const text = studyContext(ix, gloss);
    setPacket(text);
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); setCopied(false); }
  };

  return <aside className="study-panel study-handoff" aria-label="Discuss this passage" onKeyDown={e => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  }}>
    <header className="handoff-heading">
      <h2>Discuss</h2>
      <button ref={closeRef} type="button" onClick={close} aria-label="Close discussion" className="study-icon"><X size={17} strokeWidth={1.5} /></button>
    </header>
    <div className="handoff-body scroll-thin">
      <section className="handoff-source" aria-label="Selected passage">
        <div className="handoff-source-title"><span>{gloss.anchor ? "Passage" : "Whole text"}</span>{block && <button type="button" onClick={() => jumpToBlock(block, { flash: false })}> {number ? `¶${number}` : "Go to passage"} <ArrowUpRight size={12} /></button>}</div>
        {gloss.anchor ? <details className="handoff-quote"><summary><span>{gloss.anchor.quote}</span><small>Show full passage</small></summary><blockquote>{gloss.anchor.quote}</blockquote></details> : <p className="handoff-book-title">{ix.article.title}</p>}
      </section>

      <label className="handoff-question-label" htmlFor="study-question">Your question</label>
      <textarea id="study-question" className="handoff-question" maxLength={2000} value={question} onChange={e => edit(e.target.value)} placeholder="What would you like to understand?" />
      <div className="handoff-suggestions" aria-label="Suggested questions">
        {["Give me an example", "Explain step by step"].map(q => <button key={q} type="button" onClick={() => edit(q)}>{q}<ArrowUpRight size={12} /></button>)}
      </div>

      {history.length > 0 && <details className="handoff-history"><summary>Previous discussion</summary>{history.map((t, i) => <div key={i}><span>{t.role === "user" ? "Question" : "Saved AI answer"}</span><Answer text={t.content} sources={t.sources} /></div>)}</details>}
    </div>
    <footer className="handoff-footer">
      <button type="button" className="handoff-copy" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copy again" : "Copy for Codex"}</button>
      <p role="status">{copyError ? "Copy failed. Select the text below." : copied ? "Copied. Paste into our Codex chat." : "Paste into Codex to discuss."}</p>
      {packet && <details className="study-context" open={copyError || undefined}><summary>View context</summary><textarea aria-label="Context to copy" readOnly value={packet} onFocus={e => e.currentTarget.select()} /></details>}
      <button type="button" className="handoff-return" onClick={() => { close(); resumeAfterStudy(); }}><ArrowLeft size={14} /> {studyPaused ? "Resume listening" : "Back to reading"}</button>
    </footer>
  </aside>;
}
