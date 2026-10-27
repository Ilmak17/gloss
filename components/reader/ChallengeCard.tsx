"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Pin, X } from "lucide-react";
import { composeDiscussionQuestion, discussionQuestion } from "@/lib/discussion-options";
import { pauseListening, resumeAfterStudy, useListen } from "@/lib/listening";
import { keepInRotation, retire } from "@/lib/review";
import { pinThoughtConclusion } from "@/lib/pin-thought";
import { studyContext } from "@/lib/study";
import { useStore, type Gloss } from "@/lib/store";
import { useReader } from "./context";

const STARTERS = [
  { label: "Evidence", question: "What supports this claim?" },
  { label: "Limits", question: "When might this stop being true?" },
  { label: "Another explanation", question: "Could something else explain this?" },
];

function WritingArea(props: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(196, Math.max(92, el.scrollHeight))}px`;
  }, [props.value]);
  return <textarea {...props} ref={ref} rows={2} />;
}

/** A short thinking pause. Every step is optional; all writing stays in the notebook. */
export function ChallengeCard({ gloss }: { gloss: Gloss }) {
  const { ix, openNote } = useReader();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const update = useStore(s => s.updateGloss);
  const setUI = useStore(s => s.setUI);
  const studyPaused = useListen(s => s.studyPaused);
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [packet, setPacket] = useState("");
  const { detail } = discussionQuestion(gloss.question ?? "");
  const claim = gloss.reflection?.claim ?? "";
  const takeaway = gloss.reflection?.takeaway ?? "";
  const repeat = !!gloss.review && !gloss.review.off;
  const close = () => setUI({ activeGloss: null });
  const source = gloss.anchor?.quote ?? ix.texts.get(gloss.at ?? "") ?? ix.article.title;

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pauseListening(true);
    const el = dialog.current!;
    el.showModal();
    return () => { el.close(); if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);

  const resetCopy = () => { setCopied(false); setCopyFailed(false); setPacket(""); };
  const edit = (key: "claim" | "takeaway" | "openQuestion", value: string) => {
    update(ix.article.id, gloss.id, g => ({ ...g, reflection: { ...g.reflection, [key]: value } }));
    resetCopy();
  };
  const editQuestion = (value: string) => {
    update(ix.article.id, gloss.id, g => ({ ...g, question: composeDiscussionQuestion("challenge", value) }));
    resetCopy();
  };
  const copy = async () => {
    const text = studyContext(ix, gloss);
    setPacket(text);
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); setCopied(false); }
  };
  const pin = () => {
    const id = pinThoughtConclusion(ix, gloss.id);
    if (id) { close(); openNote?.(id); }
  };

  return <dialog ref={dialog} className="thought-card" aria-labelledby="thought-title" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => e.stopPropagation()} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}>
    <div className="thought-shell">
      <header className="thought-top">
        <div className="thought-progress">
          {step > 0 && <button type="button" aria-label="Previous step" onClick={() => setStep(step - 1)}><ArrowLeft size={15} /></button>}
          <span>{step + 1} of 3 <span aria-hidden>·</span> {["Your take", "A question", "Your conclusion"][step]}</span>
        </div>
        <button type="button" aria-label="Close thinking card" onClick={close}><X size={18} strokeWidth={1.5} /></button>
      </header>
      <div className="thought-body scroll-thin">
        <p className="thought-book" title={ix.article.title}>{ix.article.title}</p>
        <h2 id="thought-title" ref={heading} tabIndex={-1}>{["What’s the author saying?", "What would you question?", "Where do you stand now?"][step]}</h2>
        <p className="thought-lead">{["Write the main idea in a sentence or two.", "Pick a starting point, or write your own question.", "Keep a thought from our conversation. This part is optional."][step]}</p>
        {step === 0 && <>
          <label className="sr-only" htmlFor="thought-claim">Your understanding</label>
          <WritingArea id="thought-claim" value={claim} maxLength={2000} onChange={e => edit("claim", e.target.value)} placeholder="The author is saying…" />
        </>}
        {step === 1 && <>
          {claim && <details className="thought-reconstruction"><summary>Your take</summary><p>{claim}</p></details>}
          <div className="thought-starters" aria-label="Question starting points">{STARTERS.map(item => <button key={item.label} type="button" title={item.question} onClick={() => {
            if (!detail.includes(item.question)) editQuestion(detail.trim() ? `${detail.trim()}\n\n${item.question}`.slice(0, 1900) : item.question);
          }}>{item.label}</button>)}</div>
          <label className="sr-only" htmlFor="thought-objection">Your question</label>
          <WritingArea id="thought-objection" value={detail} maxLength={1900} onChange={e => editQuestion(e.target.value)} placeholder="I’m curious about…" />
        </>}
        {step < 2 && <details className="thought-source"><summary>Show passage</summary><blockquote>{source}</blockquote></details>}
        {step === 1 && <>
          <p className="thought-copy-status" role="status">{copyFailed ? "Couldn’t copy. Select the prepared message below." : copied ? "Copied. Paste it into our Codex chat when you’re ready." : "Includes the passage and your thoughts. Paste into Codex to discuss."}</p>
          {packet && <details className="thought-source" open={copyFailed || undefined}><summary>View prepared message</summary><WritingArea aria-label="Prepared message" readOnly value={packet} onFocus={e => e.currentTarget.select()} /></details>}
        </>}
        {step === 2 && <>
          <label className="sr-only" htmlFor="thought-takeaway">Your provisional conclusion</label>
          <WritingArea id="thought-takeaway" value={takeaway} maxLength={2000} onChange={e => edit("takeaway", e.target.value)} placeholder="For now, I think…" />
          <details className="thought-source"><summary>Keep an open question</summary><label className="sr-only" htmlFor="thought-open">What remains unresolved?</label><WritingArea id="thought-open" value={gloss.reflection?.openQuestion ?? ""} maxLength={2000} onChange={e => edit("openQuestion", e.target.value)} placeholder="What would change your view?" /></details>
          <label className="thought-repeat"><input type="checkbox" checked={repeat} disabled={!takeaway.trim()} onChange={e => {
            const enabled = e.target.checked;
            update(ix.article.id, gloss.id, g => ({ ...g, review: enabled ? (g.review ? { ...g.review, off: false } : keepInRotation(g)) : retire(g) }));
          }} /><span>Revisit later<small>{repeat ? `Next in your library: ${new Date(gloss.review!.due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : "A gentle recall prompt in your library, starting in 3 days."}</small></span></label>
        </>}
      </div>
      <footer className="thought-footer">
        <div className="thought-actions">
          <button type="button" className="thought-back" onClick={close}>Back to reading</button>
          {step === 0 && <button type="button" className="thought-primary" onClick={() => setStep(1)}>Continue <ArrowRight size={16} /></button>}
          {step === 1 && <button type="button" className="thought-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy for Codex"}</button>}
          {step === 2 && openNote && <button type="button" className="thought-primary" disabled={!takeaway.trim()} onClick={pin}><Pin size={15} /> Pin in margin</button>}
        </div>
        {step < 2 && <button type="button" className="thought-after" onClick={() => setStep(2)}>{step === 0 ? "Skip to a conclusion" : "Add a conclusion"} <ArrowRight size={13} /></button>}
        <p className="thought-autosave">Autosaves to Notebook{studyPaused && <> · <button type="button" onClick={() => { close(); resumeAfterStudy(); }}>Resume listening</button></>}</p>
      </footer>
    </div>
  </dialog>;
}
