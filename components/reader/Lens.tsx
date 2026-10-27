"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Check, Copy, Eraser, Highlighter, MessageCircle, PenLine, Play, Scale } from "lucide-react";
import { isShortSelection, type Action } from "@/lib/actions";
import { MARKERS, type Marker } from "@/lib/settings";
import { anchorToRange, selectionToAnchor } from "@/lib/anchor";
import { composeDiscussionQuestion } from "@/lib/discussion-options";
import { startStudy } from "@/lib/study-draft";
import { pauseListening, startListening, useListen } from "@/lib/listening";
import { uid, useStore, type Anchor, type Highlight } from "@/lib/store";
import { useReader } from "./context";

type LensState = {
  anchor: Anchor;
  mode: "actions" | "ask" | "note";
  highlightId?: string;
  highlightIds?: string[];
  initial?: string;
};

/** Questions people reach for, offered while the box is still empty. */
const STARTERS = {
  word: ["Why this word here?", "Where does it come from?", "Use it in a sentence"],
  passage: ["Give me an example", "Why does it matter?", "What is the evidence?"],
};

/**
 * The selection lens. Select text and it appears; start typing and it becomes
 * a question box; discuss it in Codex or open a critical-reading card.
 */
export type OpenHighlight = { id: string; ids?: string[]; anchor: Anchor; at: number; note?: boolean };

export function Lens({ rootEl, openHighlight }: { rootEl: HTMLElement | null; openHighlight: OpenHighlight | null }) {
  const { ix, openNote } = useReader();
  const [lens, setLens] = useState<LensState | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean; arrow: number; docked: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [removed, setRemoved] = useState<Highlight[]>([]);
  const marker = useStore((s) => s.settings.marker);
  const setSettings = useStore((s) => s.setSettings);
  const updateHighlight = useStore((s) => s.updateHighlight);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef("");
  draftRef.current = draft;
  const dragging = useRef(false);
  const lensRef = useRef<LensState | null>(null);
  lensRef.current = lens;
  const setUI = useStore((s) => s.setUI);
  const addHighlight = useStore((s) => s.addHighlight);
  const removeHighlight = useStore((s) => s.removeHighlight);

  /** Keeps what was written in note mode: on a highlight, or as a new one. An emptied note is removed. */
  const saveNote = useCallback(() => {
    const l = lensRef.current;
    if (!l || l.mode !== "note") return;
    const note = draftRef.current.trim() || undefined;
    const st = useStore.getState();
    const existing = l.highlightId ? st.highlights[ix.article.id]?.find((h) => h.id === l.highlightId) : undefined;
    if (existing) {
      if ((existing.note ?? undefined) !== note) st.updateHighlight(ix.article.id, existing.id, { note });
    } else if (note) {
      st.addHighlight({ id: uid(), articleId: ix.article.id, anchor: l.anchor, createdAt: Date.now(), color: st.settings.marker, note });
    }
  }, [ix]);

  const close = useCallback(
    (clearSelection = true) => {
      setLens(null);
      setPos(null);
      setDraft("");
      setUI({ pending: null, activeHighlight: null });
      if (clearSelection) window.getSelection()?.removeAllRanges();
    },
    [setUI]
  );

  // Read the selection after a drag ends or the keyboard changes it.
  useEffect(() => {
    if (!rootEl) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const evaluate = () => {
      if (lensRef.current?.mode === "ask" || lensRef.current?.mode === "note") return;
      const a = selectionToAnchor(window.getSelection(), rootEl, ix.texts, ix.order);
      if (a) {
        pauseListening(true);
        setLens({ anchor: a, mode: "actions" });
        setUI({ activeHighlight: null });
      } else if (lensRef.current && !lensRef.current.highlightId) {
        setLens(null);
        setPos(null);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (boxRef.current?.contains(e.target as Node)) return;
      dragging.current = rootEl.contains(e.target as Node);
      // Clicking away from a note keeps it, the way paper would.
      if (lensRef.current?.mode === "note") saveNote();
      if (lensRef.current?.mode === "ask" || lensRef.current?.mode === "note" || lensRef.current?.highlightId) close(false);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (t) clearTimeout(t);
      t = setTimeout(evaluate, 10);
    };
    const onSel = () => {
      if (dragging.current) return;
      if (t) clearTimeout(t);
      t = setTimeout(evaluate, 140);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointerup", onUp, true);
    document.addEventListener("selectionchange", onSel);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointerup", onUp, true);
      document.removeEventListener("selectionchange", onSel);
      if (t) clearTimeout(t);
    };
  }, [rootEl, ix, close, saveNote, setUI]);

  // Clicking an existing highlight opens the lens on it.
  useEffect(() => {
    if (!openHighlight) return;
    window.getSelection()?.removeAllRanges();
    setLens({ anchor: openHighlight.anchor, mode: openHighlight.note ? "note" : "actions", highlightId: openHighlight.id, highlightIds: openHighlight.ids });
    if (openHighlight.note) setDraft(useStore.getState().highlights[ix.article.id]?.find((h) => h.id === openHighlight.id)?.note ?? "");
    setUI({ activeHighlight: openHighlight.id });
  }, [openHighlight, setUI, ix]);

  // Follow the anchor while the page scrolls.
  // keepX: the box only changed size (colour dots, starters), so it stays put sideways.
  const lastX = useRef<number | null>(null);
  const place = useCallback((keepX = false) => {
    const l = lensRef.current;
    const box = boxRef.current;
    if (!l || !box) return;
    const sel = window.getSelection();
    const range = l.mode === "actions" && !l.highlightId && sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : anchorToRange(l.anchor);
    const rects = range ? Array.from(range.getClientRects()).filter((r) => r.width > 0) : [];
    if (!rects.length) return;
    const first = rects[0];
    const lastR = rects[rects.length - 1];
    const vw = window.innerWidth;
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const centerX = rects.length > 1 ? (Math.min(...rects.map((r) => r.left)) + Math.max(...rects.map((r) => r.right))) / 2 : (first.left + first.right) / 2;
    const anchorX = rects.length > 1 ? first.left + Math.min(40, first.width / 2) : centerX;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    // On touch, a live selection brings the system's own menu, which sits above or below the
    // text depending on the OS version. So the lens docks at the foot of the screen instead.
    if (coarse && l.mode === "actions" && !l.highlightId) {
      const vv = window.visualViewport;
      const x = Math.max(12, (vw - w) / 2);
      setPos({ x, y: (vv ? vv.offsetTop + vv.height : window.innerHeight) - h - 16, below: false, arrow: 0, docked: true });
      return;
    }
    let below = coarse || first.top - h - 12 < 64;
    let y = below ? lastR.bottom + 12 : first.top - h - 12;
    if (below && y + h > window.innerHeight - 8) {
      below = false;
      y = Math.max(64, first.top - h - 12);
    }
    const ideal = keepX && lastX.current !== null ? lastX.current : (rects.length > 1 ? centerX : anchorX) - w / 2;
    const x = Math.max(12, Math.min(vw - w - 12, ideal));
    lastX.current = ideal;
    const arrowAt = below ? (lastR.left + lastR.right) / 2 : anchorX;
    setPos({ x, y, below, arrow: Math.max(16, Math.min(w - 16, arrowAt - x)), docked: false });
  }, []);

  useLayoutEffect(() => {
    if (!lens) return;
    place();
    const ro = new ResizeObserver(() => place(true));
    if (boxRef.current) ro.observe(boxRef.current);
    const on = () => requestAnimationFrame(() => place(true));
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [lens, place]);

  // Docked, the lens takes the place of the composer, which steps aside until it closes.
  const docked = !!pos?.docked;
  useEffect(() => {
    if (!docked) return;
    const root = document.documentElement;
    root.dataset.lensDocked = "";
    return () => {
      delete root.dataset.lensDocked;
    };
  }, [docked]);

  const toAsk = useCallback(
    (initial = "") => {
      const l = lensRef.current;
      if (!l) return;
      setDraft(initial);
      setLens({ ...l, mode: "ask" });
      if (!l.highlightId) setUI({ pending: l.anchor });
      window.getSelection()?.removeAllRanges();
    },
    [setUI]
  );

  const toNote = useCallback(() => {
    const l = lensRef.current;
    if (!l) return;
    const existing = l.highlightId ? useStore.getState().highlights[ix.article.id]?.find((h) => h.id === l.highlightId) : undefined;
    if (openNote) {
      const id = existing?.id ?? uid();
      if (!existing) addHighlight({ id, articleId: ix.article.id, anchor: l.anchor, createdAt: Date.now(), color: marker });
      close();
      openNote(id);
      return;
    }
    setDraft(existing?.note ?? "");
    setLens({ ...l, mode: "note" });
    if (!l.highlightId) setUI({ pending: l.anchor });
    window.getSelection()?.removeAllRanges();
  }, [ix, setUI, openNote, addHighlight, marker, close]);

  const asking = lens?.mode === "ask";
  const noting = lens?.mode === "note";
  useLayoutEffect(() => {
    const el = asking ? inputRef.current : noting ? noteRef.current : null;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [asking, noting]);

  // The note box grows with what is written, up to a few lines.
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`;
  }, [draft, noting]);

  // Typing anything while text is selected starts a question.
  useEffect(() => {
    if (!lens || lens.mode !== "actions") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tgt = e.target as HTMLElement;
      if (tgt.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (tgt.closest("button")) return;
      if (e.key === "Enter") {
        e.preventDefault();
        toAsk("");
        return;
      }
      if (e.key.length === 1 && e.key !== " ") {
        e.preventDefault();
        e.stopPropagation();
        toAsk(e.key);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [lens, close, toAsk]);

  useEffect(() => {
    if (!removed.length) return;
    const timer = setTimeout(() => setRemoved([]), 8000);
    return () => clearTimeout(timer);
  }, [removed]);

  const undoNotice = removed.length ? (
    <div className="highlight-undo" role="status">
      <span>{removed.length > 1 ? "Highlights removed" : "Highlight removed"}</span>
      <button type="button" onClick={() => {
        for (const h of removed) {
          if (!useStore.getState().highlights[h.articleId]?.some(item => item.id === h.id)) addHighlight(h);
        }
        setRemoved([]);
      }}>Undo</button>
      <button type="button" aria-label="Dismiss notification" onClick={() => setRemoved([])}>×</button>
    </div>
  ) : null;
  if (!lens) return undoNotice;

  const run = (action: Action, question?: string) => {
    startStudy(ix, { anchor: lens.anchor, action, question });
    close();
  };

  const short = isShortSelection(lens.anchor.quote);
  const existing = lens.highlightId ? useStore.getState().highlights[ix.article.id]?.find((h) => h.id === lens.highlightId) : undefined;
  const selectedHighlights = (useStore.getState().highlights[ix.article.id] ?? []).filter(h => (lens.highlightIds ?? [lens.highlightId]).includes(h.id));
  const markerColor = MARKERS.find((m) => m.key === marker)?.color;

  // Captions open on the side away from the text, so they never cover what was selected.
  const tipProps = (label: string, hint?: string) => ({
    "data-tip": label,
    "data-tip-hint": hint,
    "data-tip-side": pos?.below ? "bottom" : "top",
  });

  const highlight = (color: Marker) => {
    if (color !== marker) setSettings({ marker: color });
    if (existing) {
      updateHighlight(ix.article.id, existing.id, { color });
    } else {
      addHighlight({ id: uid(), articleId: ix.article.id, anchor: lens.anchor, createdAt: Date.now(), color });
    }
    close();
  };

  const copy = async () => {
    const n = ix.numbers.get(lens.anchor.start.b);
    try {
      await navigator.clipboard.writeText(`\u201c${lens.anchor.quote}\u201d (${ix.article.title}${n ? `, \u00b6${n}` : ""})`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const style = pos ? { left: pos.x, top: pos.y } : { left: -9999, top: -9999 };
  const starters = short ? STARTERS.word : STARTERS.passage;

  return (
    <>
    {undoNotice}
    <div
      ref={boxRef}
      role={lens.mode === "actions" ? "toolbar" : "dialog"}
      aria-label={lens.mode === "ask" ? "Ask about the selection" : lens.mode === "note" ? "A note on the selection" : "Actions for the selection"}
      className="lens fixed z-50"
      data-tip-tone="paper"
      style={{ ...style, ["--origin" as string]: pos?.below ? "top center" : "bottom center" }}
      onMouseDown={(e) => {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") e.preventDefault();
      }}
    >
      <div className="lens-surface relative text-lens-fg">
        {lens.mode === "actions" && existing?.note && !openNote && (
          <button
            type="button"
            onClick={toNote}
            className="mb-1 block w-full max-w-[min(420px,calc(100vw-32px))] rounded-[10px] px-3 pb-2 pt-1.5 text-left font-serif text-[14.5px] leading-[1.45] text-lens-fg/90 transition-colors hover:bg-lens-hover"
          >
            <span className="line-clamp-3 whitespace-pre-line">{existing.note}</span>
          </button>
        )}
        {lens.mode === "note" ? (
          <form
            className="lens-morph w-[min(420px,calc(100vw-24px))]"
            onSubmit={(e) => {
              e.preventDefault();
              saveNote();
              close();
            }}
          >
            <textarea
              ref={noteRef}
              value={draft}
              rows={1}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  close();
                } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  saveNote();
                  close();
                }
              }}
              placeholder={existing ? "A note on this highlight" : "A note, in your own words"}
              aria-label="Your note on the selected passage"
              className="block max-h-[168px] min-h-8 w-full resize-none bg-transparent px-3 pt-[7px] font-serif text-[15px] leading-[1.45] text-lens-fg outline-none focus-visible:outline-none placeholder:text-lens-mute"
            />
            <div className="flex items-center justify-between gap-3 pb-0.5 pl-3 pr-0.5 pt-1">
              <span className="text-[11.5px] text-lens-mute">
                {"\u21b5"} to keep <span className="opacity-60">{"\u00b7"}</span> Shift {"\u21b5"} new line
              </span>
              <button
                type="submit"
                aria-label="Keep note"
                data-tip="Keep"
                data-tip-kbd={"\u21b5"}
                className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-[var(--rubric)] text-white transition-transform active:scale-90"
              >
                <Check size={15} strokeWidth={2.4} />
              </button>
            </div>
          </form>
        ) : lens.mode === "actions" ? (
          <div className="lens-actions">
            <div className="lens-reading-actions">
              <button type="button" onClick={() => toAsk("")} {...tipProps("Ask about this passage", "Or just start typing")} className="lens-btn gap-1.5 px-2.5">
                <MessageCircle size={15} aria-hidden /> Ask
              </button>
              <button type="button" className="lens-btn gap-1.5 px-2.5" {...tipProps("Challenge this idea")} onClick={() => run("counter", composeDiscussionQuestion("challenge", ""))}>
                <Scale size={15} aria-hidden /> Challenge
              </button>
              <button type="button" className="lens-btn gap-1.5 px-2.5" aria-label="Listen from here" {...tipProps("Listen from here")} onClick={() => { const from = lens.anchor.start; close(); useListen.setState({ follow: true }); startListening(ix, from.b, from.o); }}>
                <Play size={14} aria-hidden /> Listen
              </button>
            </div>
            <div className="lens-saving-actions">
              {existing ? (
                <>
                  <div className="flex items-center gap-2 px-2" role="radiogroup" aria-label="Highlight colour">
                    {MARKERS.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        role="radio"
                        aria-checked={(existing.color ?? "yellow") === m.key}
                        aria-label={`${m.label} highlight`}
                        onClick={() => highlight(m.key)}
                        {...tipProps(m.label)}
                        className={`lens-dot ${(existing.color ?? "yellow") === m.key ? "is-on" : ""}`}
                        style={{ background: m.color }}
                      />
                    ))}
                  </div>
                  <LensIcon label={existing.note ? "Edit note" : "Add a note"} tip={tipProps(existing.note ? "Edit note" : "Add a note", existing.note ? undefined : "In your own words")} onClick={toNote}>
                    <PenLine size={15} />
                  </LensIcon>
                  <button
                    type="button"
                    className="lens-btn gap-1.5 px-2.5"
                    onClick={() => {
                      setRemoved(selectedHighlights);
                      for (const h of selectedHighlights) removeHighlight(ix.article.id, h.id);
                      close();
                    }}
                  >
                    <Eraser size={15} aria-hidden />
                    {selectedHighlights.length > 1 ? `Remove highlights (${selectedHighlights.length})` : "Remove highlight"}
                  </button>
                </>
              ) : (
                <LensIcon label="Highlight" tip={tipProps("Highlight")} onClick={() => highlight(marker)}>
                  <span className="relative">
                    <Highlighter size={16} />
                    <span aria-hidden className="absolute -bottom-[3px] -right-[3px] size-[6px] rounded-full ring-2 ring-[var(--lens-bg)]" style={{ background: markerColor }} />
                  </span>
                </LensIcon>
              )}
              {!existing && (
                <LensIcon label="Add a note" tip={tipProps("Add a note", "In your own words")} onClick={toNote}>
                  <PenLine size={15} />
                </LensIcon>
              )}
              <LensIcon label={copied ? "Copied" : "Copy quote"} tip={tipProps(copied ? "Copied" : "Copy quote", "Includes the book title")} onClick={() => { void copy(); }}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </LensIcon>
              <span className="sr-only" role="status">{copied ? "Quote copied" : ""}</span>
            </div>
          </div>
        ) : (
          <form
            className="lens-morph w-[min(500px,calc(100vw-24px))]"
            onSubmit={(e) => {
              e.preventDefault();
              const q = draft.trim();
              if (q) run("ask", q);
            }}
          >
            <div className="flex items-center gap-1.5 pl-3">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                  }
                }}
                placeholder={short ? "Ask about this word" : "Ask about this passage"}
                aria-label="Your question about the selected passage"
                className="h-8 min-w-0 flex-1 bg-transparent text-[14px] text-lens-fg outline-none focus-visible:outline-none placeholder:text-lens-mute"
              />
              <button
                type="submit"
                disabled={!draft.trim()}
                aria-label="Ask"
                data-tip="Ask"
                data-tip-kbd={"\u21b5"}
                className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-[var(--rubric)] text-white transition-[opacity,transform] active:scale-90 disabled:opacity-30"
              >
                <ArrowUp size={16} strokeWidth={2.4} />
              </button>
            </div>
            {!draft && (
              <div className="mt-1 flex flex-wrap gap-1 border-t border-lens-mute/15 px-1 pb-0.5 pt-1.5">
                {starters.map((q, i) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => run("ask", q)}
                    className="lens-starter"
                    style={{ animationDelay: `${60 + i * 40}ms` }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}
        {pos && !pos.docked && (
          <span
            aria-hidden
            className="absolute size-2.5 rotate-45 bg-lens"
            style={{ left: pos.arrow - 5, ...(pos.below ? { top: -4 } : { bottom: -4 }) }}
          />
        )}
      </div>
    </div>
    </>
  );
}

function LensIcon({
  label,
  onClick,
  tip,
  children,
}: {
  label: string;
  onClick: () => void;
  tip?: Record<string, string | undefined>;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} onClick={onClick} {...tip} className="lens-btn lens-icon justify-center text-lens-fg/85 hover:text-lens-fg">
      {children}
    </button>
  );
}
