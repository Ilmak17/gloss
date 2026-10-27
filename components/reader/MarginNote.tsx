"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { ArrowUpRight, Pin, X } from "lucide-react";
import { useStore, type Highlight } from "@/lib/store";
import { useReader } from "./context";

export function MarginNote({ highlight, chapter, focusRequest, onClose, width }: {
  highlight: Highlight;
  chapter: string;
  focusRequest: number;
  onClose: () => void;
  /** Set when the note fits beside the page; otherwise it opens over the page. */
  width?: number;
}) {
  const { goToPoint } = useReader();
  const updateHighlight = useStore(s => s.updateHighlight);
  const input = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!input.current) return;
    input.current.style.height = "auto";
    input.current.style.height = `${Math.max(160, input.current.scrollHeight)}px`;
  }, [highlight.note]);
  useEffect(() => {
    if (focusRequest) input.current?.focus({ preventScroll: true });
  }, [focusRequest]);

  return (
    <aside className={`margin-note ${width ? "is-beside" : "is-over"}`} style={width ? { width } : undefined} aria-label="Pinned note">
      <header className="margin-note-heading">
        <span><Pin size={13} aria-hidden /> IN THE MARGIN</span>
        <button type="button" aria-label="Close pinned note" title="Close · your note stays saved" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="margin-note-paper">
        <div className="margin-note-location">
          <span>{chapter}</span>
          <button type="button" onClick={() => goToPoint?.(highlight.anchor.start)} aria-label="Return to noted passage" title="Return to passage"><ArrowUpRight size={16} /></button>
        </div>
        <details className="margin-note-source">
          <summary><span>{highlight.anchor.quote}</span></summary>
          <blockquote>{highlight.anchor.quote}</blockquote>
        </details>
        <h2>Your note</h2>
        <textarea ref={input} aria-label="Your margin note" value={highlight.note ?? ""}
          placeholder="What do you make of this?"
          spellCheck
          onChange={e => updateHighlight(highlight.articleId, highlight.id, { note: e.target.value || undefined })}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === "Escape") { e.preventDefault(); input.current?.blur(); }
          }}
        />
        <footer>Autosaves as you write</footer>
      </div>
    </aside>
  );
}
