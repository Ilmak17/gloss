"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import { recallHandoff, recallThought } from "@/lib/sitting";
import { uid, useStore } from "@/lib/store";

/**
 * Back at a book after a break: before the page, what do you remember from
 * last time? "Copy for Codex" hands over what was read and the recall, to be
 * checked there; with nothing written, Codex retells it. Saving keeps the
 * recall in the notebook. Skipping is always fine.
 */
export function SittingRecall({ articleId, book, label, text, at, onDone }: {
  articleId: string;
  book: string;
  /** The chapter, or chapters, the last sitting read. */
  label: string;
  /** What the last sitting read. */
  text: string;
  /** Where the last sitting began. */
  at: string;
  onDone: () => void;
}) {
  const draftKey = `gloss:recall-draft:${articleId}`;
  const [recall, setRecall] = useState(() => {
    try { return localStorage.getItem(draftKey) ?? ""; } catch { return ""; }
  });
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const field = useRef<HTMLTextAreaElement>(null);
  const filled = recall.trim().length > 0;
  const handoff = recallHandoff({ book, label, text, recall });

  useEffect(() => { field.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [recall]);

  const write = (value: string) => {
    setRecall(value);
    setCopy("idle");
    try { if (value.trim()) localStorage.setItem(draftKey, value); else localStorage.removeItem(draftKey); } catch { /* The draft only lives on this page. */ }
  };
  const close = () => {
    try { localStorage.removeItem(draftKey); } catch { /* Nothing to clear. */ }
    onDone();
  };
  const save = () => {
    if (!filled) return;
    useStore.getState().addGloss(recallThought({ id: uid(), articleId, at, label, recall, now: Date.now() }));
    // Adding a thought opens it for discussion; a recall stays in the notebook.
    useStore.getState().setUI({ activeGloss: null, enteringGloss: null });
    close();
  };
  const copyForCodex = async () => {
    try { await navigator.clipboard.writeText(handoff); setCopy("done"); }
    catch { setCopy("failed"); }
  };

  return (
    <section className="book-recap" aria-labelledby="sitting-recall-title"
      onKeyDown={(e) => {
        // The page's own keys stay with the page: arrows do not turn it while you write.
        if (e.target instanceof HTMLTextAreaElement) {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
        }
      }}>
      <div className="book-recap-inner">
        <p className="book-recap-kicker">Last time</p>
        <h2 id="sitting-recall-title" className="book-recap-chapter">{label}</h2>
        <label htmlFor="book-recap-text" className="book-recap-question">What do you remember from last time?</label>
        <p className="book-recap-hint">From memory, a few sentences. Codex then checks it against the text and fills in what you missed.</p>
        <textarea id="book-recap-text" ref={field} rows={4} spellCheck maxLength={4000} value={recall}
          placeholder="Last time…" onChange={(e) => write(e.target.value)} />
        <div className="book-recap-actions">
          <button type="button" className="book-recap-copy" onClick={copyForCodex}
            title={filled ? "Copies what you read last time and your recall. Paste it into Codex to be checked." : "Copies what you read last time. Paste it into Codex for a short retelling."}>
            {copy === "done" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copy === "done" ? "Copied" : filled ? "Copy for Codex" : "Just remind me"}
          </button>
          <span className="book-recap-gap" />
          <button type="button" className="thought-back" onClick={close}>Skip</button>
          <button type="button" className="thought-primary" disabled={!filled} onClick={save}>
            Save and read on <ArrowRight size={15} aria-hidden />
          </button>
        </div>
        <p role="status" className="book-recap-status">
          {copy === "done" ? (filled ? "Paste it into Codex: it will check you and fill in what you missed." : "Paste it into Codex: it will retell what you read.") : "Saved recalls come back for review in the library."}
        </p>
        {copy === "failed" && <div className="book-recap-packet">
          <p>Couldn’t copy. Select the message below.</p>
          <textarea aria-label="Prepared message" readOnly value={handoff} rows={5} onFocus={(e) => e.currentTarget.select()} />
        </div>}
      </div>
    </section>
  );
}
