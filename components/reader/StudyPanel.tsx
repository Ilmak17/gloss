"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, BookOpen, Check, Copy, Languages, Lightbulb, MessageCircle, Scale, X } from "lucide-react";
import { pauseListening, resumeAfterStudy, useListen } from "@/lib/listening";
import { DISCUSSION_OPTIONS, discussionQuestion, composeDiscussionQuestion, type DiscussionMode } from "@/lib/discussion-options";
import { studyContext } from "@/lib/study";
import { useGlosses, useStore, type Gloss } from "@/lib/store";
import { ChallengeThought } from "./ChallengeThought";
import { Answer } from "./Answer";
import { useReader } from "./context";

export function StudyPanel() {
  const { ix } = useReader();
  const active = useStore(s => s.activeGloss);
  const notebook = useStore(s => s.notebookOpen);
  const glosses = useGlosses(ix.article.id);
  const g = glosses.find(g => g.id === active);
  if (!g || notebook) return null;
  return discussionQuestion(g.question ?? "").mode === "challenge"
    ? <ChallengeThought key={g.id} gloss={g} /> : <Discussion key={g.id} gloss={g} />;
}

function Discussion({ gloss }: { gloss: Gloss }) {
  const { ix, jumpToBlock } = useReader();
  const setUI = useStore(s => s.setUI);
  const updateGloss = useStore(s => s.updateGloss);
  const studyPaused = useListen(s => s.studyPaused);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [packet, setPacket] = useState("");
  const [expanded, setExpanded] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const block = gloss.anchor?.start.b ?? gloss.at;
  const { mode, detail } = discussionQuestion(gloss.question ?? "");
  const option = DISCUSSION_OPTIONS.find(option => option.id === mode)!;
  const quote = gloss.anchor?.quote;
  const longQuote = !!quote && quote.length > 200;
  const icons = { challenge: Scale, explain: BookOpen, translate: Languages, example: Lightbulb, ask: MessageCircle };
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
  const choose = (next: DiscussionMode) => edit(composeDiscussionQuestion(next, detail));
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
      <div><h2>Discuss</h2><p>A question to take into Codex</p></div>
      <button ref={closeRef} type="button" onClick={close} aria-label="Close discussion" className="study-icon"><X size={17} strokeWidth={1.5} /></button>
    </header>
    <div className="handoff-body scroll-thin">
      <section className="handoff-source" aria-label="Selected passage">
        <div className="handoff-source-title"><span>{quote ? "Selected text" : "Whole text"}</span>{block && <button type="button" onClick={() => jumpToBlock(block, { flash: false })}>{ix.article.format === "epub" ? "View in book" : "View in text"} <ArrowUpRight size={12} /></button>}</div>
        {quote ? <>
          <blockquote className={`handoff-quote${longQuote && !expanded ? " is-collapsed" : ""}`}>{quote}</blockquote>
          {longQuote && <button type="button" className="handoff-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "Show full passage"}</button>}
        </> : <p className="handoff-book-title">{ix.article.title}</p>}
        {quote && <p className="handoff-source-book" title={ix.article.title}>{ix.article.title}</p>}
      </section>

      <button type="button" className="challenge-entry" onClick={() => choose("challenge")}>
        <Scale size={19} strokeWidth={1.5} /><span><strong>Challenge this idea</strong><small>Recall · question · form your own view</small></span><ArrowUpRight size={15} />
      </button>
      <fieldset className="handoff-intent">
        <legend>What would help?</legend>
        <div className="handoff-modes">{DISCUSSION_OPTIONS.filter(item => item.id !== "challenge").map(item => {
          const Icon = icons[item.id];
          return <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => choose(item.id)}><Icon size={16} strokeWidth={1.6} /><span>{item.label}</span></button>;
        })}</div>
        <p className="handoff-mode-description" id="study-intent-description">{option.description}</p>
      </fieldset>
      <label className="handoff-question-label" htmlFor="study-question">{mode === "ask" ? "Your question" : "Anything specific?"}{mode !== "ask" && <span>Optional</span>}</label>
      <textarea id="study-question" className="handoff-question" rows={3} aria-describedby="study-intent-description" maxLength={2000 - option.prompt.length - (option.prompt ? 2 : 0)} value={detail} onChange={e => edit(composeDiscussionQuestion(mode, e.target.value))} placeholder={mode === "ask" ? "What would you like to understand?" : "Add a question or a little direction…"} />

      <div className="handoff-transfer">
        <button type="button" className="handoff-copy" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied for Codex" : "Copy for Codex"}</button>
        <p role="status">{copyError ? "Copy failed. Select the text below." : copied ? "Ready — paste into our Codex chat." : "Copies the passage, your request and nearby context."}</p>
        {packet && <details className="study-context" open={copyError || undefined}><summary>Preview copied text</summary><textarea aria-label="Context to copy" readOnly value={packet} onFocus={e => e.currentTarget.select()} /></details>}
      </div>
      {history.length > 0 && <details className="handoff-history"><summary>Previous discussion</summary>{history.map((t, i) => <div key={i}><span>{t.role === "user" ? "Question" : "Saved AI answer"}</span><Answer text={t.content} sources={t.sources} /></div>)}</details>}
    </div>
    <footer className="handoff-footer">
      <button type="button" className="handoff-return" onClick={() => { close(); resumeAfterStudy(); }}><ArrowLeft size={14} /> {studyPaused ? "Resume listening" : "Back to reading"}</button>
    </footer>
  </aside>;
}
