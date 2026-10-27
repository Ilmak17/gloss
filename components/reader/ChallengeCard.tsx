"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, X } from "lucide-react";
import { composeDiscussionQuestion, discussionQuestion } from "@/lib/discussion-options";
import { pauseListening, resumeAfterStudy, useListen } from "@/lib/listening";
import { keepInRotation, retire } from "@/lib/review";
import { studyContext } from "@/lib/study";
import { useStore, type Gloss } from "@/lib/store";
import { useReader } from "./context";

const STEPS = ["Recall", "Challenge", "Reflect"] as const;

/** A single thought at a time. Native dialog supplies focus trapping and an inert reading page. */
export function ChallengeCard({ gloss }: { gloss: Gloss }) {
  const { ix } = useReader();
  const dialog = useRef<HTMLDialogElement>(null);
  const update = useStore(s => s.updateGloss);
  const setUI = useStore(s => s.setUI);
  const studyPaused = useListen(s => s.studyPaused);
  const [step, setStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [packet, setPacket] = useState("");
  const [repeat, setRepeat] = useState(!!gloss.review && !gloss.review.off);
  const { detail } = discussionQuestion(gloss.question ?? "");
  const claim = gloss.reflection?.claim ?? "";
  const takeaway = gloss.reflection?.takeaway ?? "";
  const close = () => setUI({ activeGloss: null });

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pauseListening(true);
    const el = dialog.current!;
    el.showModal();
    return () => { el.close(); if (before?.isConnected) before.focus({ preventScroll: true }); };
  }, []);

  const edit = (key: "claim" | "takeaway" | "openQuestion", value: string) => {
    update(ix.article.id, gloss.id, g => ({ ...g, reflection: { ...g.reflection, [key]: value } }));
    setCopied(false); setCopyFailed(false); setPacket("");
  };
  const copy = async () => {
    const text = studyContext(ix, gloss);
    setPacket(text);
    try { await navigator.clipboard.writeText(text); setCopied(true); setCopyFailed(false); }
    catch { setCopyFailed(true); setCopied(false); }
  };
  const finish = () => {
    update(ix.article.id, gloss.id, g => ({ ...g,
      review: repeat && takeaway.trim()
        ? g.review && !g.review.off ? g.review : keepInRotation({})
        : g.review ? retire(g) : undefined,
    }));
    close();
  };

  return <dialog ref={dialog} className="thought-card" aria-labelledby="thought-title" onCancel={e => { e.preventDefault(); close(); }} onKeyDown={e => e.stopPropagation()} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } }}>
    <div className="thought-shell">
      <header className="thought-top"><span>IN CONVERSATION WITH THE BOOK</span><button type="button" aria-label="Close thinking card" onClick={close}><X size={19} strokeWidth={1.5} /></button></header>
      <nav className="thought-tabs" aria-label="Thinking steps">{STEPS.map((label, i) => <button key={label} type="button" aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)}><span>{String(i + 1).padStart(2, "0")}</span>{label}</button>)}</nav>
      <div className="thought-body scroll-thin">
        <p className="thought-book" title={ix.article.title}>{ix.article.title}</p>
        <h2 id="thought-title">{["What is the claim?", "Where does it break?", "What do you think now?"][step]}</h2>
        <p className="thought-lead">{["Put it in your own words before looking back.", "Try a counterexample, a missing assumption or a different explanation.", "Keep what survived the conversation. Leave room to change your mind."][step]}</p>
        {step === 0 && <>
          <label className="thought-label" htmlFor="thought-claim">Your understanding</label>
          <textarea id="thought-claim" value={claim} maxLength={2000} onChange={e => edit("claim", e.target.value)} placeholder="The author argues that… because…" rows={4} />
          <details className="thought-source"><summary>Look back at the passage</summary><blockquote>{gloss.anchor?.quote ?? ix.texts.get(gloss.at ?? "") ?? ix.article.title}</blockquote></details>
        </>}
        {step === 1 && <>
          {claim && <p className="thought-recap">{claim}</p>}
          <label className="thought-label" htmlFor="thought-objection">Your objection or question</label>
          <textarea id="thought-objection" value={detail} maxLength={1900} onChange={e => { update(ix.article.id, gloss.id, g => ({ ...g, question: composeDiscussionQuestion("challenge", e.target.value) })); setCopied(false); setCopyFailed(false); setPacket(""); }} placeholder="But what if…? I’m not convinced because…" rows={4} />
          <p className="thought-copy-status" role="status">{copyFailed ? "Couldn’t copy. Select the prepared text below." : copied ? "Copied. Paste into our Codex chat to start the discussion." : "Bring this thought to Codex, then return here to reflect."}</p>
          {packet && <details className="thought-source" open={copyFailed || undefined}><summary>View prepared message</summary><textarea aria-label="Prepared message" readOnly value={packet} onFocus={e => e.currentTarget.select()} /></details>}
        </>}
        {step === 2 && <>
          <label className="thought-label" htmlFor="thought-takeaway">Your provisional conclusion</label>
          <textarea id="thought-takeaway" value={takeaway} maxLength={2000} onChange={e => edit("takeaway", e.target.value)} placeholder="I now think… What changed my mind was…" rows={4} />
          <details className="thought-source"><summary>Keep an open question</summary><label className="thought-label" htmlFor="thought-open">What remains unresolved?</label><textarea id="thought-open" value={gloss.reflection?.openQuestion ?? ""} maxLength={2000} onChange={e => edit("openQuestion", e.target.value)} placeholder="What would change your view?" rows={2} /></details>
          <label className="thought-repeat"><input type="checkbox" checked={repeat} disabled={!takeaway.trim()} onChange={e => setRepeat(e.target.checked)} /><span>Revisit this thought<small>{gloss.review && !gloss.review.off ? `Next library recall: ${new Date(gloss.review.due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.` : "A recall card in your library, starting in 3 days."}</small></span></label>
        </>}
      </div>
      <footer className="thought-footer">
        <div className="thought-actions">
          {step > 0 ? <button type="button" className="thought-back" onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Back</button> : <button type="button" className="thought-back" onClick={close}>Keep reading</button>}
          {step === 0 && <button type="button" className="thought-primary" onClick={() => setStep(1)}>Test the idea <ArrowRight size={16} /></button>}
          {step === 1 && <button type="button" className="thought-primary" onClick={copy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied for Codex" : "Copy for Codex"}</button>}
          {step === 2 && <button type="button" className="thought-primary" onClick={finish}>Save & return to book <Check size={16} /></button>}
        </div>
        {step === 1 ? <button type="button" className="thought-after" onClick={() => setStep(2)}>After the conversation <ArrowRight size={14} /></button> : <p className="thought-autosave">Draft kept in Notebook{studyPaused && <> · <button type="button" onClick={() => { close(); resumeAfterStudy(); }}>Resume listening</button></>}</p>}
      </footer>
    </div>
  </dialog>;
}
