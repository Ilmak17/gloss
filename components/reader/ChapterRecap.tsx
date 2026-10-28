"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy } from "lucide-react";
import type { BookChapter } from "@/lib/books";
import { recapHandoff, recapThought } from "@/lib/recap";
import { uid, useStore, type Gloss } from "@/lib/store";

/**
 * The page after a chapter's last one: what did you take from it? The text is
 * out of sight, so the recap comes from memory. Saving keeps it as a thought
 * that comes back for recall; "Copy for Codex" hands the chapter and the
 * recap over to be checked. Skipping is always fine.
 */
export function ChapterRecap({ articleId, book, chapter, saved, onDone }: {
  articleId: string;
  book: string;
  chapter: BookChapter;
  /** The recap written before, if this chapter has one. */
  saved?: Gloss;
  onDone: () => void;
}) {
  const draftKey = `gloss:recap-draft:${articleId}:${chapter.blocks[0]?.id}`;
  const [text, setText] = useState(() => {
    try { return localStorage.getItem(draftKey) ?? saved?.reflection?.takeaway ?? ""; } catch { return saved?.reflection?.takeaway ?? ""; }
  });
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const field = useRef<HTMLTextAreaElement>(null);
  const addGloss = useStore((s) => s.addGloss);
  const updateGloss = useStore((s) => s.updateGloss);
  const filled = text.trim().length > 0;
  const handoff = recapHandoff({ book, chapter, recap: text });

  useEffect(() => { field.current?.focus({ preventScroll: true }); }, []);
  // The writing area grows with the recap, up to the page.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const write = (value: string) => {
    setText(value);
    setCopy("idle");
    try { if (value.trim()) localStorage.setItem(draftKey, value); else localStorage.removeItem(draftKey); } catch { /* The draft only lives on this page. */ }
  };
  const save = () => {
    if (!filled) return;
    if (saved) updateGloss(articleId, saved.id, (g) => ({ ...g, reflection: { ...g.reflection, claim: chapter.title, takeaway: text.trim() } }));
    else {
      addGloss(recapThought({ id: uid(), articleId, chapter, text, now: Date.now() }));
      // Adding a thought opens it for discussion; a recap stays in the notebook.
      useStore.getState().setUI({ activeGloss: null, enteringGloss: null });
    }
    try { localStorage.removeItem(draftKey); } catch { /* Nothing to clear. */ }
    onDone();
  };
  const copyForCodex = async () => {
    try { await navigator.clipboard.writeText(handoff); setCopy("done"); }
    catch { setCopy("failed"); }
  };

  return (
    <section className="book-recap" aria-labelledby="book-recap-title"
      onKeyDown={(e) => {
        // The page's own keys stay with the page: arrows do not turn it while you write.
        if (e.target instanceof HTMLTextAreaElement) {
          e.stopPropagation();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
        }
      }}>
      <div className="book-recap-inner">
        <p className="book-recap-kicker">End of chapter</p>
        <h2 id="book-recap-title" className="book-recap-chapter">{chapter.title}</h2>
        <label htmlFor="book-recap-text" className="book-recap-question">What did you take from this chapter?</label>
        <p className="book-recap-hint">In your own words, from memory: two or three sentences.</p>
        <textarea id="book-recap-text" ref={field} rows={4} spellCheck maxLength={4000} value={text}
          placeholder="The main idea is…" onChange={(e) => write(e.target.value)} />
        <div className="book-recap-actions">
          <button type="button" className="book-recap-copy" disabled={!filled} onClick={copyForCodex}
            title="Copies the chapter and your recap. Paste it into Codex to be checked.">
            {copy === "done" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
            {copy === "done" ? "Copied" : "Copy for Codex"}
          </button>
          <span className="book-recap-gap" />
          <button type="button" className="thought-back" onClick={onDone}>Skip</button>
          <button type="button" className="thought-primary" disabled={!filled} onClick={save}>
            {saved ? "Update and continue" : "Save and continue"} <ArrowRight size={15} aria-hidden />
          </button>
        </div>
        <p role="status" className="book-recap-status">
          {copy === "done" ? "Paste it into Codex: it will check you and ask a few questions." : saved ? "Your recap is saved. It comes back for recall in the library." : "Saved recaps come back for recall in the library."}
        </p>
        {copy === "failed" && <div className="book-recap-packet">
          <p>Couldn’t copy. Select the message below.</p>
          <textarea aria-label="Prepared message" readOnly value={handoff} rows={5} onFocus={(e) => e.currentTarget.select()} />
        </div>}
      </div>
    </section>
  );
}
